import {buildRefinedCliffGeometry} from './editor-cliff-mesh.mjs?v=0.9.104';
import {straightenCliffSeams} from './editor-cliff-seams.mjs?v=0.9.87';
import {createTerrainGPULayers} from './editor-terrain-gpu-layers.mjs?v=0.9.85';
import * as THREE from 'three';
import {BIOMES,normalizePlainsCliffImage} from './editor-biome-textures.mjs?v=0.9.110';
import {PLAINS_CLIFF_MAPS} from './editor-texture-catalog.mjs?v=0.9.110';
import {buildCliffBodyHeightmapBuffers} from './editor-cliff-body-heightmap.mjs?v=0.9.105';
import {maskTerrainCliffFaces} from './editor-cliff-surface-replacement.mjs?v=0.9.111';

// Visual materials only: never changes the heightmap, cuts, GLBs or world data.
export function createTerrainTexturePainter({scene,terrain,terrainGeo,material,intangibleMaterial,live,toast,isTesting=()=>false,isHoleAt=()=>false,onCliffsGenerated=()=>{},getTextureAssetUrl=url=>url}){
 const SIZE=630, RES=768;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=RES;
 const ctx=canvas.getContext('2d',{willReadFrequently:false});
 const status=document.getElementById('textureRenderStatus');
 const gpuLayers=createTerrainGPULayers({scene,terrain});
 const surfaceMap=new THREE.CanvasTexture(canvas);
 surfaceMap.colorSpace=THREE.SRGBColorSpace;
 surfaceMap.anisotropy=4;
 const painted=material.clone();painted.vertexColors=false;painted.color.set(0xffffff);painted.map=surfaceMap;painted.needsUpdate=true;
 const paintedGhost=painted.clone();paintedGhost.transparent=true;paintedGhost.opacity=.24;paintedGhost.depthWrite=false;
 const cliffLayer=new THREE.Group();cliffLayer.name='ProceduralCliffMaterials';scene.add(cliffLayer);
 // Cliff materials are part of the actual RENDERED/collision surface. The
 // editable heightfield and its original XYZ indices are preserved.
 let enabled=true,timer=0,generation=0,hasSurface=false,hasCliffs=false;
 let sourceCutGeometry=null,maskedCliffGeometry=null;
 function restoreSourceSurface(){
  if(maskedCliffGeometry){
   if(terrain.geometry===maskedCliffGeometry)
    terrain.geometry=sourceCutGeometry||terrainGeo;
   maskedCliffGeometry.dispose();
   maskedCliffGeometry=null;sourceCutGeometry=null;
  }
 }
 const imageCache=new Map(),loaded=new Map(),heightCache=new Map();
 let plainsStats={zones:0,sourceTriangles:0,subdividedTriangles:0,bodyTriangles:0,moved:0,maxOffset:0,meshes:0,subdivisionRatio:0,heightmapZones:0};
 function heightPixels(url){
  if(!url)return null;
  if(heightCache.has(url))return heightCache.get(url);
  const img=loaded.get(url);if(!img?.width||!img.height)return null;
  try{
   const w=Math.min(img.width,512),h=Math.min(img.height,512);
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(img,0,0,w,h);
   const data=ctx.getImageData(0,0,w,h);
   heightCache.set(url,data);return data;
  }catch(error){console.warn('Heightmap no accesible:',url,error);return null}
 }
 function cliffSeamPaths(){
  const paths=[];
  for(const seam of live.terrainSeams||[]){
   if(seam?.kind!=='cliff')continue;
   const path=(seam.path||seam.vertices||[]).map(id=>seam.anchors?.[id])
    .filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
   if(path.length>1)paths.push(path);
  }
  return paths;
 }
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
   img.src=getTextureAssetUrl(url);
  });
  imageCache.set(url,promise);
  return promise;
 };
 function clearCliffs(){
  restoreSourceSurface();
  const disposed=new Set();
  while(cliffLayer.children.length){
   const mesh=cliffLayer.children[0];cliffLayer.remove(mesh);
   mesh.geometry?.dispose();
   const mat=mesh.material;
   if(mat&&!disposed.has(mat)){
    disposed.add(mat);mat.map?.dispose();mat.dispose();
   }
  }
  hasCliffs=false;
  plainsStats={zones:0,sourceTriangles:0,subdividedTriangles:0,bodyTriangles:0,moved:0,maxOffset:0,meshes:0,subdivisionRatio:0,heightmapZones:0};
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
 function pointInZone(points,p){
  if(!Array.isArray(points)||points.length<3)return false;
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[i],b=points[j];
   if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
 }
 function parentBiome(zone){
  if(!zone.isCliff)return zone.biomeId;
  const parent=(live.zones||[]).find(z=>z.id===zone.cliffParentId&&!z.isCliff);
  return parent?.biomeId||null;
 }
 function buildCliffs(){
  clearCliffs();
  // Terrain.geometry includes any real 3D polygon cuts. Build the physical
  // replacement FROM that geometry, not the uncut 129x129 source grid.
  const originalSurface=terrain.geometry;
  const attr=originalSurface.attributes.position,idx=originalSurface.index;
  const faceCount=Math.floor((idx?.count||attr.count)/3);
  const removedSourceFaces=new Set();
  const getFace=f=>{
   const a=idx?idx.getX(f*3):f*3,b=idx?idx.getX(f*3+1):f*3+1,c=idx?idx.getX(f*3+2):f*3+2;
   return [[attr.getX(a),attr.getY(a),attr.getZ(a)],
    [attr.getX(b),attr.getY(b),attr.getZ(b)],
    [attr.getX(c),attr.getY(c),attr.getZ(c)]];
  };
  let allSource=0,allGenerated=0,zoneCount=0;
  for(const zone of live.zones||[]){
   const biome=parentBiome(zone);
   // A marked cliff must be subdivided even when its parent has no biome or texture.
   if(!zone.isCliff&&!BIOMES.some(b=>b.id===biome))continue;
   const plains=biome==='plains'&&zone.isCliff===true;
   const slots=live.biomeMaterials?.[biome]?.slots||{};
   // Both base and generated color resolve to the SAME currently existing
   // Llanura CUERPO.png. The generated mesh additionally samples HEIGTH.png.
   // Color and height share a single set of UVs and the saved Body scale.
   const generated=plains&&live.cliffHeightmapPlains?.enabled===true;
   const rawColorURL=generated?
    (slots.cliffBodyColor?.image||PLAINS_CLIFF_MAPS.bodyColor):
    (plains?(slots.cliff?.image||PLAINS_CLIFF_MAPS.base):slots.cliff?.image);
   // Normalize even when the texture panel has not finished initializing.
   // This fixes old saved URLs on FIRST RENDER, not only after opening it.
   const colorURL=plains?
    normalizePlainsCliffImage(rawColorURL,generated?'cliffBodyColor':'cliff'):
    rawColorURL;
   const image=loaded.get(colorURL)||null;
   const heightURL=generated?
    (slots.cliffBodyHeight?.image||PLAINS_CLIFF_MAPS.bodyHeight):null;
   const heightmap=heightURL?heightPixels(heightURL):null;
   // Scale belongs to the ACTUAL chosen material. Do not silently apply the
   // Body Color repetition when the original cliff slot is being displayed.
   const visibleScale=Math.max(.25,Math.min(1000,Number(
    generated?slots.cliffBodyColor?.scale:slots.cliff?.scale)||8));
   const legacyFaces=Array.isArray(zone.cliffs)?[...new Set(zone.cliffs.flatMap(c=>
    (Array.isArray(c.faces)?c.faces:[]).filter(f=>Number.isInteger(f)&&f>=0&&f<faceCount)))]:[];
   const triangles=[],sourceFaceIds=[];
   if(zone.isCliff){
    // Only take real grid faces inside this marked cliff polygon.
    for(let f=0;f<faceCount;f++){
     const tri=getFace(f);
     const x=(tri[0][0]+tri[1][0]+tri[2][0])/3;
     const z=(tri[0][2]+tri[1][2]+tri[2][2])/3;
     if(!pointInZone(zone.points,{x,z}))continue;
     const c=[(tri[0][0]+tri[1][0]+tri[2][0])/3,
      (tri[0][1]+tri[1][1]+tri[2][1])/3,
      (tri[0][2]+tri[1][2]+tri[2][2])/3];
     if(!isHoleAt(c[0],c[1],c[2])){triangles.push(tri);sourceFaceIds.push(f)}
    }
   }else{
    // Existing face-based cliffs remain compatible, including older worlds.
    for(const f of legacyFaces){
     const tri=getFace(f);
     const c=tri.reduce((p,v)=>[p[0]+v[0]/3,p[1]+v[1]/3,p[2]+v[2]/3],[0,0,0]);
     if(!isHoleAt(...c))triangles.push(tri);
    }
   }
   if(!triangles.length)continue;
   const zoneSeams=cliffSeamPaths().filter(path=>path.some(p=>
    pointInZone(zone.points,{x:p[0],z:p[2]})));
   // Keep the historical cliff-edge trimming where there is no explicitly
   // locked seam. Never cut away a manually corrected upper/lower rim.
   const aligned=zone.isCliff&&!plains&&!zoneSeams.length?
    straightenCliffSeams(triangles):{triangles,seams:null};
   const source=aligned.triangles;
   if(!source.length)continue;
   const tex=image?new THREE.Texture(image):null;
   if(tex){
    tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
   }
   const mat=new THREE.MeshLambertMaterial({
    map:tex,color:tex?0xffffff:0x8a8575,
    side:THREE.DoubleSide,
    // The old geometry is masked out behind this actual cliff surface.
    // Real depth writing is needed so protruding ridges affect visibility.
    depthTest:true,depthWrite:true,transparent:false
   });
   let zoneGenerated=0,zoneMoved=0,zoneMax=0,zoneMeshes=0;
   // Each source triangle is split at least 3x3 -> 9 triangles.
   // Chunk a large cliff for memory safety WITHOUT lowering resolution.
   const CHUNK=2400;
   for(let start=0;start<source.length;start+=CHUNK){
    const batch=source.slice(start,start+CHUNK);
    const geometry=buildRefinedCliffGeometry(batch,{
     repeat:visibleScale,maxEdge:3,maxTriangles:90000
    });
    if(!geometry)continue;
    const before=geometry.userData.generatedTriangles||geometry.attributes.position.count/3;
    if(before<batch.length*6){
     geometry.dispose();throw Error('Subdivisión insuficiente para acantilado '+zone.id);
    }
    let finalGeometry=geometry,modified=0,offset=0;
    if(heightmap){
     const displaced=buildCliffBodyHeightmapBuffers(geometry,{
      heightmap,strength:live.cliffHeightmapPlains.strength??1.5,
      seamPaths:zoneSeams,protectRadius:2.5
     });
     if(displaced){
      finalGeometry=new THREE.BufferGeometry();
      finalGeometry.setAttribute('position',new THREE.Float32BufferAttribute(displaced.positions,3));
      finalGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(displaced.normals,3));
      finalGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(displaced.uvs,2));
      finalGeometry.computeBoundingBox();finalGeometry.computeBoundingSphere();
      finalGeometry.userData={...geometry.userData};
      modified=displaced.stats.moved;offset=displaced.stats.maxOffset;
      geometry.dispose();
     }
    }
    const mesh=new THREE.Mesh(finalGeometry,mat);
    mesh.name=(plains?'PlainsCliff_Body':'CliffMaterial')+'_'+zone.id+'_'+zoneMeshes;
    mesh.userData.cliffZoneId=zone.id;
    mesh.userData.cliffPart=generated?'Body':(plains?'Base':'Cliff');
    mesh.userData.cliffImage=colorURL;
    mesh.userData.sourceTriangles=batch.length;
    mesh.userData.refinedTriangles=before;
    mesh.userData.repetition=visibleScale;
    mesh.userData.cliffSeams=aligned.seams;
    mesh.renderOrder=4;
    cliffLayer.add(mesh);
    zoneGenerated+=before;zoneMoved+=modified;zoneMax=Math.max(zoneMax,offset);
    zoneMeshes++;
   }
   if(!zoneMeshes){mat.map?.dispose();mat.dispose();continue}
   if(zone.isCliff)for(const face of sourceFaceIds)removedSourceFaces.add(face);
   hasCliffs=true;zoneCount++;
   allSource+=source.length;allGenerated+=zoneGenerated;
   if(plains){
    plainsStats.zones++;
    if(heightmap)plainsStats.heightmapZones++;
    plainsStats.sourceTriangles+=source.length;
    plainsStats.subdividedTriangles+=zoneGenerated;
    plainsStats.bodyTriangles+=zoneGenerated;
    plainsStats.moved+=zoneMoved;
    plainsStats.maxOffset=Math.max(plainsStats.maxOffset,zoneMax);
    plainsStats.meshes+=zoneMeshes;
   }
  }
  plainsStats.subdivisionRatio=plainsStats.sourceTriangles?
   plainsStats.subdividedTriangles/plainsStats.sourceTriangles:0;
  cliffLayer.userData.sourceTriangles=allSource;
  cliffLayer.userData.refinedTriangles=allGenerated;
  cliffLayer.userData.subdivisionRatio=allSource?allGenerated/allSource:0;
  cliffLayer.userData.zones=zoneCount;
  // Replace original faces in the displayed terrain with subdivided and
  // height-displaced triangles. No permanent vertex, seam, save or cut edits.
  // This avoids the original cliff wall hiding the new shape underneath.
  const replaced=maskTerrainCliffFaces(originalSurface,removedSourceFaces);
  if(replaced){
   sourceCutGeometry=originalSurface;
   maskedCliffGeometry=replaced;
   terrain.geometry=replaced;
  }
  cliffLayer.userData.replacedSourceFaces=removedSourceFaces.size;
  cliffLayer.userData.isPhysicalReplacement=Boolean(replaced);
  onCliffsGenerated();
 }
 async function bake(){
  const ticket=++generation;
  if(!enabled)return;
  const zones=(live.zones||[]).filter(z=>BIOMES.some(b=>b.id===parentBiome(z))&&Array.isArray(z.points)&&z.points.length>=3);
  const urls=new Set();
  for(const z of zones){
   // Load all configured images; the stable base material remains separate
   // from the three optional procedural complement overlays.
   const slots=live.biomeMaterials?.[parentBiome(z)]?.slots;
   for(const key of ['ground','detail1','detail2','detail3','cliff'])
    if(slots?.[key]?.image)urls.add(slots[key].image);
  }
  // The base and Body Color both point to CUERPO.png on current GitHub.
  // Load the canonical color as a safe fallback for older saved references.
  // Do not depend on a separate -COLOR.png file (it does not exist).
  if(zones.some(z=>z.isCliff&&parentBiome(z)==='plains')){
   const slots=live.biomeMaterials?.plains?.slots||{};
   urls.add(PLAINS_CLIFF_MAPS.base);
   if(slots.cliffBodyColor?.image)urls.add(slots.cliffBodyColor.image);
   if(live.cliffHeightmapPlains?.enabled===true)
    urls.add(slots.cliffBodyHeight?.image||PLAINS_CLIFF_MAPS.bodyHeight);
  }
  await Promise.all([...urls].map(async url=>loaded.set(url,await decode(url))));
  if(ticket!==generation)return;
  // The old 768x768 baked terrain map turned 200 repeats into just 3.84
  // pixels per tile. All terrain detail is now sampled from the source PNG
  // directly by the GPU. The 768px masks only identify geographic zones.
  gpuLayers.build({zones:live.zones||[],materials:live.biomeMaterials,loaded,enabled});
  hasSurface=gpuLayers.count()>0;
  if(status)status.textContent=hasSurface?
   'Suelos base intactos · capas complementarias independientes · '+gpuLayers.count()+' capas GPU.':
   'Sin texturas de terreno para las zonas asignadas.';
  buildCliffs();apply();
  const output=document.getElementById('plainsCliffStatus');
  if(output)output.textContent=plainsStats.zones?
   (plainsStats.zones+' zonas · '+plainsStats.sourceTriangles+' → '+
    plainsStats.subdividedTriangles+' triángulos (x'+
    plainsStats.subdivisionRatio.toFixed(1)+') · '+
    (live.cliffHeightmapPlains?.enabled?
     (plainsStats.heightmapZones?
      (plainsStats.moved?
       plainsStats.moved+' vértices desplazados · heightmap aplicado':
       '⚠ Heightmap cargado, sin desplazamiento'):
      '⚠ Heightmap no cargado'):'Relieve no generado')):
   'No hay zonas de acantilado de Llanura';
 }
 function apply(){
  // Transparency is not used for terrain; only replace material when surface imagery exists.
  terrain.material=(live.settings?.terrainIntangible&&!isTesting()?intangibleMaterial:material);
  gpuLayers.sync(enabled&&!(live.settings?.terrainIntangible&&!isTesting()));
  cliffLayer.visible=enabled&&hasCliffs&&terrain.visible;
 }
 function schedule(){
  clearTimeout(timer);timer=setTimeout(()=>{void bake().catch(e=>toast('Error al generar texturas: '+e.message))},180);
 }
 function setEnabled(next){enabled=Boolean(next);if(enabled)schedule();else{hasSurface=false;gpuLayers.clear();clearCliffs();apply()}}
 function refreshCliffs(){if(!enabled)return;buildCliffs();apply()}
 function invalidateTextureImages(){
  // Stable filenames may now serve NEW PNG content. Discard decoded images,
  // cached height pixels and old promises, but keep the current scene visible
  // until freshly loaded textures can replace the GPU layers and cliff meshes.
  ++generation;
  imageCache.clear();
  heightCache.clear();
  loaded.clear();
  if(enabled)schedule();
 }
 function dispose(){clearTimeout(timer);gpuLayers.clear();clearCliffs();surfaceMap.dispose();painted.dispose();paintedGhost.dispose();}
 return {schedule,apply,refreshCliffs,invalidateTextureImages,setEnabled,dispose,
  collisionRoot:()=>cliffLayer,
  getCliffSubdivisionStats:()=>({...cliffLayer.userData}),
  getPhysicalSurfaceStats:()=>({
   replacedFaces:cliffLayer.userData.replacedSourceFaces||0,
   originalFaces:sourceCutGeometry?
    Math.floor((sourceCutGeometry.index?.count||
      sourceCutGeometry.attributes.position.count)/3):0,
   remainingFaces:terrain.geometry.userData.wildtrapRemainingFaces??0,
   activeFaces:cliffLayer.children.reduce((n,m)=>n+
     Math.floor((m.geometry.index?.count||m.geometry.attributes.position.count)/3),0),
   sourceUnchanged:sourceCutGeometry!==null&&terrainGeo!==terrain.geometry
  }),
  getPlainsCliffStats:()=>({...plainsStats})};
}