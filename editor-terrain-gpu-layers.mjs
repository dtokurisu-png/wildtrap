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
// Interpolate between random cell values instead of drawing square color
// blocks. This only modulates the BASE very gently.
float smoothNoise(vec2 p){
 vec2 cell=floor(p),f=fract(p);
 f=f*f*(3.0-2.0*f);
 return mix(
  mix(hash(cell),hash(cell+vec2(1.0,0.0)),f.x),
  mix(hash(cell+vec2(0.0,1.0)),hash(cell+vec2(1.0,1.0)),f.x),
  f.y);
}
// One randomly positioned, rotated and softly faded patch in each candidate
// cell; most cells contain none. "repeat" controls physical size only.
// Nominal density: 25% of the repeat count over the complete 630-unit map.
// Different seed/slot IDs produce independent locations and rotations.
// Each fragment samples a detail image ONLY if inside its occasional patch.
vec4 sparsePatch(sampler2D img,vec2 worldPos,float repeats,float id){
 float total=clamp(round(repeats*.25),1.0,250.0);
 float across=ceil(sqrt(total));
 float chance=total/(across*across);
 vec2 region=floor((worldPos+315.0)/630.0*across);
 if(region.x<0.0||region.y<0.0||region.x>=across||region.y>=across)
  return vec4(0.0);
 vec2 token=region+vec2(id*17.3+seed*.117,id*31.9+seed*.071);
 if(hash(token+43.0)>chance)return vec4(0.0);
 float cellSize=630.0/across;
 float size=630.0/max(.25,repeats);
 // Center is jittered within the cell. Each texture uses its own
 // independent deterministic per-cell displacement.
 vec2 jitter=vec2(hash(token+12.0),hash(token+25.0));
 vec2 center=-315.0+(region+.22+.56*jitter)*cellSize;
 float angle=6.2831853*hash(token+65.0);
 vec2 rel=(worldPos-center)/size;
 vec2 rotated=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*rel;
 float maxEdge=max(abs(rotated.x),abs(rotated.y));
 // True transparent exterior; smooth alpha toward the interior.
 float edge=smoothstep(.5,.27,maxEdge);
 if(edge<=.002)return vec4(0.0);
 vec4 pixel=texture2D(img,rotated+.5);
 // PNG intrinsic alpha is preserved as well as the procedural soft edge.
 float alpha=(.5+.3*hash(token+94.0))*edge*pixel.a;
 return vec4(pixel.rgb,alpha);
}
void main(){
 vec2 coord=vWorldPoint.xz;
 vec2 maskUV=vec2(coord.x/630.0+.5,.5-coord.y/630.0);
 float inside=texture2D(maskMap,maskUV).a;
 if(inside<.02)discard;
 vec2 worldUV=coord/630.0;
 vec3 rgb=vec3(.40,.47,.38);
 if(activeBase>.5)rgb=texture2D(baseMap,worldUV*repeatScale.x).rgb;
 // Gentle cloud-like modulation, with no floor() block boundaries.
 float cloud=smoothNoise(coord/max(8.0,variation*2.0)+vec2(seed*.173));
 rgb*=mix(.92,1.045,cloud);
 if(activeDetails.x>.5){
  vec4 patch=sparsePatch(detailMap1,coord,repeatScale.y,1.0);
  rgb=mix(rgb,patch.rgb,patch.a*clamp(detailOpacity.x*2.0,0.0,1.0));
 }
 if(activeDetails.y>.5){
  vec4 patch=sparsePatch(detailMap2,coord,repeatScale.z,2.0);
  rgb=mix(rgb,patch.rgb,patch.a*clamp(detailOpacity.y*2.0,0.0,1.0));
 }
 if(activeDetails.z>.5){
  vec4 patch=sparsePatch(detailMap3,coord,repeatScale.w,3.0);
  rgb=mix(rgb,patch.rgb,patch.a*clamp(detailOpacity.z*2.0,0.0,1.0));
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
    // Preserve the real bitmap detail. Only exceptionally large files
    // (e.g. an 8K llanura) are capped at 4096px for GPU compatibility and
    // to avoid a single tile consuming hundreds of MB of VRAM.
    let bitmap=image;
    if(Math.max(image.width,image.height)>4096){
     const ratio=4096/Math.max(image.width,image.height);
     const small=document.createElement('canvas');
     small.width=Math.max(1,Math.round(image.width*ratio));
     small.height=Math.max(1,Math.round(image.height*ratio));
     const cx=small.getContext('2d');cx.imageSmoothingQuality='high';
     cx.drawImage(image,0,0,small.width,small.height);
     bitmap=small;
    }
    const t=new THREE.Texture(bitmap);
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
   // Biome materials are gameplay visuals, never editor-only helpers.
   mesh.frustumCulled=false;
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
