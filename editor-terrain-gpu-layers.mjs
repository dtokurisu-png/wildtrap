import * as THREE from 'three';
import {createFeatheredZoneMask} from './terrain-zone-feather.mjs?v=0.9.124';

// SAFE TERRAIN RENDERER: one full-resolution ground PNG per biome.
// Complementary decals are intentionally disabled until the base passes
// visual testing. The canvas is ONLY the alpha mask of each geographic zone;
// the PNG itself is sampled directly by the GPU at the saved repeat scale.
const WORLD=630, MASK_RES=768;
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
const VERTEX=`
#include <fog_pars_vertex>
varying vec2 vTerrainXZ;
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
void main(){
 vec4 worldPoint=modelMatrix*vec4(position,1.0);
 vTerrainXZ=worldPoint.xz;
 vTerrainWorld=worldPoint.xyz;
 vTerrainNormal=normalize(mat3(modelMatrix)*normal);
 vec4 mvPosition=viewMatrix*worldPoint;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const FRAGMENT=`
#include <fog_pars_fragment>
uniform sampler2D baseTexture;
uniform sampler2D regionMask;
uniform float repeats;
uniform float intensity;
varying vec2 vTerrainXZ;
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
void main(){
 vec2 maskUV=vec2(vTerrainXZ.x/630.0+.5,.5-vTerrainXZ.y/630.0);
 float alpha=texture2D(regionMask,maskUV).a;
 if(alpha<.004)discard;
 float steep=1.0-abs(normalize(vTerrainNormal).y);
 float wallMix=smoothstep(.27,.78,steep);
 vec2 sourceUV=vTerrainXZ/630.0*repeats;
 vec2 wallUV=vec2(abs(vTerrainNormal.x)>abs(vTerrainNormal.z)?vTerrainWorld.z:vTerrainWorld.x,vTerrainWorld.y)/630.0*repeats;
 vec3 ground=texture2D(baseTexture,sourceUV).rgb;
 vec3 wallGround=texture2D(baseTexture,wallUV).rgb;
 vec3 normalDirection=normalize(vTerrainNormal);
 float sun=max(dot(normalDirection,normalize(vec3(-.46,.80,.34))),0.0);
 float illumination=.77+.32*sun;
 gl_FragColor=vec4(mix(ground,wallGround,wallMix)*illumination,alpha*intensity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;
// A separate transparent pass. It cannot affect the base shader or its
// visibility even if detail artwork fails to load. One sampler per pass keeps
// the material compatible with WebGL 1 as well as WebGL 2.
const DETAIL_FRAGMENT=`
#include <fog_pars_fragment>
uniform sampler2D detailTexture;
uniform sampler2D regionMask;
uniform float repeats;
uniform float variationSeed;
uniform float slotNumber;
uniform float intensity;
varying vec2 vTerrainXZ;
varying vec3 vTerrainNormal;
float rand2(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
void main(){
 vec2 maskUV=vec2(vTerrainXZ.x/630.0+.5,.5-vTerrainXZ.y/630.0);
 float inside=texture2D(regionMask,maskUV).a;
 if(inside<.01)discard;
 // 60% of the candidates at the saved repetition scale.
 // E.g. repeats=200 means ~24,000 appearances per detail across full map.
 float columns=max(1.0,floor(repeats+.5));
 float probability=0.60;
 vec2 unit=(vTerrainXZ+315.0)/630.0*columns;
 vec2 origin=floor(unit);
 float cellSize=630.0/columns;
 float extent=630.0/max(repeats,.25);
 // Neighboring candidate cells must also be tested. Otherwise a randomly
 // offset texture would get chopped off at its cell boundary, leaving
 // visible square edges even with a correct alpha mask.
 vec3 premultiplied=vec3(0.0);
 float combinedAlpha=0.0;
 for(int dy=-1;dy<=1;dy++){
  for(int dx=-1;dx<=1;dx++){
   vec2 cell=origin+vec2(float(dx),float(dy));
   if(cell.x<0.0||cell.y<0.0||cell.x>=columns||cell.y>=columns)continue;
   vec2 id=cell+vec2(variationSeed*.117+slotNumber*17.3,variationSeed*.071+slotNumber*31.9);
   if(rand2(id+43.0)>probability)continue;
   vec2 jitter=vec2(rand2(id+12.0),rand2(id+25.0));
   vec2 center=-315.0+(cell+.12+.76*jitter)*cellSize;
   // Texture UV is centered on its OWN image, never a cell corner.
   vec2 uv=(vTerrainXZ-center)/extent+vec2(.5);
   if(uv.x<=0.0||uv.y<=0.0||uv.x>=1.0||uv.y>=1.0)continue;
   // Full central opacity from 0 to half the image radius (axis distance
   // 0.0..0.5). Fade in BOTH axes between half-radius and outer image edge.
   vec2 normalizedDistance=abs(uv-vec2(.5))*2.0;
   vec2 fadeAxis=1.0-smoothstep(vec2(.5),vec2(1.0),normalizedDistance);
   float feather=fadeAxis.x*fadeAxis.y;
   if(feather<.002)continue;
   vec4 sampleColor=texture2D(detailTexture,uv);
   float patchOpacity=.5+.3*rand2(id+94.0);
   float alpha=inside*sampleColor.a*feather*patchOpacity*intensity;
   if(alpha<.002)continue;
   // Composite overlapping patches WITHOUT truncating neighbors at tile edges.
   premultiplied=sampleColor.rgb*alpha+premultiplied*(1.0-alpha);
   combinedAlpha=alpha+combinedAlpha*(1.0-alpha);
  }
 }
 if(combinedAlpha<.002)discard;
 float sun=max(dot(normalize(vTerrainNormal),normalize(vec3(-.46,.80,.34))),0.0);
 gl_FragColor=vec4(premultiplied/max(combinedAlpha,.0001)*(.77+.32*sun),combinedAlpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
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
 let records=[],shadowMesh=null,shadowMaterial=null;
 function clear(){
  // Prevent accumulated invisible duplicate shadow receivers after biome rebakes.
  if(shadowMesh){scene.remove(shadowMesh);shadowMesh=null}
  if(shadowMaterial){shadowMaterial.dispose();shadowMaterial=null}
  const releasedMasks=new Set();
  for(const entry of records){
   scene.remove(entry.mesh);
   if(!releasedMasks.has(entry.mask)){entry.mask.dispose();releasedMasks.add(entry.mask)}
   entry.texture.dispose();
   entry.material.dispose();
  }
  records=[];
 }
 function build({zones,materials,loaded,enabled=true,transitionWorld=14}){
  clear();
  if(!enabled)return;
  const biomes=new Map();
  const allZones=Array.isArray(zones)?zones:[];
  const parents=new Map(allZones.filter(z=>!z.isCliff).map(z=>[z.id,z]));
  for(const zone of allZones){
   if(zone.isCliff||!zone.biomeId||!Array.isArray(zone.points)||zone.points.length<3)continue;
   const config=materials?.[zone.biomeId];
   const base=config?.slots?.ground;
   if(!loaded.get(base?.image))continue;
   if(!biomes.has(zone.biomeId))biomes.set(zone.biomeId,[]);
   biomes.get(zone.biomeId).push(zone);
  }
  for(const cliff of allZones){
   if(!cliff.isCliff||!Array.isArray(cliff.points)||cliff.points.length<3)continue;
   const parent=parents.get(cliff.cliffParentId);
   if(parent?.biomeId&&biomes.has(parent.biomeId))biomes.get(parent.biomeId).push(cliff);
  }
  for(const [biome,areas] of biomes){
   const slot=materials[biome].slots.ground;
   const image=loaded.get(slot.image);
   if(!image)continue;
   const mask=createFeatheredZoneMask(areas,{featherWorld:limit(transitionWorld,10,45),expandWorld:4});
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
     ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
     baseTexture:{value:texture},
     regionMask:{value:mask},
     repeats:{value:limit(Number(slot.scale)||8,.25,1000)},
      intensity:{value:limit(Number.isFinite(Number(slot.opacity))?Number(slot.opacity):1,0,1)}
    },
    vertexShader:VERTEX,fragmentShader:FRAGMENT,fog:true,
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
   // Add three separate, optional complementary layers on top of the base.
   // Their shaders use the SAME zone mask and terrain geometry, but never
   // modify the base material. ?noDetails=1 is an instant safe fallback.
   const detailsEnabled=!new URLSearchParams(window.location.search).has('noDetails');
   if(!detailsEnabled)continue;
   for(let i=1;i<=3;i++){
    const detailSlot=materials[biome].slots['detail'+i];
    const detailImage=loaded.get(detailSlot?.image);
    if(!detailImage)continue;
    const opacity=limit(Number(detailSlot?.opacity??.5),0,1);
    if(opacity<=0)continue;
    const detailTexture=new THREE.Texture(fullResolutionSource(detailImage));
    detailTexture.wrapS=detailTexture.wrapT=THREE.ClampToEdgeWrapping;
    detailTexture.colorSpace=THREE.SRGBColorSpace;
    detailTexture.minFilter=THREE.LinearMipmapLinearFilter;
    detailTexture.magFilter=THREE.LinearFilter;
    detailTexture.generateMipmaps=true;
    detailTexture.anisotropy=8;
    detailTexture.needsUpdate=true;
    const detailMaterial=new THREE.ShaderMaterial({
     uniforms:{
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      regionMask:{value:mask},
      detailTexture:{value:detailTexture},
      repeats:{value:limit(Number(detailSlot.scale)||8,.25,1000)},
      variationSeed:{value:Number(materials[biome].noise?.seed)||1},
      slotNumber:{value:i},
      intensity:{value:opacity}
     },
     vertexShader:VERTEX,fragmentShader:DETAIL_FRAGMENT,fog:true,
     side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:true,
     polygonOffset:true,polygonOffsetFactor:-3-i,polygonOffsetUnits:-3-i
    });
    const detailMesh=new THREE.Mesh(terrain.geometry,detailMaterial);
    detailMesh.name='BiomeComplement '+biome+' '+i;
    detailMesh.renderOrder=3+i*.01;
    detailMesh.frustumCulled=false;
    scene.add(detailMesh);
    records.push({mesh:detailMesh,mask,texture:detailTexture,material:detailMaterial});
   }
  }
  if(records.length){
   // One transparent shadow-catching pass AFTER the painted biome and cliff layers.
   // Unlike the original unlit shader, ShadowMaterial receives real sun shadows.
   shadowMaterial=new THREE.ShadowMaterial({color:0x1a231e,opacity:.55,side:THREE.DoubleSide});
   // Receive the same real sunlight shadows on walkable ground AND cliff walls.
   // Do not discard steep normals: it makes vertical terrain unnaturally shadowless.
   shadowMaterial.polygonOffset=true;
   shadowMaterial.polygonOffsetFactor=-10;
   shadowMaterial.polygonOffsetUnits=-10;
   shadowMesh=new THREE.Mesh(terrain.geometry,shadowMaterial);
   shadowMesh.name='TerrainSoftSunShadows';
   shadowMesh.receiveShadow=true;shadowMesh.castShadow=false;
   shadowMesh.renderOrder=11;shadowMesh.frustumCulled=false;
   scene.add(shadowMesh);
  }
 }
 function sync(visible=true){
  if(shadowMesh){shadowMesh.geometry=terrain.geometry;shadowMesh.visible=Boolean(visible&&terrain.visible)}
  for(const entry of records){
   entry.mesh.geometry=terrain.geometry;
   entry.mesh.visible=Boolean(visible&&terrain.visible);
  }
 }
 return {build,sync,clear,count:()=>records.length};
}
