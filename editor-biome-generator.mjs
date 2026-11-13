import {BIOME_IDS,defaultBiomeGenerator,normalizeBiomeGenerator,generateBiomeAssignments,nextBiomeSeed} from './biome-generator.mjs?v=0.9.27';
const LABELS={mountain:'Montañoso',desert:'Desierto',plains:'Llanura',swamp:'Pantano',forest:'Bosque'};
const PAIRS=[];
for(let i=0;i<BIOME_IDS.length;i++)for(let j=i+1;j<BIOME_IDS.length;j++)PAIRS.push([BIOME_IDS[i],BIOME_IDS[j]]);
const pair=(a,b)=>[a,b].sort().join(':');
export function createBiomeGeneratorPanel({live,snapshot,persist,toast,onChange=()=>{},onZoneChange=()=>{}}){
 const $=id=>document.getElementById(id);
 const root=$('biomeGeneratorPanel');
 if(!root)throw Error('Falta el panel del generador de biomas');
 let storedRef=null;
 function config(){
  if(storedRef!==live.biomeGenerator){
   live.biomeGenerator=normalizeBiomeGenerator(live.biomeGenerator);
   storedRef=live.biomeGenerator;
  }
  return storedRef;
 }
 function mutate(fn){
  snapshot();
  fn(config());
  persist();
  refresh();
 }
 const make=(tag,text)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const weights=$('biomeWeights');
 const rules=$('biomePairRules');
 for(const id of BIOME_IDS){
  const row=make('div');row.style.cssText='display:grid;grid-template-columns:1fr 70px 56px;align-items:center;gap:6px;margin:7px 0';
  const active=make('label',LABELS[id]);active.style.margin='0';
  const check=make('input');check.type='checkbox';check.dataset.enabled=id;
  active.prepend(check);
  const weight=make('input');weight.type='number';weight.min='0';weight.max='10';weight.step='1';weight.dataset.weight=id;
  weight.style.cssText='min-width:0;width:100%;background:#1e4034;color:#fff;border:1px solid #598071;border-radius:5px;padding:5px';
  row.append(active,weight,make('small','Peso'));
  weights.append(row);
  check.onchange=e=>mutate(v=>{
   v.enabled=e.target.checked?[...new Set([...v.enabled,id])]:v.enabled.filter(x=>x!==id);
  });
  weight.onchange=e=>mutate(v=>v.weights[id]=Math.max(0,Math.min(10,Math.round(Number(e.target.value)||0))));
 }
 for(const [a,b] of PAIRS){
  const label=make('label');label.style.cssText='display:flex;align-items:center;gap:7px;margin:4px 0';
  const check=make('input');check.type='checkbox';check.dataset.pair=pair(a,b);
  label.append(check,make('span',LABELS[a]+' ↔ '+LABELS[b]));
  rules.append(label);
  check.onchange=e=>mutate(v=>{
   const p=pair(a,b);
   v.forbiddenPairs=e.target.checked?v.forbiddenPairs.filter(x=>x!==p):[...new Set([...v.forbiddenPairs,p])];
  });
 }
 function refresh(){
  const v=config(),zones=Array.isArray(live.zones)?live.zones:[];
  $('biomeGeneratorSeed').value=v.seed;
  for(const id of BIOME_IDS){
   root.querySelector('[data-enabled="'+id+'"]').checked=v.enabled.includes(id);
   root.querySelector('[data-weight="'+id+'"]').value=v.weights[id];
  }
  for(const [a,b] of PAIRS){
   root.querySelector('[data-pair="'+pair(a,b)+'"]').checked=!v.forbiddenPairs.includes(pair(a,b));
  }
  const assigned=zones.filter(z=>BIOME_IDS.includes(z.biomeId)).length;
  const locked=zones.filter(z=>z.biomeLocked===true).length;
  const last=v.lastGeneration;
  $('biomeGeneratorStatus').textContent=zones.length+' zonas · '+assigned+' con bioma · '+locked+' bloqueadas'
   +(last?' · Última generación: semilla '+last.seed:'');
  $('biomeGenerate').disabled=!zones.length;
  $('biomeRegenerate').disabled=!zones.length;
  $('biomeLockAll').disabled=!zones.length;
  $('biomeUnlockAll').disabled=!zones.length;
 }
 $('biomeGeneratorSeed').onchange=e=>mutate(v=>{
  v.seed=Math.max(1,Math.min(2147483646,Math.trunc(Number(e.target.value)||1)));
 });
 function generate(advance){
  const original=config();
  const candidate={...original,seed:advance?nextBiomeSeed(original.seed):original.seed};
  const result=generateBiomeAssignments(live.zones||[],candidate);
  if(!result.ok){toast(result.error);$('biomeGeneratorResult').textContent=result.error;return;}
  snapshot();
  const mapping=new Map(result.assignments.map(a=>[a.zoneId,a.biomeId]));
  for(const zone of live.zones)zone.biomeId=mapping.get(zone.id)||zone.biomeId||null;
  live.biomeGenerator={...candidate,lastGeneration:{seed:candidate.seed,count:result.assignments.length}};
  storedRef=live.biomeGenerator;
  persist();refresh();onZoneChange();onChange();
  const message='Semilla '+result.seed+' · '+result.assignments.length+' zonas · '+result.changed+' cambios · '+result.adjacency+' fronteras';
  $('biomeGeneratorResult').textContent=message;toast('Biomas distribuidos: '+result.changed+' zonas actualizadas');
 }
 $('biomeGenerate').onclick=()=>generate(false);
 $('biomeRegenerate').onclick=()=>generate(true);
 $('biomeGeneratorSeed').addEventListener('keydown',e=>{if(e.key==='Enter'){e.target.blur();e.preventDefault()}});
 $('biomeLockAll').onclick=()=>{
  if(!live.zones?.length)return;
  snapshot();
  for(const z of live.zones)z.biomeLocked=!!z.biomeId;
  persist();refresh();onZoneChange();
  toast('Asignación actual conservada: zonas con bioma bloqueadas');
 };
 $('biomeUnlockAll').onclick=()=>{
  if(!live.zones?.length)return;
  snapshot();
  for(const z of live.zones)z.biomeLocked=false;
  persist();refresh();onZoneChange();
  toast('Zonas desbloqueadas para la próxima generación');
 };
 $('biomeResetRules').onclick=()=>{
  if(!confirm('¿Restablecer pesos y compatibilidades? Los biomas asignados a zonas se mantienen.'))return;
  mutate(v=>{
   const def=defaultBiomeGenerator();
   v.enabled=def.enabled;v.weights=def.weights;v.forbiddenPairs=[];
  });
 };
 refresh();
 return {refresh};
}