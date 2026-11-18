import * as THREE from 'three';
import {buildCliffHeightmapGeometry} from './cliff-heightmap-geometry.mjs?v=0.9.123';
import {registeredCliffZones,CLIFF_ASSETS,cliffRepeatCount} from './cliff-zone-bindings.mjs?v=0.9.123';
import {createCliffColorRenderer} from './cliff-color-renderer.mjs?v=0.9.142';
const texturePath=file=>'./assets/terrain/texturas/'+encodeURIComponent(file);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createCliffHeightmapEditor({terrain,scene,view,camera,live,snapshot,persist,toast,getTextureAssetUrl=url=>url,onGeometryChanged=()=>{}}){
 const $=id=>document.getElementById(id);
 const status=$('cliffHeightStatus'),enabled=$('cliffHeightEnabled'),
  strength=$('cliffHeightStrength'),steps=$('cliffHeightSteps'),
  smoothing=$('cliffHeightSmoothing'),flatten=$('cliffHeightFlatten'),
  cards=$('cliffBiomeCards'),target=$('textureTarget'),
  geometryControls=$('cliffGeometryControls');
 if(!status||!enabled||!strength||!steps||!smoothing||!flatten||!cards||!target)
  throw Error('Faltan controles de acantilado o propiedades procedurales');
 let timer=0,ticket=0,derived=[],source=null,disposed=false;
 const imageCache=new Map();
 const renderer=createCliffColorRenderer({scene,terrain,live,getTextureAssetUrl});
 renderer.setVisible(live.settings?.biomeTexturesVisible!==false);
 function settings(){
  if(!live.cliffHeightSettings||typeof live.cliffHeightSettings!=='object')live.cliffHeightSettings={};
  return live.cliffHeightSettings;
 }
 function biomeSettings(biome){
  const config=settings();
  if(!config.biomes||typeof config.biomes!=='object')config.biomes={};
  if(!config.biomes[biome]||typeof config.biomes[biome]!=='object')config.biomes[biome]={};
  return config.biomes[biome];
 }
 function activeBiome(){
  const chosen=target.value||'';
  return chosen.startsWith('cliff:')?chosen.slice(6):null;
 }
 function parameters(){
  const c=settings(),biome=activeBiome(),b=biome?biomeSettings(biome):{};
  enabled.checked=c.enabled!==false;
  if(geometryControls)geometryControls.hidden=!biome;
  strength.value=b.strength??c.strength??3;
  steps.value=b.steps??c.steps??2;
  smoothing.value=Math.round((b.smoothing??c.smoothing??.55)*100);
  flatten.value=Math.round((b.peakFlatten??c.peakFlatten??.4)*100);
  renderCards();
  const zones=registeredCliffZones(live);
  const ready=zones.filter(x=>x.map);
  const missing=zones.filter(x=>x.parent&&!x.map).length;
  status.textContent=zones.length?
   zones.length+' zonas ⛰ · '+ready.length+' con heightmap'+
    (missing?' · '+missing+' pendientes de heightmap':''):
   'Sin zonas ⛰ asignadas.';
 }
 function renderCards(){
  cards.replaceChildren();
  const zones=registeredCliffZones(live);
  for(const asset of CLIFF_ASSETS){
   const card=document.createElement('div');
   card.style.cssText='padding:8px;margin-top:7px;border:1px solid #497967;border-radius:9px';
   const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:7px';
   const name=document.createElement('strong');name.textContent=asset.label+' · '+zones.filter(z=>z.biome===asset.biome).length+' zonas ⛰';
   const select=document.createElement('button');select.type='button';select.textContent='Editar';select.title='Seleccionar controles para '+asset.label;
   select.onclick=()=>{target.value='cliff:'+asset.biome;target.dispatchEvent(new Event('change',{bubbles:true}))};
   bar.append(name,select);card.append(bar);
   const gallery=document.createElement('div');gallery.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px';
   for(const [filename,label] of [[asset.color,'Color'],[asset.height,'Heightmap']]){
    const figure=document.createElement('figure');figure.style.margin='0';
    if(filename){
     const img=document.createElement('img');img.src=getTextureAssetUrl(texturePath(filename));
     img.alt=label+' '+asset.label;img.loading='lazy';
     img.style.cssText='width:100%;height:95px;object-fit:contain;background:#142820;border-radius:7px';
     figure.append(img);
    }else{
     const blank=document.createElement('div');blank.textContent='Pendiente';
     blank.style.cssText='height:95px;display:grid;place-items:center;border:1px dashed #497967;font-size:11px;border-radius:7px';
     figure.append(blank);
    }
    const caption=document.createElement('figcaption');caption.textContent=label;
    caption.style.cssText='font-size:11px;opacity:.8';figure.append(caption);gallery.append(figure);
   }
   card.append(gallery);cards.append(card);
  }
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
   disposeDerived();parameters();onGeometryChanged();
   renderer.sync();void renderer.rebuild();return;
  }
  try{
   const inputs=await Promise.all(associations.map(async entry=>({...entry,
    sample:await decodeImage(entry.map.file)})));
   if(disposed||id!==ticket||terrain.geometry!==current)return;
   let working=base;const newGeometries=[],results=[];
   for(const {zone,map,sample} of inputs){
    const xs=zone.points.map(p=>p.x),zs=zone.points.map(p=>p.z);
    const point={x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2};
    const b=biomeSettings(map.biome);
    const output=buildCliffHeightmapGeometry(geometryData(working),{
     point,normalXZ:[1,0],zonePoints:zone.points,
     radius:Math.max(3,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))),
     strength:clamp(Number(b.strength??c.strength??3),0,12),
     period:630/cliffRepeatCount(live,map.biome),
     steps:clamp(Number(b.steps??c.steps??2),1,3),
     smoothing:clamp(Number(b.smoothing??c.smoothing??.55),0,1),
     peakFlatten:clamp(Number(b.peakFlatten??c.peakFlatten??.4),0,1),
     sample
    });
    if(output){working=applyResult(output);newGeometries.push(working);results.push(output.stats)}
   }
   if(disposed||id!==ticket||terrain.geometry!==current){newGeometries.forEach(g=>g.dispose());return}
   disposeDerived();terrain.geometry=working;derived=newGeometries;
   onGeometryChanged();renderer.sync();void renderer.rebuild();
   parameters();
   status.textContent+=' · '+results.reduce((n,x)=>n+x.moved,0)+' vértices desplazados · '+
    results.reduce((n,x)=>n+x.subdivided,0)+' caras subdivididas · suavizado activo';
  }catch(error){
   if(disposed||id!==ticket)return;
   status.textContent='Error aplicando relieve: '+error.message;toast(status.textContent);
   void renderer.rebuild();
  }
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{void bake()},120)}
 function update(key,value){
  const biome=activeBiome();if(!biome)return;
  snapshot();biomeSettings(biome)[key]=value;persist();schedule();
 }
 enabled.onchange=()=>{snapshot();settings().enabled=enabled.checked;persist();schedule()};
 strength.onchange=()=>update('strength',clamp(Number(strength.value)||0,0,12));
 steps.onchange=()=>update('steps',clamp(Number(steps.value)||2,1,3));
 smoothing.onchange=()=>update('smoothing',clamp(Number(smoothing.value)/100||0,0,1));
 flatten.onchange=()=>update('peakFlatten',clamp(Number(flatten.value)/100||0,0,1));
 target.addEventListener('change',parameters);
 function invalidate(){imageCache.clear();renderer.invalidate();schedule()}
 function dispose(){disposed=true;clearTimeout(timer);++ticket;disposeDerived();renderer.dispose()}
 parameters();
 return {schedule,invalidate,refresh:parameters,dispose,getState:()=>({
  marked:registeredCliffZones(live).length,mapped:registeredCliffZones(live).filter(x=>x.map).length,
  activeMeshes:derived.length,colorMeshes:renderer.getState().count
 }),syncColor:()=>renderer.sync(),setColorsVisible:v=>renderer.setVisible(v)};
}
