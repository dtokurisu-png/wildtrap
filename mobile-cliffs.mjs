import * as THREE from 'three';
import {buildCliffHeightmapGeometry} from './cliff-heightmap-geometry.mjs?v=0.9.123';
import {registeredCliffZones,cliffRepeatCount} from './cliff-zone-bindings.mjs?v=0.9.123';
import {createCliffColorRenderer} from './cliff-color-renderer.mjs?v=0.9.142';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
async function sampleCliff(file,getTextureAssetUrl){
 const image=new Image();
 await new Promise((resolve,reject)=>{
  image.onload=resolve;image.onerror=()=>reject(Error('Heightmap no disponible: '+file));
  image.src=getTextureAssetUrl('./assets/terrain/texturas/'+encodeURIComponent(file));
 });
 const canvas=document.createElement('canvas'),ratio=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight,1));
 canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
 canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas2D no disponible');
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height;
 const pixel=(x,y)=>{const k=((((y%h)+h)%h)*w+(((x%w)+w)%w))*4;return(data[k]*.2126+data[k+1]*.7152+data[k+2]*.0722)/255};
 return(u,v)=>{
  const x=(((u%1)+1)%1)*w,y=(((v%1)+1)%1)*h,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  return pixel(ix,iy)*(1-tx)*(1-ty)+pixel(ix+1,iy)*tx*(1-ty)+pixel(ix,iy+1)*(1-tx)*ty+pixel(ix+1,iy+1)*tx*ty;
 };
}
function geometryData(g){
 return{positions:g.getAttribute('position').array,indices:g.index?.array,
  uvs:g.getAttribute('uv')?.array,colors:g.getAttribute('color')?.array};
}
function geometryFrom(r){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(r.positions,3));
 if(r.uvs)g.setAttribute('uv',new THREE.BufferAttribute(r.uvs,2));
 if(r.colors)g.setAttribute('color',new THREE.BufferAttribute(r.colors,3));
 g.setIndex(new THREE.BufferAttribute(r.indices,1));
 g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();return g;
}
export async function applyMobileCliffs({terrain,scene,live,getTextureAssetUrl=u=>u}){
 const config=live.cliffHeightSettings||{},entries=registeredCliffZones(live);
 let working=terrain.geometry;const samples=new Map();let count=0;
 if(config.enabled!==false)for(const entry of entries.filter(e=>e.map)){
  try{
   if(!samples.has(entry.map.file))samples.set(entry.map.file,await sampleCliff(entry.map.file,getTextureAssetUrl));
   const p=entry.zone.points,xs=p.map(q=>q.x),zs=p.map(q=>q.z),b=config.biomes?.[entry.map.biome]||{};
   const output=buildCliffHeightmapGeometry(geometryData(working),{
    point:{x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2},
    normalXZ:[1,0],zonePoints:p,radius:Math.max(3,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))),
    strength:clamp(Number(b.strength??config.strength??3),0,12),
    period:630/cliffRepeatCount(live,entry.map.biome),steps:clamp(Number(b.steps??config.steps??2),1,3),
    smoothing:clamp(Number(b.smoothing??config.smoothing??.55),0,1),
    peakFlatten:clamp(Number(b.peakFlatten??config.peakFlatten??.4),0,1),
    sample:samples.get(entry.map.file)
   });
   if(output){const next=geometryFrom(output);if(working!==terrain.geometry)working.dispose();working=next;count++}
  }catch(err){console.warn('WildTrap: acantilado sin relieve',entry.zone.id,err)}
 }
 if(working!==terrain.geometry){terrain.geometry.dispose();terrain.geometry=working}
 const colors=createCliffColorRenderer({scene,terrain,live,getTextureAssetUrl});
 colors.setVisible(live.settings?.biomeTexturesVisible!==false);
 await colors.rebuild();
 return {count,colors};
}
