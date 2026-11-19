import * as THREE from 'three';
import {HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE,
 HANDPAINT_EDGE_FADE,HANDPAINT_SLOPE_START,HANDPAINT_SLOPE_END}
 from './terrain-handpaint-settings.mjs';
export {HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE}
 from './terrain-handpaint-settings.mjs';

// Non-tiled global painting covering the 630x630 terrain.
// Keep the 10K source intact; send a 4096px downsampled copy to the GPU.
const WORLD_SIZE=630;

// Render the world once to its color/depth target, then overlay only upward-
// facing terrain surfaces. White art is neutral; dark paint multiplies color.
// Neither the original terrain mesh nor its lighting/shadows are modified.
const ART_VERTEX=`
varying vec2 vArtUV;
varying vec3 vWorldPos;
void main(){
 vec4 world=modelMatrix*vec4(position,1.0);
 vWorldPos=world.xyz;
 vArtUV=vec2(world.x/${WORLD_SIZE.toFixed(1)}+0.5,0.5-world.z/${WORLD_SIZE.toFixed(1)});
 gl_Position=projectionMatrix*viewMatrix*world;
}`;
const ART_FRAGMENT=`
#include <common>
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D artTexture;
uniform vec2 screenSize;
uniform float opacity;
varying vec2 vArtUV;
varying vec3 vWorldPos;
vec3 toSRGB(vec3 c){
 return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
vec3 fromSRGB(vec3 c){
 return mix(c/12.92,pow((max(c,vec3(0.0))+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}
void main(){
 // Derivative-based FACE normal: accurate even when sculpted cliff vertices
 // do not have reliable/split smoothed vertex normals.
 vec3 face=cross(dFdx(vWorldPos),dFdy(vWorldPos));
 vec3 faceN=face/max(length(face),0.000001);
 float upness=abs(faceN.y);
 float flatMask=smoothstep(${HANDPAINT_SLOPE_START.toFixed(2)},${HANDPAINT_SLOPE_END.toFixed(2)},upness);
 if(flatMask<0.001)discard; // Do not paint vertical cliffs or walls.
 if(vArtUV.x<0.0||vArtUV.y<0.0||vArtUV.x>1.0||vArtUV.y>1.0)discard;
 // Every edge of the full, non-repeating 630x630 painting fades to zero.
 float edgeDistance=min(min(vArtUV.x,1.0-vArtUV.x),min(vArtUV.y,1.0-vArtUV.y));
 float edgeFade=smoothstep(0.0,${HANDPAINT_EDGE_FADE.toFixed(2)},edgeDistance);
 if(edgeFade<0.001)discard;

 vec2 screenUV=gl_FragCoord.xy/screenSize;
 float visibleDepth=texture2D(sceneDepth,screenUV).r;
 // Grazing camera views need more tolerance due to raster depth precision.
 // Compare against genuinely closer scene surfaces, not exact equality.
 float facing=abs(dot(faceN,normalize(cameraPosition-vWorldPos)));
 float depthEpsilon=mix(0.00035,0.00005,smoothstep(0.06,0.78,facing));
 if(visibleDepth+depthEpsilon<gl_FragCoord.z)discard;

 vec4 art=texture2D(artTexture,vArtUV);
 if(art.a<0.001)discard;
 vec3 paintSRGB=toSRGB(art.rgb);
 float luma=dot(paintSRGB,vec3(0.2126,0.7152,0.0722));
 float darkMask=smoothstep(0.05,0.77,1.0-luma);
 float strength=clamp(opacity*art.a*edgeFade*flatMask*darkMask,0.0,1.0);
 if(strength<0.0001)discard;

 vec3 sceneSRGB=toSRGB(texture2D(sceneColor,screenUV).rgb);
 // Multiply is exactly neutral for pure white; dark pigment is visible.
 vec3 darkened=sceneSRGB*paintSRGB;
 gl_FragColor=vec4(fromSRGB(mix(sceneSRGB,darkened,strength)),1.0);
 #include <colorspace_fragment>
}`;

