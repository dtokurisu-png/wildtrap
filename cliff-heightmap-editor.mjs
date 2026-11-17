import * as THREE from 'three';
import {buildCliffHeightmapGeometry} from './cliff-heightmap-geometry.mjs?v=0.9.120';
import {registeredCliffZones} from './cliff-zone-bindings.mjs?v=0.9.119';
const texturePath=file=>'./assets/terrain/texturas/'+encodeURIComponent(file);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function createCliffHeightmapEditor({terrain,scene,view,camera,live,snapshot,persist,toast,getTextureAssetUrl=url=>url,onGeometryChanged=()=>{}}){
 const $=id=>document.getElementById(id);
 const status=$('cliffHeightStatus'),enabled=$('cliffHeightEnabled'),radius=$('cliffHeightRadius'),
  strength=$('cliffHeightStrength'),period=$('cliffHeightPeriod'),repeats=$('cliffHeightRepeats'),steps=$('cliffHeightSteps'),
  pick=$('cliffHeightPick'),remove=$('cliffHeightRemove');
 if(!status||!enabled||!strength||!period||!steps)throw Error('Falta panel geométrico de heightmap');
 if(radius)radius.closest('label').hidden=true;
 if(pick)pick.hidden=true;
 if(remove)remove.hidden=true;
 let timer=0,ticket=0,derived=[],source=null,disposed=false;
 const imageCache=new Map();
 const settings=()=>{
  if(!live.cliffHeightSettings||typeof live.cliffHeightSettings!=='object')live.cliffHeightSettings={};
  return live.cliffHeightSettings;
 };
 function parameters(){
  const c=settings();enabled.checked=c.enabled!==false;
  strength.value=c.strength??3;period.value=c.period??24;
  if(repeats)repeats.value=String(Math.round((630/(Number(c.period)||24))*100)/100);
  steps.value=c.steps??2;
  const marked=registeredCliffZones(live),ready=marked.filter(x=>x.map);
  const pending=marked.filter(x=>!x.parent).length,missing=marked.filter(x=>x.parent&&!x.map).length;
  status.textContent=marked.length?
   marked.length+' zonas marcadas como acantilado · '+ready.length+' con heightmap disponible'+
   (pending?' · '+pending+' sin región principal':'')+
   (missing?' · '+missing+' pendientes de mapa de alturas':'')+
   ' · '+(630/(Number(c.period)||24)).toFixed(2)+' repeticiones por 630 unidades':
   'No hay zonas marcadas como acantilado. Usa el botón ⛰ del Creador de zonas y asóciala a su región principal.';
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
  const base=source||current,c=settings();
  const associations=c.enabled===false?[]:registeredCliffZones(live).filter(x=>x.map);
  if(!associations.length){
   disposeDerived();parameters();onGeometryChanged();return;
  }
  try{
   const inputs=await Promise.all(associations.map(async entry=>({
    ...entry,sample:await decodeImage(entry.map.file)
   })));
   if(disposed||id!==ticket||terrain.geometry!==current)return;
   let working=base;const newGeometries=[],results=[];
   for(const {zone,map,sample} of inputs){
    const xs=zone.points.map(p=>p.x),zs=zone.points.map(p=>p.z);
    const point={x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2};
    const radius=Math.max(3,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)));
    const output=buildCliffHeightmapGeometry(geometryData(working),{
     point,normalXZ:[1,0],zonePoints:zone.points,radius,
     strength:clamp(Number(c.strength??3),0,12),period:clamp(Number(c.period??24),2,180),
     steps:clamp(Number(c.steps??2),1,3),sample
    });
    if(output){
     working=applyResult(output);newGeometries.push(working);results.push({zone:zone.name||zone.id,...output.stats});
    }
   }
   if(disposed||id!==ticket||terrain.geometry!==current){newGeometries.forEach(g=>g.dispose());return}
   disposeDerived();terrain.geometry=working;derived=newGeometries;onGeometryChanged();
   const moved=results.reduce((sum,x)=>sum+x.moved,0),subdivided=results.reduce((sum,x)=>sum+x.subdivided,0);
   parameters();
   status.textContent+=' · '+results.length+' zonas con geometría refinada · '+moved+
    ' vértices desplazados · '+subdivided+' caras refinadas.';
   if(!moved)status.textContent+=' Las zonas marcadas no contienen caras suficientemente inclinadas.';
  }catch(error){
   if(disposed||id!==ticket)return;
   status.textContent='Error aplicando heightmap: '+error.message;toast(status.textContent);
  }
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{void bake()},120)}
 function update(field,value){snapshot();settings()[field]=value;persist();schedule()}
 enabled.onchange=()=>update('enabled',enabled.checked);
 strength.onchange=()=>update('strength',clamp(Number(strength.value)||0,0,12));
 period.onchange=()=>update('period',clamp(Number(period.value)||24,2,180));
 if(repeats)repeats.onchange=()=>update('period',630/clamp(Number(repeats.value)||26.25,3.5,315));
 steps.onchange=()=>update('steps',clamp(Number(steps.value)||2,1,3));
 function invalidate(){imageCache.clear();schedule()}
 function dispose(){disposed=true;clearTimeout(timer);++ticket;disposeDerived()}
 parameters();
 return {schedule,invalidate,refresh:parameters,dispose,getState:()=>({
  marked:registeredCliffZones(live).length,mapped:registeredCliffZones(live).filter(x=>x.map).length,
  activeMeshes:derived.length
 })};
}
