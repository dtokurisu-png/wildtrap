// WILDTRAP: deterministic biome assignment to persistent terrain zones.
// Pure logic: no 3D engine dependency. Never mutates input objects.
export const BIOME_IDS=['mountain','desert','plains','swamp','forest'];
const DEFAULT_WEIGHTS={mountain:1,desert:1,plains:1,swamp:1,forest:1};
const finite=(v,def=0)=>Number.isFinite(Number(v))?Number(v):def;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function defaultBiomeGenerator(){
 return {seed:1,enabled:[...BIOME_IDS],weights:{...DEFAULT_WEIGHTS},forbiddenPairs:[],lastGeneration:null};
}
const keyPair=(a,b)=>[a,b].sort().join(':');
export function normalizeBiomeGenerator(data){
 const def=defaultBiomeGenerator(),v=data&&typeof data==='object'?data:{};
 const enabled=Array.isArray(v.enabled)?[...new Set(v.enabled.filter(id=>BIOME_IDS.includes(id)))]:def.enabled;
 const forbiddenPairs=Array.isArray(v.forbiddenPairs)?
  [...new Set(v.forbiddenPairs.filter(key=>{
   if(typeof key!=='string')return false;
   const ids=key.split(':');
   return ids.length===2&&ids[0]!==ids[1]&&ids.every(id=>BIOME_IDS.includes(id))&&key===keyPair(...ids);
  }))]:[];
 const weights={};
 for(const id of BIOME_IDS)weights[id]=clamp(Math.round(finite(v.weights?.[id],1)),0,10);
 const seed=clamp(Math.trunc(finite(v.seed,1))||1,1,2147483646);
 return {seed,enabled,weights,forbiddenPairs,
  lastGeneration:v.lastGeneration&&typeof v.lastGeneration==='object'?
  {seed:clamp(Math.trunc(finite(v.lastGeneration.seed,seed)),1,2147483646),
   count:Math.max(0,Math.trunc(finite(v.lastGeneration.count,0)))}:null};
}
export function seededRandom(seed){
 let x=(Math.trunc(Number(seed))>>>0)||1;
 return ()=>{x=(x+0x6D2B79F5)|0;let t=Math.imul(x^(x>>>15),1|x);
  t^=t+Math.imul(t^(t>>>7),61|t);
  return ((t^(t>>>14))>>>0)/4294967296;};
}
function segmentDistance(a,b,c,d){
 const abx=b.x-a.x,aby=b.z-a.z,cdx=d.x-c.x,cdy=d.z-c.z;
 const cross=(x,y,xx,yy)=>x*yy-y*xx;
 const denominator=cross(abx,aby,cdx,cdy);
 if(Math.abs(denominator)>1e-9){
  const acx=c.x-a.x,acy=c.z-a.z;
  const t=cross(acx,acy,cdx,cdy)/denominator,u=cross(acx,acy,abx,aby)/denominator;
  if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
 }
 const pointSegment=(p,l,r)=>{
  const dx=r.x-l.x,dz=r.z-l.z,l2=dx*dx+dz*dz;
  const t=l2?clamp(((p.x-l.x)*dx+(p.z-l.z)*dz)/l2,0,1):0;
  return Math.hypot(p.x-l.x-dx*t,p.z-l.z-dz*t);
 };
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function pointIn(poly,p){
 let result=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)result=!result;
 }return result;
}
export function buildZoneAdjacency(zones,tolerance=1.25){
 const clean=zones.map(z=>({id:String(z.id),points:Array.isArray(z.points)?z.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)):[]}));
 const near=Array.from({length:clean.length},()=>[]);
 const boxes=clean.map(z=>({
  minX:Math.min(...z.points.map(p=>p.x)),maxX:Math.max(...z.points.map(p=>p.x)),
  minZ:Math.min(...z.points.map(p=>p.z)),maxZ:Math.max(...z.points.map(p=>p.z))
 }));
 for(let i=0;i<clean.length;i++)for(let j=i+1;j<clean.length;j++){
  const a=clean[i].points,b=clean[j].points;
  if(a.length<3||b.length<3)continue;
  const ba=boxes[i],bb=boxes[j];
  if(ba.maxX+tolerance<bb.minX||bb.maxX+tolerance<ba.minX||
     ba.maxZ+tolerance<bb.minZ||bb.maxZ+tolerance<ba.minZ)continue;
  let touching=a.some(p=>pointIn(b,p))||b.some(p=>pointIn(a,p));
  if(!touching)for(let k=0;k<a.length&&!touching;k++)for(let m=0;m<b.length&&!touching;m++){
   if(segmentDistance(a[k],a[(k+1)%a.length],b[m],b[(m+1)%b.length])<=tolerance)touching=true;
  }
  if(touching){near[i].push(j);near[j].push(i);}
 }
 return near;
}
export function generateBiomeAssignments(zones,raw){
 const settings=normalizeBiomeGenerator(raw);
 if(!Array.isArray(zones)||!zones.length)return {ok:false,error:'Primero debes crear zonas del terreno.'};
 if(zones.some(z=>!z||!Array.isArray(z.points)||z.points.length<3))
  return {ok:false,error:'Hay zonas sin contornos válidos.'};
 const candidates=settings.enabled.filter(id=>settings.weights[id]>0);
 if(!candidates.length)return {ok:false,error:'Habilita al menos un bioma con peso mayor que cero.'};
 const adjacency=buildZoneAdjacency(zones);
 const forbidden=new Set(settings.forbiddenPairs);
 const fixed=zones.map(z=>z.biomeLocked===true?z.biomeId:null);
 for(let i=0;i<fixed.length;i++)
  if(fixed[i]&&!BIOME_IDS.includes(fixed[i]))
   return {ok:false,error:'La zona '+(zones[i].name||zones[i].id)+' tiene un bioma bloqueado desconocido.'};
 const compatible=(a,b)=>!a||!b||a===b||!forbidden.has(keyPair(a,b));
 for(let i=0;i<fixed.length;i++)for(const j of adjacency[i])
  if(j<i&&!compatible(fixed[i],fixed[j]))
   return {ok:false,error:'Dos zonas bloqueadas y vecinas incumplen las reglas de compatibilidad.'};
 const rand=seededRandom(settings.seed);
 const result=fixed.slice(),counts=Object.fromEntries(BIOME_IDS.map(id=>[id,0]));
 for(const id of fixed)if(id)counts[id]++;
 const unlocked=zones.map((z,i)=>i).filter(i=>!fixed[i]);
 // Degree first, then stable seeded tie-breaker. Iterative backtracking with safety limit.
 const ties=unlocked.map(i=>({i,t:rand()}));
 ties.sort((a,b)=>adjacency[b.i].length-adjacency[a.i].length||a.t-b.t);
 const order=ties.map(x=>x.i);
 let attempts=0;
 function backtrack(index){
  if(index===order.length)return true;
  if(++attempts>120000)return false;
  const pos=order[index];
  const options=candidates.filter(id=>adjacency[pos].every(n=>compatible(id,result[n])));
  const arranged=options.map(id=>({id,r:rand(),score:(counts[id]+1)/settings.weights[id]}))
   .sort((a,b)=>a.score-b.score||a.r-b.r);
  for(const option of arranged){
   result[pos]=option.id;counts[option.id]++;
   if(backtrack(index+1))return true;
   counts[option.id]--;result[pos]=null;
  }
  return false;
 }
 if(!backtrack(0))
  return {ok:false,error:'No existe una distribución compatible con los biomas y las restricciones seleccionadas. Relaja las reglas o desbloquea alguna zona.'};
 return {ok:true,seed:settings.seed,assignments:zones.map((zone,i)=>({zoneId:zone.id,biomeId:result[i]})),
  adjacency:adjacency.reduce((sum,edges)=>sum+edges.length,0)/2,changed:zones.filter((z,i)=>z.biomeId!==result[i]).length};
}
export function nextBiomeSeed(seed){return (Math.trunc(finite(seed,1))%2147483646)+1;}