export function createTerrainHandpaintOverlay({renderer,scene,terrain,getTextureAssetUrl=url=>url}){
 const flags=new URLSearchParams(location.search);
 let disposed=false,ready=false,sourceWidth=0,sourceHeight=0,uploadedWidth=0,uploadedHeight=0,paintTexture=null;
 let frames=0,loaderError='',loadedSource='';
 // Recovery/safe mode deliberately avoids this extra GPU pass unless opted in.
 const enabled=!flags.has('noHandpaint')&&(!flags.has('safe')||flags.has('handpaint'));
 const statusNode=document.getElementById('terrainHandpaintStatus');
 const reportStatus=(msg)=>{if(statusNode)statusNode.textContent=msg};
 reportStatus(enabled?'Capa global hand-painted · Oscurecimiento · 35 % de transparencia: cargando…':
  'Capa global hand-painted: desactivada (modo seguro o comparación)');
 const drawingSize=new THREE.Vector2();
 const rt=new THREE.WebGLRenderTarget(1,1,{
  depthBuffer:true,stencilBuffer:false,
  minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
  format:THREE.RGBAFormat,type:THREE.UnsignedByteType
 });
 rt.texture.name='Wildtrap Handpaint Scene Color';
 rt.texture.colorSpace=THREE.SRGBColorSpace;
 rt.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
 rt.depthTexture.format=THREE.DepthFormat;
 rt.depthTexture.name='Wildtrap Handpaint Scene Depth';
 const quadMaterial=new THREE.MeshBasicMaterial({
  map:rt.texture,depthTest:false,depthWrite:false,toneMapped:false
 });
 const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),quadMaterial);
 quad.frustumCulled=false;
 const quadScene=new THREE.Scene();quadScene.add(quad);
 const quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);
 quadCamera.position.z=1;
 const shader=new THREE.ShaderMaterial({
  uniforms:{
   sceneColor:{value:rt.texture},
   sceneDepth:{value:rt.depthTexture},
   artTexture:{value:null},
   screenSize:{value:new THREE.Vector2(1,1)},
   opacity:{value:HANDPAINT_OPACITY}
  },
  vertexShader:ART_VERTEX,fragmentShader:ART_FRAGMENT,
  extensions:{derivatives:true}, // Supports geometric face normals on WebGL1 too.
  side:THREE.DoubleSide,
  depthTest:false,depthWrite:false,transparent:false,
  blending:THREE.NoBlending,toneMapped:false
 });
 const paintingMesh=new THREE.Mesh(terrain.geometry,shader);
 paintingMesh.name='TerrainGlobalHandpaintHardLight';
 paintingMesh.frustumCulled=false;
 paintingMesh.matrixAutoUpdate=false;
 const paintingScene=new THREE.Scene();paintingScene.add(paintingMesh);

 // Defer even image decoding and the 4K canvas allocation until AFTER the
 // editor has hydrated its terrain. Doing this during startup starved the UI
 // thread on some devices, despite using the optimized WebP.
 let loadStarted=false;
 function startArtworkLoading(){
  if(loadStarted||!enabled||disposed)return;
  loadStarted=true;
  const img=new Image();
  img.decoding='async';
  img.onload=()=>{
   if(disposed)return;
   try{
    loadedSource=img.currentSrc||img.src;
    sourceWidth=img.naturalWidth;sourceHeight=img.naturalHeight;
    const maxSize=Math.min(HANDPAINT_GPU_MAX_SIZE,renderer.capabilities.maxTextureSize||HANDPAINT_GPU_MAX_SIZE);
    const ratio=Math.min(1,maxSize/Math.max(sourceWidth,sourceHeight));
    uploadedWidth=Math.max(1,Math.round(sourceWidth*ratio));
    uploadedHeight=Math.max(1,Math.round(sourceHeight*ratio));
    const canvas=document.createElement('canvas');
    canvas.width=uploadedWidth;canvas.height=uploadedHeight;
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)throw Error('Canvas 2D no disponible para preparar la capa');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,uploadedWidth,uploadedHeight);
    paintTexture=new THREE.CanvasTexture(canvas);
    paintTexture.name='Handpaint 10K global - runtime GPU copy';
    paintTexture.wrapS=paintTexture.wrapT=THREE.ClampToEdgeWrapping;
    paintTexture.colorSpace=THREE.SRGBColorSpace;
    paintTexture.magFilter=THREE.LinearFilter;
    paintTexture.minFilter=THREE.LinearMipmapLinearFilter;
    paintTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy?.()||4);
    paintTexture.generateMipmaps=true;
    paintTexture.needsUpdate=true;
    shader.uniforms.artTexture.value=paintTexture;
    ready=true;
    reportStatus('Capa global hand-painted: ACTIVA · blancos invisibles · sin acantilados · 35 % de transparencia');
   }catch(error){
    loaderError=error?.message||String(error);
    reportStatus('Capa hand-painted: error al preparar la imagen');
    console.warn('Wildtrap: no se pudo preparar el overlay handpaint:',error);
   }
  };
  let attemptedOriginal=false;
  img.onerror=()=>{
   if(!attemptedOriginal){
    attemptedOriginal=true;
    img.src=getTextureAssetUrl(HANDPAINT_SOURCE);
    return;
   }
   loaderError='No se pudo descargar la capa handpaint: '+HANDPAINT_GPU_SOURCE+' o '+HANDPAINT_SOURCE;
   reportStatus('Capa hand-painted: error al descargar la imagen');
   console.warn('Wildtrap:',loaderError);
  };
  // The 4K derivative loads much faster, with original 10K as safe fallback.
  img.src=getTextureAssetUrl(HANDPAINT_GPU_SOURCE);
 }
 function render(camera){
  // Do not start decoding the artwork until the editor is fully interactive.
  // The scene continues rendering normally while the 4K copy is prepared.
  if(window.__terrainHydrated===true&&!loadStarted)startArtworkLoading();
  if(!enabled||!ready||!terrain.visible||window.__terrainHydrated!==true){
   renderer.render(scene,camera);
   return;
  }
  renderer.getDrawingBufferSize(drawingSize);
  const width=Math.max(1,Math.round(drawingSize.x));
  const height=Math.max(1,Math.round(drawingSize.y));
  if(rt.width!==width||rt.height!==height)rt.setSize(width,height);
  shader.uniforms.screenSize.value.set(width,height);
  paintingMesh.geometry=terrain.geometry;
  terrain.updateMatrixWorld();
  paintingMesh.matrixWorld.copy(terrain.matrixWorld);
  const previousTarget=renderer.getRenderTarget();
  const autoClear=renderer.autoClear;
  try{
   renderer.setRenderTarget(rt);
   renderer.autoClear=true;
   renderer.render(scene,camera); // One scene render, NOT an extra light/shadow pass.
   renderer.setRenderTarget(previousTarget);
   renderer.render(quadScene,quadCamera);
   renderer.autoClear=false;
   renderer.render(paintingScene,camera);
   frames++;
  }finally{
   renderer.autoClear=autoClear;
   renderer.setRenderTarget(previousTarget);
  }
 }
 function getState(){
  return {enabled,ready,mode:'dark-only',transparency:0.35,opacity:HANDPAINT_OPACITY,
   whiteIsNeutral:true,cliffsExcluded:true,edgeFadeFraction:HANDPAINT_EDGE_FADE,
   slopeThreshold:[HANDPAINT_SLOPE_START,HANDPAINT_SLOPE_END],grazingAngleDepthTolerance:true,
   source:HANDPAINT_SOURCE,loadedSource,sourceWidth,sourceHeight,
   gpuWidth:uploadedWidth,gpuHeight:uploadedHeight,frames,error:loaderError,
   depthOcclusion:true,terrainGeometryLinked:paintingMesh.geometry===terrain.geometry,
   worldMapping:'XZ one-to-one'};
 }
 function dispose(){
  disposed=true;ready=false;
  paintTexture?.dispose();
  shader.dispose();quadMaterial.dispose();quad.geometry.dispose();
  rt.dispose();
 }
 return {render,getState,dispose};
}
