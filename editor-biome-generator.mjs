import {enumerateBiomeDistributions} from './biome-generator.mjs?v=0.9.157';

const LABELS={mountain:'Montaña',desert:'Desierto',plains:'Llanura',swamp:'Pantano',forest:'Bosque'};
const PAGE_SIZE=12;

// Deliberately simple: all permitted maps, not a seed/weight generator.
export function createBiomeGeneratorPanel({live,snapshot,persist,toast,onChange=()=>{},onZoneChange=()=>{}}){
 const $=id=>document.getElementById(id);
 const list=$('biomePossibilities');
 const status=$('biomeGeneratorStatus');
 const previous=$('biomePossibilitiesPrev');
 const next=$('biomePossibilitiesNext');
 const pages=$('biomePossibilitiesPage');
 if(!list||!status||!previous||!next||!pages)throw Error('Faltan controles de distribuciones');
 let page=0;
 let latest=[];
 let regionIds=[];
 const mainZones=()=>Array.isArray(live.zones)?live.zones.filter(z=>!z.isCliff):[];
 const getSelectedIndex=()=>{
  const zones=mainZones();
  return latest.findIndex(option=>option.every((item,i)=>zones[i]?.id===item.zoneId&&zones[i]?.biomeId===item.biomeId));
 };
 function apply(index){
  const chosen=latest[index],zones=mainZones();
  if(!chosen||chosen.length!==zones.length)return;
  if(chosen.every((item,i)=>zones[i].biomeId===item.biomeId))return;
  snapshot();
  for(let i=0;i<zones.length;i++){
   zones[i].biomeId=chosen[i].biomeId;
   // A selected possibility is editable and replaceable by another click.
   zones[i].biomeLocked=false;
  }
  // Cliff zones inherit their main region's biome elsewhere in the editor.
  persist();
  onZoneChange();
  onChange();
  render();
 }
 function render(){
  const zones=mainZones();
  const result=enumerateBiomeDistributions(zones,live.biomeGenerator);
  latest=result.ok?result.distributions:[];
  regionIds=zones.map(z=>z.id);
  const count=latest.length;
  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(count/PAGE_SIZE)-1)));
  list.replaceChildren();
  if(!result.ok){status.textContent=result.error;}
  else if(!count){status.textContent='No hay combinaciones válidas con las restricciones de vecinos guardadas.';}
  else status.textContent=count+' posibilidades · Montaña excluida de Zona Este';
  const selected=getSelectedIndex();
  const start=page*PAGE_SIZE;
  for(let i=start;i<Math.min(count,start+PAGE_SIZE);i++){
   const option=latest[i];
   const button=document.createElement('button');
   button.type='button';
   button.textContent='Posibilidad '+(i+1);
   button.title=option.map((item,j)=>(zones[j].name||'Zona '+(j+1))+': '+LABELS[item.biomeId]).join(' · ');
   button.setAttribute('aria-pressed',String(i===selected));
   if(i===selected){button.style.borderColor='#00ffdf';button.style.fontWeight='700'}
   button.onclick=()=>apply(i);
   list.append(button);
  }
  previous.disabled=page<=0;
  next.disabled=(page+1)*PAGE_SIZE>=count;
  pages.textContent=count?'Página '+(page+1)+' de '+Math.ceil(count/PAGE_SIZE):'';
 }
 previous.onclick=()=>{page--;render()};
 next.onclick=()=>{page++;render()};
 render();
 return {refresh:render};
}
