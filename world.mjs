// WILDTRAP: generador determinista, independiente del render.
export const SIZE=240;
export const SECTORS=[
{id:'camp',name:'Campamento',x:0,z:0,r:21,color:0x557357},
{id:'outer',name:'Bosque exterior',x:-61,z:34,r:40,color:0x436b47},
{id:'deep',name:'Bosque profundo',x:52,z:43,r:40,color:0x345e41},
{id:'wet',name:'Humedales',x:-44,z:-62,r:35,color:0x396d66},
{id:'shrine',name:'Santuario',x:65,z:-52,r:38,color:0x686349}
];
export const OBJECTIVES=[
{id:'egg',title:'Recupera un huevo de un nido'},
{id:'code',title:'Encuentra la nota y abre el sello'},
{id:'samples',title:'Recolecta tres muestras'},
{id:'beacons',title:'Activa los dos faros'},
{id:'nest',title:'Investiga el santuario de nidos'}
];
export function hashSeed(input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function rng(input){let s=hashSeed(input)||1;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const distance=(a,b,c,d)=>Math.hypot(a-c,b-d);
export function clearCorridor(x,z){
if(Math.abs(x)>SIZE/2-7||Math.abs(z)>SIZE/2-7)return false;
if(distance(x,z,0,0)<13)return false;
for(const s of SECTORS.slice(1)){let len=s.x*s.x+s.z*s.z,u=Math.max(0,Math.min(1,(x*s.x+z*s.z)/len));if(distance(x,z,s.x*u,s.z*u)<7)return false}
return true;
}
function place(s,rand,occupied,spacing=5,tries=140){
for(let i=0;i<tries;i++){const a=rand()*Math.PI*2,r=10+Math.sqrt(rand())*(s.r-13);const x=s.x+Math.cos(a)*r,z=s.z+Math.sin(a)*r;
if(!clearCorridor(x,z)||occupied.some(p=>distance(x,z,p.x,p.z)<spacing))continue;
const p={x,z,sector:s.id};occupied.push(p);return p}
return null;
}
export function generateWorld(seed='bosque-001'){
const rand=rng(seed),occupied=[],trees=[],nests=[],beacons=[],resources=[],enemies=[];
const species=['muscarabajo','lobrisco','ecosombra','cornazul'];
const vegetation=['pino','hoja','hongo','tronco','matorral','roca','flor','helecho','arbol-viejo','arbusto'];
for(const s of SECTORS.slice(1)){
const p=place(s,rand,occupied,10,500);
if(p)nests.push({...p,id:'n-'+s.id,rare:s.id==='shrine'});
}
for(const s of [SECTORS[2],SECTORS[3]]){const p=place(s,rand,occupied,8,500);if(p)beacons.push({...p,id:'b'+beacons.length})}
for(const s of SECTORS.slice(1)){
for(let j=0;j<5;j++){const p=place(s,rand,occupied,4);if(p)resources.push({...p,id:'r'+resources.length})}
for(let j=0;j<4;j++){const p=place(s,rand,occupied,4);if(p)enemies.push({...p,id:'e'+enemies.length,type:species[Math.floor(rand()*species.length)]})}
for(let j=0;j<(s.id==='wet'?45:58);j++){
const p=place(s,rand,occupied,3.6,125);
if(p)trees.push({...p,id:'v'+trees.length,kind:vegetation[Math.floor(rand()*vegetation.length)],scale:.7+rand()*.85,rotation:rand()*Math.PI*2})
}
}
const pool=OBJECTIVES.slice(1);
for(let i=pool.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
const objectives=[OBJECTIVES[0],...pool.slice(0,2)].map(x=>({...x}));
return{seed,terrainVariant:Math.floor(rand()*4),trees,nests,beacons,resources,enemies,objectives,code:String(Math.floor(1000+rand()*9000))}
}
export function validateWorld(w){let errors=[];
if(w.objectives.length!==3||!w.objectives.some(x=>x.id==='egg'))errors.push('Objetivos incorrectos');
if(w.nests.length<3)errors.push('Faltan nidos');
if(w.beacons.length!==2)errors.push('Faltan faros');
for(const n of w.nests)if(!clearCorridor(n.x,n.z))errors.push('Nido bloqueado');
return errors}
