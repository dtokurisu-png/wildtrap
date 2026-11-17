import * as THREE from 'three';
import {buildCliffHeightmapGeometry,detectDominantCliff} from './cliff-heightmap-geometry.mjs?v=0.9.118';

// New heightmaps can be registered here without changing the geometry engine.
// Images are geometry inputs ONLY; cliff color materials are intentionally absent.
export const CLIFF_HEIGHTMAPS=[
 {id:'plains-body',label:'Llanura · cuerpo',biome:'plains',file:'Textura de Acantilado llanura CUERPO-HEIGTH.png'}
];
const texturePath=file=>'./assets/terrain/texturas/'+encodeURIComponent(file);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createCliffHeightmapEditor({terrain,scene,view,camera,live,snapshot,persist,toast,getTextureAssetUrl=url=>url,onGeometryChanged=()=>{}}){
 const $=id=>document.getElementById(id);
 const btn=$('cliffHeightPick'),status=$('cliffHeightStatus'),enabled=$('cliffHeightEnabled'),
  radius=$('cliffHeightRadius'),strength=$('cliffHeightStrength'),period=$('cliffHeightPeriod'),
  steps=$('cliffHeightSteps'),remove=$('cliffHeightRemove');
 if(!btn||!status||!enabled||!radius||!strength||!period||!steps||!remove)throw Error('Panel del mapa de altura incompleto');
 let selecting=false,timer=0,ticket=0,derived=[],source=null,automatic=null,imageCache=new Map(),disposed=false;
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
 const configs=()=>Array.isArray(live.cliffHeightmaps)?live.cliffHeightmaps:[];
 const active=()=>configs().find(c=>c.id==='plains-body')||automatic;
 function parameters(){
  const c=active();
  enabled.checked=c?.enabled!==false;
  radius.value=c?.radius??32;strength.value=c?.strength??2.5;period.value=c?.period??24;steps.value=c?.steps??2;
  remove.disabled=!c;btn.classList.toggle('active',selecting);
  status.textContent=selecting?'Haz clic directamente sobre la pared empinada del acantilado':
   c?.point?(configs().some(x=>x.id==='plains-body')?'Pared seleccionada':'Pared detectada automáticamente')+' · X '+c.point.x.toFixed(1)+' / Z '+c.point.z.toFixed(1)+'. Preparando relieve…':
   'Aún no hay pared seleccionada. Pulsa «Seleccionar pared» y luego haz clic en el acantilado.';
 }
 function disposeDerived(){
  if(derived.length){
   if(source&&derived.includes(terrain.geometry))terrain.geometry=source;
   for(const g of derived)g.dispose();
   derived=[];
  }
 }
 function decodeImage(file){
  if(imageCache.has(file))return imageCache.get(file);
  const promise=new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>{
    try{
     const canvas=document.createElement('canvas');
     const max=Math.max(image.naturalWidth,image.naturalHeight),factor=Math.min(1,1024/Math.max(1,max));
     canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
     canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
     const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,w=canvas.width,h=canvas.height;
     const pixel=(x,y)=>{const k=((y%h+h)%h*w+(x%w+w)%w)*4;return (pixels[k]*.2126+pixels[k+1]*.7152+pixels[k+2]*.0722)/255};
     resolve((u,v)=>{
      const x=((u%1+1)%1)*w,y=((v%1+1)%1)*h;
      const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
      return pixel(x0,y0)*(1-tx)*(1-ty)+pixel(x0+1,y0)*tx*(1-ty)+pixel(x0,y0+1)*(1-tx)*ty+pixel(x0+1,y0+1)*tx*ty;
     });
    }catch(error){reject(error)}
   };
   image.onerror=()=>reject(Error('No se pudo leer '+file));
   image.src=getTextureAssetUrl(texturePath(file));
  });
  imageCache.set(file,promise);return promise;
 }
 function geometryData(geometry){
  const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),col=geometry.getAttribute('color');
  return {positions:p.array,indices:geometry.index?.array,uvs:uv?.array,colors:col?.array};
 }
 function applyResult(result){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
  if(result.colors)g.setAttribute('color',new THREE.BufferAttribute(result.colors,3));
  if(result.uvs)g.setAttribute('uv',new THREE.BufferAttribute(result.uvs,2));
  g.setIndex(new THREE.BufferAttribute(result.indices,1));
  g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();
  return g;
 }
 async function bake(){
  const id=++ticket;if(disposed)return;
  const current=terrain.geometry;
  if(!derived.includes(current))source=current;
  const base=source||current;
  automatic=configs().length?null:detectDominantCliff(geometryData(base));
  if(automatic)automatic={...automatic,id:'plains-body',strength:7,period:24,steps:2,enabled:true};
  const maps=configs().filter(c=>c?.point&&c.enabled!==false&&CLIFF_HEIGHTMAPS.some(m=>m.id===c.id));
  if(automatic)maps.push(automatic);
  if(!maps.length){
   disposeDerived();status.textContent=configs().length?'Relieve desactivado. Geometría original conservada.':'No hay paredes empinadas detectadas. Selecciona una pared manualmente.';
   onGeometryChanged();return;
  }
  try{
   // Geometry is built off-scene then swapped atomically, avoiding partly displaced frames.
   const samplers=await Promise.all(maps.map(async c=>{
    const item=CLIFF_HEIGHTMAPS.find(m=>m.id===c.id);
    return {c,sample:await decodeImage(item.file)};
   }));
   if(id!==ticket||disposed||terrain.geometry!==current)return;
   let working=base,newGeometries=[],results=[];
   for(const {c,sample} of samplers){
    const output=buildCliffHeightmapGeometry(geometryData(working),{point:c.point,normalXZ:c.normalXZ,
     radius:c.radius,strength:c.strength,period:c.period,steps:c.steps,sample});
    if(output){working=applyResult(output);newGeometries.push(working);results.push(output.stats)}
   }
   if(id!==ticket||disposed){newGeometries.forEach(g=>g.dispose());return}
   // If a terrain rebuild happened while decoding, its new geometry wins.
   if(terrain.geometry!==current){newGeometries.forEach(g=>g.dispose());return}
   disposeDerived();
   terrain.geometry=working===base?base:working;
   derived=newGeometries;
   onGeometryChanged();
   status.textContent=results.length?
    (automatic?'Detección automática · ':'Selección manual · ')+'Malla real: '+results.reduce((n,x)=>n+x.moved,0)+' vértices desplazados · '+
    results.reduce((n,x)=>n+x.subdivided,0)+' caras refinadas · sin capa visual adicional.':
    'No se encontró una pared con relieve significativo en esta selección. Selecciona otra cara o ajusta escala.';
  }catch(error){
   if(id!==ticket)return;
   status.textContent='Error leyendo el mapa de alturas: '+error.message;
   toast(status.textContent);
  }
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{void bake()},100)}
 function choose(e){
  if(!selecting)return;
  e.preventDefault();e.stopImmediatePropagation();selecting=false;
  if(e.button!==0){parameters();return}
  const rect=view.getBoundingClientRect();
  mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(mouse,camera);terrain.updateMatrixWorld(true);
  // When the displaced mesh is visible, raycast against the original triangles
  // so selection never captures an artificial interpolated face.
  const original=source||terrain.geometry;
  const probe=new THREE.Mesh(original,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  probe.matrixWorld.copy(terrain.matrixWorld);probe.matrixAutoUpdate=false;
  const hit=ray.intersectObject(probe,false)[0];
  probe.material.dispose();
  if(!hit){toast('No se detectó una superficie del terreno');parameters();return}
  const n=hit.face.normal,side=Math.hypot(n.x,n.z);
  if(side<.65){toast('Selecciona una pared inclinada, no el suelo horizontal');parameters();return}
  snapshot();
  const previous=active()||{};automatic=null;
  live.cliffHeightmaps=[...configs().filter(c=>c.id!=='plains-body'),{
   id:'plains-body',point:{x:hit.point.x,z:hit.point.z},
   normalXZ:[n.x/side,n.z/side],radius:previous.radius??32,
   strength:previous.strength??2.5,period:previous.period??24,steps:previous.steps??2,enabled:true
  }];
  persist();parameters();schedule();
  toast('Pared seleccionada · se aplicará el relieve directamente a su malla');
 }
 view.addEventListener('pointerdown',choose,true);
 btn.onclick=()=>{selecting=!selecting;parameters()};
 remove.onclick=()=>{if(!active())return;snapshot();automatic=null;live.cliffHeightmaps=[...configs().filter(c=>c.id!=='plains-body'),{id:'plains-body',enabled:false}];persist();parameters();schedule()};
 function change(field,value){const c=active();if(!c)return;snapshot();
  if(!configs().some(x=>x.id==='plains-body')){live.cliffHeightmaps=[...configs(),{...c,id:'plains-body'}];automatic=null}
  live.cliffHeightmaps.find(x=>x.id==='plains-body')[field]=value;persist();parameters();schedule()}

 radius.onchange=()=>change('radius',clamp(Number(radius.value)||32,4,150));
 strength.onchange=()=>change('strength',clamp(Number(strength.value)||2.5,0,12));
 period.onchange=()=>change('period',clamp(Number(period.value)||24,2,180));
 steps.onchange=()=>change('steps',clamp(Number(steps.value)||2,1,3));
 enabled.onchange=()=>change('enabled',enabled.checked);
 function invalidate(){imageCache.clear();schedule()}
 function dispose(){disposed=true;clearTimeout(timer);++ticket;view.removeEventListener('pointerdown',choose,true);disposeDerived()}
 parameters();
 return {schedule,invalidate,refresh:parameters,dispose,getState:()=>({count:derived.length,selected:!!active(),selecting})};
}
