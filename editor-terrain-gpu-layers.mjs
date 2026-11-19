import * as THREE from 'three';
import {createFeatheredZoneMask} from './terrain-zone-feather.mjs?v=0.9.124';

// SAFE TERRAIN RENDERER: one full-resolution ground PNG per biome.
// Complementary decals are intentionally disabled until the base passes
// visual testing. The canvas is ONLY the alpha mask of each geographic zone;
// the PNG itself is sampled directly by the GPU at the saved repeat scale.
const WORLD=630, MASK_RES=768;
// Sample the artwork directly in the existing biomes, at real world XZ.
// One shader draw, no fullscreen quad/framebuffer or view-dependent depths.
const GLOBAL_HANDPAINT_GLSL=`
uniform sampler2D globalHandpaint;
uniform float globalHandpaintEnabled;
uniform float globalHandpaintOpacity;
uniform float globalHandpaintContrast;
uniform vec2 globalHandpaintRotationCS;
uniform float globalHandpaintBlendMode;
// 0 normal (pintura), 1 multiply, 2 screen, 3 overlay,
// 4 soft light, 5 hard light, 6 color, 7 luminosity.
vec3 handpaintBlend(vec3 base, vec3 art, float mode){
 if(mode<0.5)return art;
 if(mode<1.5)return base*art;
 if(mode<2.5)return 1.0-(1.0-base)*(1.0-art);
 if(mode<3.5){
  vec3 multiply=2.0*base*art;
  vec3 screen=1.0-2.0*(1.0-base)*(1.0-art);
  return mix(multiply,screen,step(vec3(.5),base));
 }
 if(mode<4.5){
  // Smooth light: a gentle highlight/shadow enhancement.
  vec3 low=base-(1.0-2.0*art)*base*(1.0-base);
  vec3 high=base+(2.0*art-1.0)*(sqrt(max(base,vec3(0.0)))-base);
  return mix(low,high,step(vec3(.5),art));
 }
 if(mode<5.5){
  vec3 multiply=2.0*base*art;
  vec3 screen=1.0-2.0*(1.0-base)*(1.0-art);
  return mix(multiply,screen,step(vec3(.5),art));
 }
 const vec3 lumaWeights=vec3(.2126,.7152,.0722);
 float baseLuma=dot(base,lumaWeights);
 float artLuma=dot(art,lumaWeights);
 if(mode<6.5)return clamp(art+(baseLuma-artLuma),0.0,1.0);
 return clamp(base+(artLuma-baseLuma),0.0,1.0);
}
vec3 paintOverlayColor(vec3 terrainColor){
 if(globalHandpaintEnabled<0.5||globalHandpaintOpacity<=0.0)return terrainColor;
 float upness=abs(normalize(vTerrainNormal).y);
 float flatMask=smoothstep(0.70,0.86,upness);
 if(flatMask<0.001)return terrainColor;
 vec2 artUV=vec2(vTerrainWorld.x/630.0+.5,.5-vTerrainWorld.z/630.0);
 vec2 centered=artUV-vec2(.5);
 artUV=vec2(dot(centered,vec2(globalHandpaintRotationCS.x,-globalHandpaintRotationCS.y)),dot(centered,globalHandpaintRotationCS.yx))+vec2(.5);
 if(artUV.x<0.0||artUV.y<0.0||artUV.x>1.0||artUV.y>1.0)return terrainColor;
 float edge=min(min(artUV.x,1.0-artUV.x),min(artUV.y,1.0-artUV.y));
 float edgeFade=smoothstep(0.0,0.06,edge);
 if(edgeFade<0.001)return terrainColor;
 vec4 art=texture2D(globalHandpaint,artUV);
 const vec3 lumaWeights=vec3(.2126,.7152,.0722);
 float artLuma=dot(art.rgb,lumaWeights);
 // The painted artwork is underneath. It contributes only grayscale shape
 // and relief, never its original hue. White paper is fully neutral.
 float ink=clamp((1.0-artLuma)*globalHandpaintContrast,0.0,1.0);
 float coverage=1.0-smoothstep(0.985,0.999,artLuma);
 float strength=clamp(globalHandpaintOpacity*art.a*edgeFade*flatMask*coverage*ink,0.0,1.0);
 if(strength<0.0001||ink<0.0001)return terrainColor;
 vec3 paintedUnderlay=vec3(0.5-0.5*ink);
 // Apply the BIOME base color as foreground to the grayscale underlay.
 vec3 mixed=handpaintBlend(paintedUnderlay,terrainColor,globalHandpaintBlendMode);
 // The resulting luminance changes, but the biome texture retains its hue.
 float baseLight=dot(terrainColor,lumaWeights);
 float mixedLight=dot(mixed,lumaWeights);
 vec3 biomeColored=clamp(terrainColor*(mixedLight/max(baseLight,0.002)),0.0,1.0);
 return mix(terrainColor,biomeColored,strength);
}
`;
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
uniform float biomeContrast;
uniform float biomeSaturation;
vec3 adjustBiomeColor(vec3 sourceColor){
 if(abs(biomeContrast-1.0)<0.0001&&abs(biomeSaturation-1.0)<0.0001)return sourceColor;
 vec3 withContrast=clamp((sourceColor-vec3(0.5))*biomeContrast+vec3(0.5),0.0,1.0);
 float gray=dot(withContrast,vec3(.2126,.7152,.0722));
 return clamp(mix(vec3(gray),withContrast,biomeSaturation),0.0,1.0);
}
varying vec2 vTerrainXZ;
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
${GLOBAL_HANDPAINT_GLSL}
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
 gl_FragColor=vec4(adjustBiomeColor(paintOverlayColor(mix(ground,wallGround,wallMix))),alpha*intensity);
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
uniform float biomeContrast;
uniform float biomeSaturation;
vec3 adjustBiomeColor(vec3 sourceColor){
 if(abs(biomeContrast-1.0)<0.0001&&abs(biomeSaturation-1.0)<0.0001)return sourceColor;
 vec3 withContrast=clamp((sourceColor-vec3(0.5))*biomeContrast+vec3(0.5),0.0,1.0);
 float gray=dot(withContrast,vec3(.2126,.7152,.0722));
 return clamp(mix(vec3(gray),withContrast,biomeSaturation),0.0,1.0);
}
varying vec2 vTerrainXZ;
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
 gl_FragColor=vec4(adjustBiomeColor(premultiplied/max(combinedAlpha,.0001)),combinedAlpha);
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
 // A single shared art GPU texture/uniform group for all biome materials.
 const artUniforms={
  globalHandpaint:{value:null},
  globalHandpaintEnabled:{value:0},
  globalHandpaintOpacity:{value:0.90},
  globalHandpaintContrast:{value:1.6},
  globalHandpaintRotationCS:{value:new THREE.Vector2(-1,0)},
  globalHandpaintBlendMode:{value:3}
 };
 function setHandpaintTexture(texture){
  artUniforms.globalHandpaint.value=texture||null;
  artUniforms.globalHandpaintEnabled.value=texture?1:0;
 }
 function setHandpaintSettings({opacity,rotation,blendMode,contrast}={}){
  if(Number.isFinite(Number(opacity)))artUniforms.globalHandpaintOpacity.value=limit(Number(opacity),0,1);
  if(rotation!==undefined&&Number.isFinite(Number(rotation))){const angle=Number(rotation)*Math.PI/180;artUniforms.globalHandpaintRotationCS.value.set(Math.cos(angle),Math.sin(angle));}
  if(blendMode!==undefined&&Number.isFinite(Number(blendMode)))artUniforms.globalHandpaintBlendMode.value=Math.round(limit(Number(blendMode),0,7));
  if(contrast!==undefined&&Number.isFinite(Number(contrast)))artUniforms.globalHandpaintContrast.value=limit(Number(contrast),0,4);
 }
 function clear(){
  // Clean up old overlay on each texture rebake; no leaking shadow receivers.
  if(shadowMesh){scene.remove(shadowMesh);shadowMesh.geometry=null;shadowMesh=null}
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
     ...artUniforms,
     baseTexture:{value:texture},
     regionMask:{value:mask},
     repeats:{value:limit(Number(slot.scale)||8,.25,1000)},
      intensity:{value:limit(Number.isFinite(Number(slot.opacity))?Number(slot.opacity):1,0,1)},
     biomeContrast:{value:limit(Number(materials[biome].colorContrast??1),0,3)},
     biomeSaturation:{value:limit(Number(materials[biome].colorSaturation??1),0,3)}
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
   records.push({mesh,mask,texture,material:shader,biome});
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
      intensity:{value:opacity},
      biomeContrast:{value:limit(Number(materials[biome].colorContrast??1),0,3)},
      biomeSaturation:{value:limit(Number(materials[biome].colorSaturation??1),0,3)}
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
    records.push({mesh:detailMesh,mask,texture:detailTexture,material:detailMaterial,biome});
   }
  }
  if(records.length){
   // Biome and cliff shaders remain unmodified (including their fog uniforms).
   // This one transparent pass receives real world AND avatar shadows on
   // textured ground and vertical cliff faces. It NEVER casts shadows.
   shadowMaterial=new THREE.ShadowMaterial({color:0x1a231e,opacity:.55,side:THREE.DoubleSide});
   shadowMaterial.polygonOffset=true;
   shadowMaterial.polygonOffsetFactor=-10;
   shadowMaterial.polygonOffsetUnits=-10;
   shadowMesh=new THREE.Mesh(terrain.geometry,shadowMaterial);
   shadowMesh.name='TerrainSoftSunShadows';
   shadowMesh.castShadow=false;
   shadowMesh.receiveShadow=true;
   shadowMesh.renderOrder=11;
   shadowMesh.frustumCulled=false;
   scene.add(shadowMesh);
  }
 }
 function setBiomeColorSettings(biome,{contrast,saturation}={}){
  for(const record of records){
   if(record.biome!==biome)continue;
   const uniforms=record.material.uniforms;
   if(contrast!==undefined&&Number.isFinite(Number(contrast)))uniforms.biomeContrast.value=limit(Number(contrast),0,3);
   if(saturation!==undefined&&Number.isFinite(Number(saturation)))uniforms.biomeSaturation.value=limit(Number(saturation),0,3);
  }
 }
 function sync(visible=true){
  if(shadowMesh){
   shadowMesh.geometry=terrain.geometry;
   shadowMesh.visible=Boolean(visible&&terrain.visible);
  }
  for(const entry of records){
   entry.mesh.geometry=terrain.geometry;
   entry.mesh.visible=Boolean(visible&&terrain.visible);
  }
 }
 return {build,sync,clear,setHandpaintTexture,setHandpaintSettings,setBiomeColorSettings,count:()=>records.length,
  getHandpaintState:()=>({enabled:Boolean(artUniforms.globalHandpaintEnabled.value),
   materials:records.filter(r=>r.material.uniforms.globalHandpaint).length})};
}
