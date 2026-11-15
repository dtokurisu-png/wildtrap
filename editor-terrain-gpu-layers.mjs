import * as THREE from 'three';

// GPU texture projection for the WildTrap terrain. The 768px canvas is only
// a geographic alpha MASK, never a downsampled copy of the tiled source PNG.
// Every fragment samples the original full-resolution bitmap, at the same
// physical scale as the 3D character preview (630 / repetitions world units).
const WORLD=630,MASK_RES=768;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function makeMask(zones){
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=MASK_RES;
 const c=canvas.getContext('2d');
 c.clearRect(0,0,MASK_RES,MASK_RES);
 c.fillStyle='#ffffff';
 for(const zone of zones){
  if(!Array.isArray(zone.points)||zone.points.length<3)continue;
  c.beginPath();
  zone.points.forEach((p,i)=>{
   const x=(p.x/WORLD+.5)*MASK_RES,y=(p.z/WORLD+.5)*MASK_RES;
   if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
  });
  c.closePath();c.fill();
 }
 const t=new THREE.CanvasTexture(canvas);
 t.colorSpace=THREE.NoColorSpace;t.minFilter=THREE.LinearFilter;
 t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;
 return t;
}
const VERTEX=`
varying vec3 vWorldPoint;
varying vec3 vNormalWorld;
void main(){
 vec4 w=modelMatrix*vec4(position,1.0);
 vWorldPoint=w.xyz;
 vNormalWorld=normalize(mat3(modelMatrix)*normal);
 gl_Position=projectionMatrix*viewMatrix*w;
}`;
const FRAGMENT=`
uniform sampler2D maskMap;
uniform sampler2D baseMap;
uniform sampler2D detailMap1;
uniform sampler2D detailMap2;
uniform sampler2D detailMap3;
uniform float activeBase;
uniform vec3 activeDetails;
uniform vec4 repeatScale;
uniform vec3 detailOpacity;
uniform float variation;
uniform float seed;
varying vec3 vWorldPoint;
varying vec3 vNormalWorld;
float hash(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
void main(){
 vec2 coord=vWorldPoint.xz;
 // Canvas Y points down and OpenGL V points up.
 vec2 maskUV=vec2(coord.x/630.0+.5,.5-coord.y/630.0);
 float inside=texture2D(maskMap,maskUV).a;
 if(inside<.02)discard;
 vec2 worldUV=coord/630.0;
 vec3 rgb=vec3(.40,.47,.38);
 if(activeBase>.5)rgb=texture2D(baseMap,worldUV*repeatScale.x).rgb;
 float grain=max(1.0,variation);
 if(activeDetails.x>.5){
  float noise=hash(floor(coord/grain+seed*1.31+11.0));
  float alpha=detailOpacity.x*smoothstep(.14,.87,noise);
  rgb=mix(rgb,texture2D(detailMap1,worldUV*repeatScale.y).rgb,alpha);
 }
 if(activeDetails.y>.5){
  float noise=hash(floor(coord/grain+seed*2.03+37.0));
  float alpha=detailOpacity.y*smoothstep(.14,.87,noise);
  rgb=mix(rgb,texture2D(detailMap2,worldUV*repeatScale.z).rgb,alpha);
 }
 if(activeDetails.z>.5){
  float noise=hash(floor(coord/grain+seed*3.07+73.0));
  float alpha=detailOpacity.z*smoothstep(.14,.87,noise);
  rgb=mix(rgb,texture2D(detailMap3,worldUV*repeatScale.w).rgb,alpha);
 }
 vec3 n=normalize(vNormalWorld);
 float directional=.78+.22*max(0.0,dot(n,normalize(vec3(-.4,1.0,.45))));
 gl_FragColor=vec4(rgb*directional,inside);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export function createTerrainGPULayers({scene,terrain}){
 let records=[];
 function clear(){
  for(const record of records){
   scene.remove(record.mesh);
   record.mask.dispose();
   record.material.dispose();
  }
  records=[];
 }
 function build({zones,materials,loaded,enabled=true}){
  clear();
  if(!enabled)return;
  const regions=(zones||[]).filter(z=>!z.isCliff&&z.biomeId&&Array.isArray(z.points)&&z.points.length>=3);
  const grouped=new Map();
  for(const z of regions){
   if(!grouped.has(z.biomeId))grouped.set(z.biomeId,[]);
   grouped.get(z.biomeId).push(z);
  }
  const fallback=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
  fallback.needsUpdate=true;
  // One layer per biome, rather than a material per polygon. The underlying
  // terrain mesh/geometry is never modified. All source textures retain
  // their original bitmap resolution and are tiled by the GPU.
  for(const [biome,biomeZones] of grouped){
   const config=materials?.[biome],slots=config?.slots;
   if(!slots)continue;
   const entries=['ground','detail1','detail2','detail3'].map(id=>({
    slot:slots[id],image:loaded.get(slots[id]?.image)
   }));
   if(!entries.some(e=>e.image))continue;
   const mask=makeMask(biomeZones);
   const textures=entries.map(({image})=>{
    if(!image)return fallback;
    const t=new THREE.Texture(image);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.colorSpace=THREE.SRGBColorSpace;
    t.minFilter=THREE.LinearMipmapLinearFilter;
    t.magFilter=THREE.LinearFilter;
    t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;
    return t;
   });
   const repeat=entries.map(e=>clamp(Number(e.slot?.scale)||8,.25,1000));
   const uniforms={
    maskMap:{value:mask},baseMap:{value:textures[0]},
    detailMap1:{value:textures[1]},detailMap2:{value:textures[2]},detailMap3:{value:textures[3]},
    activeBase:{value:entries[0].image?1:0},
    activeDetails:{value:new THREE.Vector3(...entries.slice(1).map(e=>e.image?1:0))},
    repeatScale:{value:new THREE.Vector4(...repeat)},
    detailOpacity:{value:new THREE.Vector3(...entries.slice(1).map(e=>clamp(Number(e.slot?.opacity)||0,0,1)))},
    variation:{value:Number(config.noise?.scale)||20},seed:{value:Number(config.noise?.seed)||1}
   };
   const material=new THREE.ShaderMaterial({
    uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    transparent:true,depthWrite:false,depthTest:true,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2
   });
   const mesh=new THREE.Mesh(terrain.geometry,material);
   mesh.name='BiomeGPU '+biome;mesh.renderOrder=3;
   mesh.userData.editorOnly=true;mesh.frustumCulled=false;
   scene.add(mesh);
   records.push({mesh,mask,material,textures,fallback});
  }
 }
 function sync(visible=true){
  for(const r of records){
   r.mesh.geometry=terrain.geometry;
   r.mesh.visible=Boolean(visible&&terrain.visible);
  }
 }
 function clearAll(){
  for(const r of records)for(const t of r.textures)
   if(t!==r.fallback)t.dispose();
  for(const r of records)r.fallback.dispose();
  clear();
 }
 return {build:options=>{clearAll();build(options)},sync,clear:clearAll,count:()=>records.length};
}
