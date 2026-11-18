import * as THREE from 'three';
import {createFeatheredZoneMask} from './terrain-zone-feather.mjs?v=0.9.124';
import {CLIFF_ASSETS,registeredCliffZones,cliffRepeatCount} from './cliff-zone-bindings.mjs?v=0.9.123';
const WORLD=630,RES=768;
const path=file=>'./assets/terrain/texturas/'+encodeURIComponent(file);
const CLAMP=(v,a,b)=>Math.max(a,Math.min(b,v));
const vertexShader=`
#include <fog_pars_vertex>
varying vec3 worldPosition;
varying vec3 worldNormal;
void main(){
 vec4 wp=modelMatrix*vec4(position,1.0);
 worldPosition=wp.xyz;
 worldNormal=normalize(mat3(modelMatrix)*normal);
 vec4 mvPosition=viewMatrix*wp;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const fragmentShader=`
#include <fog_pars_fragment>
uniform sampler2D cliffTexture;
uniform sampler2D cliffMask;
uniform float cliffRepeats;
uniform float intensity;
uniform float heightmapAligned;
varying vec3 worldPosition;
varying vec3 worldNormal;
void main(){
 vec3 n=normalize(worldNormal);
 float verticality=1.0-abs(n.y);
 float wallBlend=smoothstep(.10,.74,verticality);
 if(wallBlend<.004)discard;
 vec2 maskUV=vec2(worldPosition.x/630.0+.5,.5-worldPosition.z/630.0);
 float inside=texture2D(cliffMask,maskUV).a;
 if(inside<.004)discard;
 float tangent=heightmapAligned>.5?worldPosition.z:(abs(n.x)>=abs(n.z)?worldPosition.z:worldPosition.x);
 vec2 colorUV=vec2(tangent,worldPosition.y)*(cliffRepeats/630.0);
 vec4 color=texture2D(cliffTexture,colorUV);
 float alpha=inside*wallBlend*color.a*intensity;
 if(alpha<.01)discard;
 float sun=max(dot(n,normalize(vec3(-.46,.80,.34))),0.0);
 gl_FragColor=vec4(color.rgb*(.77+.32*sun),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;
export function createCliffColorRenderer({scene,terrain,live,getTextureAssetUrl=u=>u}){
 const textures=new Map();let records=[],ticket=0,disposed=false,visible=true;
 async function load(file){
  if(textures.has(file))return textures.get(file);
  const promise=new Promise(resolve=>{
   const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);
   image.src=getTextureAssetUrl(path(file));
  });textures.set(file,promise);return promise;
 }
 function clear(){
  const masks=new Set();
  for(const entry of records){
   scene.remove(entry.mesh);entry.material.dispose();entry.texture.dispose();
   if(!masks.has(entry.mask)){entry.mask.dispose();masks.add(entry.mask)}
  }
  records=[];
 }
 function sync(){
  const shown=visible&&terrain.visible;
  for(const entry of records){entry.mesh.geometry=terrain.geometry;entry.mesh.visible=shown}
 }
 async function rebuild(){
  const my=++ticket;if(disposed)return;
  const cliffGroups=new Map();
  for(const entry of registeredCliffZones(live)){
   if(!entry.parent||!entry.biome)continue;
   if(!cliffGroups.has(entry.biome))cliffGroups.set(entry.biome,[]);
   cliffGroups.get(entry.biome).push(entry.zone);
  }
  const loaded=await Promise.all([...cliffGroups].map(async([biome,zones])=>{
   const asset=CLIFF_ASSETS.find(a=>a.biome===biome);
   return {biome,zones,image:asset?.color?await load(asset.color):null};
  }));
  if(my!==ticket||disposed)return;
  clear();
  for(const {biome,zones,image} of loaded){
   if(!image)continue;
   const texture=new THREE.Texture(image);
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.colorSpace=THREE.SRGBColorSpace;
   texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
   texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
   const mask=createFeatheredZoneMask(zones,{featherWorld:10,expandWorld:7});
   const settings=live.cliffHeightSettings?.biomes?.[biome]||{};
   const material=new THREE.ShaderMaterial({
    uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
     cliffTexture:{value:texture},cliffMask:{value:mask},
     cliffRepeats:{value:cliffRepeatCount(live,biome)},
     intensity:{value:CLAMP(Number.isFinite(Number(settings.intensity))?Number(settings.intensity):1,0,1)},
     heightmapAligned:{value:CLIFF_ASSETS.some(a=>a.biome===biome&&a.height)?1:0}},
    vertexShader,fragmentShader,fog:true,side:THREE.DoubleSide,
    transparent:true,depthWrite:false,depthTest:true,
    polygonOffset:true,polygonOffsetFactor:-9,polygonOffsetUnits:-9
   });
   const mesh=new THREE.Mesh(terrain.geometry,material);
   mesh.name='CliffColor '+biome;mesh.frustumCulled=false;
   mesh.renderOrder=9;scene.add(mesh);
   records.push({mesh,mask,texture,material,biome});
  }
  sync();
 }
 function setVisible(v){visible=!!v;sync()}
 function invalidate(){textures.clear();void rebuild()}
 function dispose(){disposed=true;ticket++;clear()}
 return {rebuild,sync,setVisible,invalidate,dispose,getState:()=>({count:records.length,biomes:records.map(x=>x.biome)})};
}
