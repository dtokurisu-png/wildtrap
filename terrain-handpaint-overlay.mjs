import * as THREE from 'three';
import {
 HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_CONTRAST,HANDPAINT_GPU_MAX_SIZE
} from './terrain-handpaint-settings.mjs';
export {HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE}
 from './terrain-handpaint-settings.mjs';

// Controller only. The actual Overlay blend is done inside existing terrain
// biome materials. No extra fullscreen framebuffer, depth copy, quad,
// shadow pass, terrain duplicate or angle-dependent occlusion test.
export function createTerrainHandpaintOverlay({renderer,scene,getTextureAssetUrl=url=>url}){
 const flags=new URLSearchParams(location.search);
 const enabled=!flags.has('noHandpaint')&&(!flags.has('safe')||flags.has('handpaint'));
 const statusNode=document.getElementById('terrainHandpaintStatus');
 const report=message=>{if(statusNode)statusNode.textContent=message};
 const listeners=new Set();
 let disposed=false,loadStarted=false,ready=false,paintTexture=null,active=true;
 let sourceWidth=0,sourceHeight=0,gpuWidth=0,gpuHeight=0;
 let error='',loadedSource='',frames=0;

 report(enabled?
  'Capa hand-painted: preparando material del terreno…':
  'Capa hand-painted: desactivada (modo seguro o comparación)');

 function notify(){
  for(const listener of listeners){
   try{listener(active&&enabled?paintTexture:null)}catch(err){console.warn('Handpaint callback:',err)}
  }
 }
 function subscribe(listener){
  listeners.add(listener);
  listener(active&&enabled?paintTexture:null);
  return ()=>listeners.delete(listener);
 }
 function startArtworkLoading(){
  if(disposed||!enabled||loadStarted)return;
  loadStarted=true;
  const image=new Image();
  image.decoding='async';
  image.onload=()=>{
   if(disposed)return;
   try{
    sourceWidth=image.naturalWidth;sourceHeight=image.naturalHeight;
    loadedSource=image.currentSrc||image.src;
    const maxSize=Math.min(HANDPAINT_GPU_MAX_SIZE,renderer.capabilities.maxTextureSize||HANDPAINT_GPU_MAX_SIZE);
    const scale=Math.min(1,maxSize/Math.max(sourceWidth,sourceHeight));
    gpuWidth=Math.max(1,Math.round(sourceWidth*scale));
    gpuHeight=Math.max(1,Math.round(sourceHeight*scale));
    let content=image;
    if(gpuWidth!==sourceWidth||gpuHeight!==sourceHeight){
     const canvas=document.createElement('canvas');
     canvas.width=gpuWidth;canvas.height=gpuHeight;
     const ctx=canvas.getContext('2d',{alpha:true});
     if(!ctx)throw Error('No se pudo preparar la imagen hand-painted');
     ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
     ctx.drawImage(image,0,0,gpuWidth,gpuHeight);
     content=canvas;
    }
    paintTexture=new THREE.Texture(content);
    paintTexture.name='Wildtrap Worldwide Handpaint Overlay 50%';
    paintTexture.colorSpace=THREE.SRGBColorSpace;
    paintTexture.wrapS=paintTexture.wrapT=THREE.ClampToEdgeWrapping;
    paintTexture.minFilter=THREE.LinearMipmapLinearFilter;
    paintTexture.magFilter=THREE.LinearFilter;
    paintTexture.anisotropy=Math.min(2,renderer.capabilities.getMaxAnisotropy?.()||2);
    paintTexture.generateMipmaps=true;
    paintTexture.needsUpdate=true;
    ready=true;
    notify(); // Existing biome materials receive the texture immediately.
    report('Capa hand-painted: ACTIVA · opacidad y rotación ajustables · sin acantilados');
   }catch(err){
    error=err?.message||String(err);
    report('Capa hand-painted: error al preparar el material');
    console.warn('Wildtrap hand-painted:',err);
   }
  };
  let originalAttempted=false;
  image.onerror=()=>{
   if(!originalAttempted){
    originalAttempted=true;
    image.src=getTextureAssetUrl(HANDPAINT_SOURCE);
   }else{
    error='No se pudo cargar '+HANDPAINT_GPU_SOURCE+' ni '+HANDPAINT_SOURCE;
    report('Capa hand-painted: error al cargar imagen');
   }
  };
  image.src=getTextureAssetUrl(HANDPAINT_GPU_SOURCE);
 }
 function render(camera){
  // A single native render of the real scene, at the normal display FPS.
  // Materials sample the painting directly, whatever the viewing angle.
  if(window.__terrainHydrated===true&&!loadStarted)startArtworkLoading();
  renderer.render(scene,camera);
  if(ready)frames++;
 }
 function getTexture(){return active&&enabled?paintTexture:null}
 function setActive(value){
  active=Boolean(value);
  notify();
  report(!active?'Capa hand-painted: desactivada temporalmente (comparación)':
   ready?'Capa hand-painted: ACTIVA · opacidad y rotación ajustables · sin acantilados':
   'Capa hand-painted: preparando material del terreno…');
 }
 function getState(){
  return {enabled,ready,active,mode:'overlay',opacity:HANDPAINT_OPACITY,transparency:1-HANDPAINT_OPACITY,
   contrast:HANDPAINT_CONTRAST,whiteIsNeutral:true,cliffsExcluded:true,
   source:HANDPAINT_SOURCE,loadedSource,sourceWidth,sourceHeight,
   gpuWidth,gpuHeight,frames,error,depthOcclusion:'native',
   worldMapping:'XZ one-to-one',singleSceneRender:true,extraRenderTargets:0};
 }
 function dispose(){
  disposed=true;ready=false;active=false;notify();listeners.clear();
  paintTexture?.dispose();paintTexture=null;
 }
 return {render,getTexture,getState,setActive,subscribe,dispose};
}
