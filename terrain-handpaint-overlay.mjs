import * as THREE from 'three';
import {HANDPAINT_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE}
 from './terrain-handpaint-settings.mjs';
export {HANDPAINT_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE}
 from './terrain-handpaint-settings.mjs';

// Non-tiled global painting covering the 630x630 terrain.
// Keep the 10K source intact; send a 4096px downsampled copy to the GPU.
const WORLD_SIZE=630;

// Render terrain + props ONCE to the normal-resolution target, then compose
// the art on top of just the actually visible terrain fragments.
// The depth texture protects Explorer, GLBs, caves, trees, UI and sky.
const ART_VERTEX=`
varying vec2 vArtUV;
void main(){
 vec4 world=modelMatrix*vec4(position,1.0);
 vArtUV=vec2(world.x/${WORLD_SIZE.toFixed(1)}+0.5,0.5-world.z/${WORLD_SIZE.toFixed(1)});
 gl_Position=projectionMatrix*viewMatrix*world;
}`;
const ART_FRAGMENT=`
#include <common>
#include <colorspace_pars_fragment>
uniform sampler2D sceneColor;
uniform sampler2D sceneDepth;
uniform sampler2D artTexture;
uniform vec2 screenSize;
uniform float opacity;
varying vec2 vArtUV;
vec3 hardLight(vec3 base,vec3 paint){
 vec3 multiply=2.0*base*paint;
 vec3 screen=1.0-2.0*(1.0-base)*(1.0-paint);
 return mix(multiply,screen,step(vec3(0.5),paint));
}
vec3 toSRGB(vec3 c){
 return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
vec3 fromSRGB(vec3 c){
 return mix(c/12.92,pow((max(c,vec3(0.0))+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}
void main(){
 vec2 screenUV=gl_FragCoord.xy/screenSize;
 float visibleDepth=texture2D(sceneDepth,screenUV).r;
 // Do not paint across nearer objects or scene openings. The terrain here is
 // the exact original mesh, with the same cuts and heightmapped geometry.
 if(visibleDepth>=0.999999||abs(gl_FragCoord.z-visibleDepth)>0.00006)discard;
 if(vArtUV.x<0.0||vArtUV.y<0.0||vArtUV.x>1.0||vArtUV.y>1.0)discard;
 vec4 art=texture2D(artTexture,vArtUV);
 if(art.a<0.001)discard;
 vec3 sceneLinear=texture2D(sceneColor,screenUV).rgb;
 vec3 sceneSRGB=toSRGB(sceneLinear);
 vec3 paintSRGB=toSRGB(art.rgb);
 vec3 blended=hardLight(sceneSRGB,paintSRGB);
 float strength=clamp(opacity*art.a,0.0,1.0);
 gl_FragColor=vec4(fromSRGB(mix(sceneSRGB,blended,strength)),1.0);
 #include <colorspace_fragment>
}`;

export function createTerrainHandpaintOverlay({renderer,scene,terrain,getTextureAssetUrl=url=>url}){
 const flags=new URLSearchParams(location.search);
 let disposed=false,ready=false,sourceWidth=0,sourceHeight=0,uploadedWidth=0,uploadedHeight=0,paintTexture=null;
 let frames=0,loaderError='';
 const enabled=!flags.has('noHandpaint');
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
  side:THREE.DoubleSide,
  depthTest:false,depthWrite:false,transparent:false,
  blending:THREE.NoBlending,toneMapped:false
 });
 const paintingMesh=new THREE.Mesh(terrain.geometry,shader);
 paintingMesh.name='TerrainGlobalHandpaintHardLight';
 paintingMesh.frustumCulled=false;
 paintingMesh.matrixAutoUpdate=false;
 const paintingScene=new THREE.Scene();paintingScene.add(paintingMesh);

 // This is deliberately asynchronous: the original 43MB source loads once.
 // An 8K/10K GPU texture would otherwise trigger huge VRAM allocations.
 if(enabled){
  const img=new Image();
  img.decoding='async';
  img.onload=()=>{
   if(disposed)return;
   try{
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
   }catch(error){
    loaderError=error?.message||String(error);
    console.warn('Wildtrap: no se pudo preparar el overlay handpaint:',error);
   }
  };
  img.onerror=()=>{
   loaderError='No se pudo descargar '+HANDPAINT_SOURCE;
   console.warn('Wildtrap:',loaderError);
  };
  img.src=getTextureAssetUrl(HANDPAINT_SOURCE);
 }
 function render(camera){
  if(!enabled||!ready||!terrain.visible){
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
  return {enabled,ready,mode:'hard-light',transparency:0.35,opacity:HANDPAINT_OPACITY,
   source:HANDPAINT_SOURCE,sourceWidth,sourceHeight,
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
