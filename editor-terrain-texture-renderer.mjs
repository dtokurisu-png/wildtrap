import * as THREE from 'three';
import {BIOMES} from './editor-biome-textures.mjs?v=0.9.25';

// Visual materials only: never changes the heightmap, cuts, GLBs or world data.
export function createTerrainTexturePainter({scene,terrain,terrainGeo,material,intangibleMaterial,live,toast}){
 const SIZE=630, RES=768;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=RES;
 const ctx=canvas.getContext('2d',{willReadFrequently:false});
 const surfaceMap=new THREE.CanvasTexture(canvas);
 surfaceMap.colorSpace=THREE.SRGBColorSpace;
 surfaceMap.anisotropy=4;
 const painted=material.clone();painted.vertexColors=false;painted.color.set(0xffffff);painted.map=surfaceMap;painted.needsUpdate=true;
 const paintedGhost=painted.clone();paintedGhost.transparent=true;paintedGhost.opacity=.24;paintedGhost.depthWrite=false;
 const cliffLayer=new THREE.Group();cliffLayer.name='ProceduralCliffMaterials';scene.add(cliffLayer);
 cliffLayer.userData.editorOnly=true;
 let enabled=true,timer=0,generation=0,hasSurface=false,hasCliffs=false;
 const imageCache=new Map(),loaded=new Map();
 const worldToPixel=(x,z)=>[(x/SIZE+.5)*RES,(z/SIZE+.5)*RES];
 const pointIn=(poly,x,z)=>{
  let within=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)within=!within;
  }
  return within;
 };
 const decode=url=>{
  if(!url)return Promise.resolve(null);
  if(imageCache.has(url))return imageCache.get(url);
  const promise=new Promise(resolve=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>resolve(null);
   img.src=url;
  });
  imageCache.set(url,promise);
  return promise;
 };
 function clearCliffs(){
  while(cliffLayer.children.length){
   const mesh=cliffLayer.children[0];cliffLayer.remove(mesh);
   mesh.geometry?.dispose();mesh.material?.dispose();
  }
  hasCliffs=false;
 }
 function polygon(ctx,points){
  if(!Array.isArray(points)||points.length<3)return false;
  ctx.beginPath();
  points.forEach((p,i)=>{const [x,y]=worldToPixel(p.x,p.z);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
  ctx.closePath();return true;
 }
 function fillTiled(context,img,repeat){
  if(!img?.width||!img?.height)return;
  const tile=RES/Math.max(.25,Number(repeat)||8);
  // Pattern in canvas pixel space: tiled but does not stretch along terrain.
  const pattern=context.createPattern(img,'repeat');
  if(!pattern)return;
  pattern.setTransform(new DOMMatrix().scale(tile/img.width,tile/img.height));
  context.fillStyle=pattern;context.fillRect(0,0,RES,RES);
 }
 // Layer is masked by the polygon and feathered at the boundary.
 function blendZone(zone,config,index){
  const layer=document.createElement('canvas');layer.width=layer.height=RES;
  const c=layer.getContext('2d');
  const slots=config.slots||{};
  const base=loaded.get(slots.ground?.image);
  c.fillStyle=['#697c5e','#c1a676','#8a9862','#5b7060','#53735c'][index]||'#697c5e';
  c.fillRect(0,0,RES,RES);
  if(base)fillTiled(c,base,slots.ground.scale);
  for(let i=1;i<=3;i++){
   const slot=slots['detail'+i],img=loaded.get(slot?.image);
   if(!img)continue;
   const noise=document.createElement('canvas');noise.width=noise.height=RES;
   const nc=noise.getContext('2d');
   fillTiled(nc,img,slot.scale);
   nc.globalCompositeOperation='destination-in';
   const grid=Math.max(10,Math.round(RES/Math.max(2,Number(config.noise?.scale)||20)));
   const seed=(config.noise?.seed||1)*37+i*991;
   for(let y=0;y<RES;y+=grid)for(let x=0;x<RES;x+=grid){
    const n=Math.sin((x+1)*12.9898+(y+1)*78.233+seed)*43758.5453;
    const v=n-Math.floor(n);
    nc.fillStyle='rgba(0,0,0,'+(v>.25?Math.min(1,(v-.25)*1.4):0)+')';
    nc.fillRect(x,y,grid+1,grid+1);
   }
   c.globalAlpha=Math.max(0,Math.min(1,Number(slot.opacity)||0));
   c.drawImage(noise,0,0);
   c.globalAlpha=1;
  }
  const mask=document.createElement('canvas');mask.width=mask.height=RES;
  const mc=mask.getContext('2d');
  const feather=Math.max(0,Number(config.edgeBlend)||0)*RES/SIZE;
  mc.fillStyle='#fff';
  if(polygon(mc,zone.points)){
   mc.save();
   mc.shadowColor='#fff';mc.shadowBlur=feather*2;
   mc.fill();
   mc.restore();
  }
  c.globalCompositeOperation='destination-in';
  c.drawImage(mask,0,0);
  c.globalCompositeOperation='source-over';
  ctx.drawImage(layer,0,0);
 }
 function buildCliffs(){
  clearCliffs();
  const attr=terrainGeo.attributes.position,idx=terrainGeo.index;
  const faceCount=Math.floor((idx?.count||attr.count)/3);
  const getFace=f=>{
   const a=idx?idx.getX(f*3):f*3,b=idx?idx.getX(f*3+1):f*3+1,c=idx?idx.getX(f*3+2):f*3+2;
   return [[attr.getX(a),attr.getY(a),attr.getZ(a)],[attr.getX(b),attr.getY(b),attr.getZ(b)],[attr.getX(c),attr.getY(c),attr.getZ(c)]];
  };
  for(const zone of live.zones||[]){
   const slot=live.biomeMaterials?.[zone.biomeId]?.slots?.cliff;
   const img=loaded.get(slot?.image);
   if(!img)continue;
   const faces=[...new Set((zone.cliffs||[]).flatMap(c=>Array.isArray(c.faces)?c.faces:[])
    .filter(f=>Number.isInteger(f)&&f>=0&&f<faceCount))];
   if(!faces.length)continue;
   const verts=[],uvs=[];
   const scale=Math.max(.25,Number(slot.scale)||8);
   for(const f of faces){
    const tri=getFace(f);
    const a=new THREE.Vector3(...tri[0]),b=new THREE.Vector3(...tri[1]),c=new THREE.Vector3(...tri[2]);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    // Project walls along the dominant horizontal normal, never top-down.
    const useX=Math.abs(normal.x)>Math.abs(normal.z);
    for(const p of tri){
     verts.push(p[0]+normal.x*.085,p[1]+normal.y*.085,p[2]+normal.z*.085);
     uvs.push((useX?p[2]:p[0])*scale/SIZE,p[1]*scale/SIZE);
    }
   }
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
   geometry.computeVertexNormals();
   const tex=new THREE.Texture(img);tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;
   tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;
   const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({
    map:tex,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,
    depthWrite:false,transparent:true,opacity:1
   }));
   mesh.renderOrder=4;mesh.userData.editorOnly=true;
   cliffLayer.add(mesh);hasCliffs=true;
   mesh.userData.disposeTexture=tex;
  }
 }
 async function bake(){
  const ticket=++generation;
  if(!enabled)return;
  const zones=(live.zones||[]).filter(z=>BIOMES.some(b=>b.id===z.biomeId)&&Array.isArray(z.points)&&z.points.length>=3);
  const urls=new Set();
  for(const z of zones){
   for(const slot of Object.values(live.biomeMaterials?.[z.biomeId]?.slots||{}))if(slot?.image)urls.add(slot.image);
  }
  await Promise.all([...urls].map(async url=>loaded.set(url,await decode(url))));
  if(ticket!==generation)return;
  ctx.clearRect(0,0,RES,RES);
  // Preserve original untextured ground outside assigned regions (alpha canvas).
  let active=false;
  for(const z of zones){
   const config=live.biomeMaterials?.[z.biomeId];
   if(!config)continue;
   const biomeIndex=BIOMES.findIndex(b=>b.id===z.biomeId);
   // Render only where at least one ground/detail image exists.
   if(!['ground','detail1','detail2','detail3'].some(id=>loaded.get(config.slots?.[id]?.image)))continue;
   blendZone(z,config,biomeIndex);active=true;
  }
  hasSurface=active;
  surfaceMap.needsUpdate=true;
  buildCliffs();apply();
 }
 function apply(){
  // Transparency is not used for terrain; only replace material when surface imagery exists.
  terrain.material=hasSurface?(live.settings?.terrainIntangible?paintedGhost:painted):
   (live.settings?.terrainIntangible?intangibleMaterial:material);
  cliffLayer.visible=enabled&&hasCliffs&&terrain.visible;
 }
 function schedule(){
  clearTimeout(timer);timer=setTimeout(()=>{void bake().catch(e=>toast('Error al generar texturas: '+e.message))},180);
 }
 function setEnabled(next){enabled=Boolean(next);if(enabled)schedule();else{hasSurface=false;clearCliffs();apply()}}
 function refreshCliffs(){if(!enabled)return;buildCliffs();apply()}
 function dispose(){clearTimeout(timer);clearCliffs();surfaceMap.dispose();painted.dispose();paintedGhost.dispose();}
 return {schedule,apply,refreshCliffs,setEnabled,dispose};
}