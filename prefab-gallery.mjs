import * as THREE from 'three';
import {PREFABS} from './prefab-catalog.mjs?v=0.9.5';

// Visual catalog: pictures are rendered from the actual cached GLB geometry.
// One lazily created WebGL context supplies images for every model and angle.
const VIEWS=Object.freeze({
 iso:[1.45,1.0,1.45],
 front:[0,.13,1],
 side:[1,.13,0],
 back:[0,.13,-1],
 top:[0,1,0]
});
const VIEW_LABELS=Object.freeze({iso:'Perspectiva 3D',front:'Frente',side:'Lado',back:'Atrás',top:'Arriba'});
export function createPrefabGallery({library,root,onPick}){
 if(!root)throw Error('No existe la ventana de modelos GLB');
 const buttons=[...root.querySelectorAll('[data-prefab-choice]')];
 const views=[...root.querySelectorAll('[data-preview-view]')];
 const cached=new Map();
 let renderer=null,renderError='',currentView='iso',generation=0,open=false;
 const closeButton=root.querySelector('#closePrefabGallery');
 let previouslyFocused=null;

 function makeRenderer(){
  if(renderer)return renderer;
  if(renderError)throw Error(renderError);
  try{
   const canvas=document.createElement('canvas');
   renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
   renderer.setPixelRatio(1);
   renderer.setSize(440,275,false);
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   return renderer;
  }catch(error){
   renderError='No se pudo iniciar la vista previa 3D: '+(error.message||error);
   throw Error(renderError);
  }
 }
 function renderModel(id,view){
  const key=id+':'+view;
  if(cached.has(key))return cached.get(key);
  const source=library.instance({id:0,prefabId:id,x:0,z:0,scale:1,rotation:0,offsetY:0},()=>0);
  if(!source)throw Error('El modelo GLB no está cargado todavía');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x23362f);
  scene.add(new THREE.HemisphereLight(0xffffff,0x5a685d,2.3));
  const keyLight=new THREE.DirectionalLight(0xffffff,2.2);
  keyLight.position.set(-70,100,130);scene.add(keyLight);
  const fill=new THREE.DirectionalLight(0xa7e5ff,0.65);
  fill.position.set(120,40,-90);scene.add(fill);
  scene.add(source);
  source.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(source);
  if(bounds.isEmpty())throw Error('Este GLB no tiene geometría visible');
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  const radius=Math.max(size.length()*.5,.25);
  const aspect=440/275;
  const height=radius*2.35;
  const camera=new THREE.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,.01,Math.max(300,radius*14));
  const direction=new THREE.Vector3(...VIEWS[view]).normalize();
  if(view==='top')camera.up.set(0,0,-1);
  camera.position.copy(center).addScaledVector(direction,radius*4);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  makeRenderer().render(scene,camera);
  const url=renderer.domElement.toDataURL('image/png');
  scene.remove(source);
  cached.set(key,url);
  return url;
 }
 function setMessage(id,value){
  const span=root.querySelector('[data-prefab-message="'+id+'"]');
  if(span)span.textContent=value;
 }
 function setImage(id,url){
  const img=root.querySelector('[data-prefab-preview="'+id+'"]');
  if(img)img.src=url;
 }
 async function refresh(){
  const request=++generation;
  const view=currentView;
  for(const button of buttons){
   const id=button.dataset.prefabChoice;
   const entry=PREFABS.find(p=>p.id===id);
   button.disabled=false;
   setMessage(id,'Cargando vista '+VIEW_LABELS[view]+'…');
   const url=cached.get(id+':'+view);
   if(url){
    setImage(id,url);setMessage(id,'Vista '+VIEW_LABELS[view]+' · Haz clic para colocar');
    continue;
   }
   // Clear stale images when the view is switched.
   const img=root.querySelector('[data-prefab-preview="'+id+'"]');
   if(img)img.removeAttribute('src');
   void library.load(id).then(model=>{
    if(!open||request!==generation)return;
    if(!model)throw Error('No se pudo cargar '+(entry?.file||id));
    const snapshot=renderModel(id,view);
    if(!open||request!==generation)return;
    setImage(id,snapshot);
    setMessage(id,'Vista '+VIEW_LABELS[view]+' · Haz clic para colocar');
   }).catch(error=>{
    if(!open||request!==generation)return;
    setMessage(id,'Vista no disponible: '+(error.message||error));
   });
  }
 }
 function setView(view){
  if(!Object.hasOwn(VIEWS,view))return;
  currentView=view;
  for(const button of views)button.setAttribute('aria-pressed',String(button.dataset.previewView===view));
  if(open)void refresh();
 }
 function show(){
  previouslyFocused=document.activeElement;
  open=true;
  root.hidden=false;
  closeButton?.focus();
  void refresh();
 }
 function close(){
  if(!open)return;
  open=false;generation++;
  root.hidden=true;
  previouslyFocused?.focus?.();
 }
 for(const button of views)button.addEventListener('click',()=>setView(button.dataset.previewView));
 for(const button of buttons)button.addEventListener('click',async()=>{
  const id=button.dataset.prefabChoice;
  if(!PREFABS.some(p=>p.id===id))return;
  button.disabled=true;
  try{
   const model=await library.load(id);
   if(!open)return;
   if(!model)throw Error('No se pudo abrir este GLB');
   close();
   onPick(id);
  }catch(error){
   setMessage(id,'Error: '+(error.message||error));
  }finally{button.disabled=false}
 });
 closeButton?.addEventListener('click',close);
 root.addEventListener('click',event=>{if(event.target===root)close()});
 document.addEventListener('keydown',event=>{
  if(!open)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}
  if(event.key==='Tab'){
   const focusable=[...root.querySelectorAll('button:not(:disabled)')];
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
 },true);
 return {open:show,close,setView,isOpen:()=>open};
}
