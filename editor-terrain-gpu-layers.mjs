import * as THREE from 'three';

// SAFE TERRAIN RENDERER: one full-resolution ground PNG per biome.
// Complementary decals are intentionally disabled until the base passes
// visual testing. The canvas is ONLY the alpha mask of each geographic zone;
// the PNG itself is sampled directly by the GPU at the saved repeat scale.
const WORLD=630, MASK_RES=768;
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
function zoneMask(zones){
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=MASK_RES;
 const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,MASK_RES,MASK_RES);
 ctx.fillStyle='#fff';
 for(const zone of zones){
  if(!Array.isArray(zone.points)||zone.points.length<3)continue;
  ctx.beginPath();
  for(let i=0;i<zone.points.length;i++){
   const point=zone.points[i];
   const x=(point.x/WORLD+.5)*MASK_RES;
   const y=(point.z/WORLD+.5)*MASK_RES;
   if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
 }
 const mask=new THREE.CanvasTexture(canvas);
 mask.colorSpace=THREE.NoColorSpace;
 mask.minFilter=THREE.LinearFilter;mask.magFilter=THREE.LinearFilter;
 mask.generateMipmaps=false;
 return mask;
}
const VERTEX=`
varying vec2 vTerrainXZ;
void main(){
 vec4 worldPoint=modelMatrix*vec4(position,1.0);
 vTerrainXZ=worldPoint.xz;
 gl_Position=projectionMatrix*viewMatrix*worldPoint;
}`;
const FRAGMENT=`
uniform sampler2D baseTexture;
uniform sampler2D regionMask;
uniform float repeats;
varying vec2 vTerrainXZ;
void main(){
 vec2 maskUV=vec2(vTerrainXZ.x/630.0+.5,.5-vTerrainXZ.y/630.0);
 float alpha=texture2D(regionMask,maskUV).a;
 if(alpha<.01)discard;
 vec2 sourceUV=vTerrainXZ/630.0*repeats;
 gl_FragColor=vec4(texture2D(baseTexture,sourceUV).rgb,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
function fullResolutionSource(image){
 if(Math.max(image.width||0,image.height||0)<=4096)return image;
 // Cap extremely large PNGs to keep GPU texture allocations reasonable.
 const ratio=4096/Math.max(image.width,image.height);
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.width*ratio));
 canvas.height=Math.max(1,Math.round(image.height*ratio));
 const ctx=canvas.getContext('2d');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return canvas;
}
export function createTerrainGPULayers({scene,terrain}){
 let records=[];
 function clear(){
  for(const entry of records){
   scene.remove(entry.mesh);
   entry.mask.dispose();
   entry.texture.dispose();
   entry.material.dispose();
  }
  records=[];
 }
 function build({zones,materials,loaded,enabled=true}){
  clear();
  if(!enabled)return;
  const biomes=new Map();
  for(const zone of zones||[]){
   if(zone.isCliff||!zone.biomeId||!Array.isArray(zone.points)||zone.points.length<3)continue;
   const config=materials?.[zone.biomeId];
   const base=config?.slots?.ground;
   if(!loaded.get(base?.image))continue;
   if(!biomes.has(zone.biomeId))biomes.set(zone.biomeId,[]);
   biomes.get(zone.biomeId).push(zone);
  }
  for(const [biome,areas] of biomes){
   const slot=materials[biome].slots.ground;
   const image=loaded.get(slot.image);
   if(!image)continue;
   const mask=zoneMask(areas);
   const texture=new THREE.Texture(fullResolutionSource(image));
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.colorSpace=THREE.SRGBColorSpace;
   texture.minFilter=THREE.LinearMipmapLinearFilter;
   texture.magFilter=THREE.LinearFilter;
   texture.anisotropy=8;
   texture.generateMipmaps=true;
   texture.needsUpdate=true;
   const shader=new THREE.ShaderMaterial({
    uniforms:{
     baseTexture:{value:texture},
     regionMask:{value:mask},
     repeats:{value:limit(Number(slot.scale)||8,.25,1000)}
    },
    vertexShader:VERTEX,fragmentShader:FRAGMENT,
    side:THREE.DoubleSide,
    transparent:true,depthWrite:false,depthTest:true,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2
   });
   const mesh=new THREE.Mesh(terrain.geometry,shader);
   mesh.name='BiomeGroundSafe '+biome;
   mesh.renderOrder=3;mesh.frustumCulled=false;
   // Not editorOnly: the same material MUST appear while playing.
   scene.add(mesh);
   records.push({mesh,mask,texture,material:shader});
  }
 }
 function sync(visible=true){
  for(const entry of records){
   entry.mesh.geometry=terrain.geometry;
   entry.mesh.visible=Boolean(visible&&terrain.visible);
  }
 }
 return {build,sync,clear,count:()=>records.length};
}
