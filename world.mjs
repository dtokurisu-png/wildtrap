// WILDTRAP v0.3 — semilla determinista; geografía fija y cinco biomas rotativos.
// Convención: +Z es el sur; campamento/refugio permanente en la esquina sureste.
export const SIZE=420;
export const SPAWN={x:177,z:177};
export const HUB={x:0,z:0};
export const BIOMES=[
{id:'plains',name:'Pradera',color:0x87ad69,treeDensity:.6},
{id:'forest',name:'Bosque denso',color:0x2d6249,treeDensity:1.3},
{id:'ancient',name:'Bosque antiguo',color:0x426c48,treeDensity:1.1},
{id:'wetlands',name:'Humedales',color:0x5d9588,treeDensity:.8},
{id:'mountain',name:'Montaña',color:0x6b785b,treeDensity:.3}
];
export const SECTORS=[
{id:'northwest',name:'Noroeste',x:-127,z:-117,r:59},
{id:'north',name:'Norte',x:13,z:-133,r:59},
{id:'northeast',name:'Noreste',x:126,z:-70,r:59},
{id:'southwest',name:'Suroeste',x:-111,z:86,r:59},
{id:'southeast',name:'Sureste',x:89,z:102,r:59}
];
export const OBJECTIVES=[
{id:'egg',title:'Recupera un huevo de un nido'},
{id:'code',title:'Encuentra la nota y abre el sello'},
{id:'samples',title:'Recolecta tres muestras'},
{id:'beacons',title:'Activa los dos faros'},
{id:'nest',title:'Investiga un nido'}
];
export function hashSeed(input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function rng(input){let s=hashSeed(input)||1;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export const dist=(x,z,a,b)=>Math.hypot(x-a,z-b);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function segmentDistance(px,pz,ax,az,bx,bz){const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz;const t=len?clamp(((px-ax)*dx+(pz-az)*dz)/len,0,1):0;return dist(px,pz,ax+dx*t,az+dz*t)}
export function routeDistance(x,z){
let d=segmentDistance(x,z,SPAWN.x,SPAWN.z,HUB.x,HUB.z);
for(const s of SECTORS)d=Math.min(d,segmentDistance(x,z,HUB.x,HUB.z,s.x,s.z));
return d;
}
export function sectorAt(x,z){let best=SECTORS[0],d=Infinity;for(const s of SECTORS){const v=dist(x,z,s.x,s.z);if(v<d){best=s;d=v}}return best}
export function clearCorridor(x,z){
return Math.abs(x)<SIZE/2-7 && Math.abs(z)<SIZE/2-7 && dist(x,z,SPAWN.x,SPAWN.z)>17 && dist(x,z,HUB.x,HUB.z)>15 && routeDistance(x,z)>10.5;
}
export function heightAt(world,x,z){
const s=sectorAt(x,z),biome=world.biomeBySector[s.id],d=dist(x,z,s.x,s.z);
const mountain=biome==='mountain';
let base=mountain?23*Math.pow(clamp(1-d/85,0,1),1.35):biome==='wetlands'?-1.6:biome==='plains'?.8:biome==='ancient'?3:2;
const noise=(Math.sin(x*.034+z*.027)*Math.cos(z*.043-x*.021)+Math.sin(x*.067-z*.037)*.4);
const terrain=base+(mountain?2.2:1.2)*noise;
const nearPath=clamp((routeDistance(x,z)-5)/16,0,1);
return Math.max(-2,terrain)*(mountain?lerp(.28,1,nearPath):1);
}
export function passable(world,x,z){
if(Math.abs(x)>SIZE/2-6||Math.abs(z)>SIZE/2-6)return false;
if(dist(x,z,SPAWN.x,SPAWN.z)<20||routeDistance(x,z)<7)return true;
for(const b of world.barriers){
if(b.type==='tree'&&dist(x,z,b.x,b.z)<b.radius)return false;
if(b.type==='rock'&&dist(x,z,b.x,b.z)<b.radius)return false;
}
return true;
}
function chooseSpot(s,r,occupied,spacing=8,tries=100){
for(let i=0;i<tries;i++){const a=r()*Math.PI*2,rad=14+Math.sqrt(r())*(s.r-17),x=Math.round((s.x+Math.cos(a)*rad)*10)/10,z=Math.round((s.z+Math.sin(a)*rad)*10)/10;
if(!clearCorridor(x,z)||occupied.some(o=>dist(x,z,o.x,o.z)<spacing))continue;
const p={x:Math.round(x*10)/10,z:Math.round(z*10)/10,sector:s.id};occupied.push(p);return p
}return null;
}
export function generateWorld(seed='bosque-001'){
const r=rng(seed),occupied=[],biomeIds=BIOMES.map(b=>b.id);
for(let i=biomeIds.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[biomeIds[i],biomeIds[j]]=[biomeIds[j],biomeIds[i]]}
const biomeBySector=Object.fromEntries(SECTORS.map((s,i)=>[s.id,biomeIds[i]]));
const w={version:3,seed,size:SIZE,spawn:{...SPAWN},biomeBySector,terrainVariant:Math.floor(r()*4),trees:[],barriers:[],gates:[],stairs:[],caves:[],nests:[],beacons:[],resources:[],enemies:[],objectives:[],code:String(Math.floor(1000+r()*9000))};
const vegetation=['pino','hoja','hongo','tronco','matorral','roca','flor','helecho','arbol-viejo','arbusto'];
// Anillos naturales alrededor de cada región, con dos aberturas de acceso;
// la ruta principal mira al centro y la secundaria ofrece una alternativa.
for(const s of SECTORS){
const toward=Math.atan2(-s.z,-s.x);
for(let step=0;step<34;step++){
const ang=step*Math.PI*2/34,d1=Math.atan2(Math.sin(ang-toward),Math.cos(ang-toward));
const d2=Math.atan2(Math.sin(ang-toward-1.75),Math.cos(ang-toward-1.75));
if(Math.abs(d1)<.27||Math.abs(d2)<.23)continue;
const radius=s.r+6;
const x=s.x+Math.cos(ang)*radius,z=s.z+Math.sin(ang)*radius;
if(Math.abs(x)>SIZE/2-12||Math.abs(z)>SIZE/2-12||routeDistance(x,z)<10||dist(x,z,SPAWN.x,SPAWN.z)<24)continue;
const b={id:'wall-'+s.id+'-'+step,sector:s.id,x,z,type:r()<.33?'tree':'rock',radius:6.1,altitude:7+Math.floor(r()*5)};
w.barriers.push(b);
}
// Puerta en un paso de la ruta principal. Se abre por interacción; otro paso queda libre.
const gateX=s.x+Math.cos(toward)*(s.r+5),gateZ=s.z+Math.sin(toward)*(s.r+5);
if(dist(gateX,gateZ,SPAWN.x,SPAWN.z)>21)w.gates.push({id:'gate-'+s.id,x:gateX,z:gateZ,sector:s.id,closed:true});
const sideAng=toward+1.75;
w.stairs.push({id:'stairs-'+s.id,x:s.x+Math.cos(sideAng)*(s.r+3),z:s.z+Math.sin(sideAng)*(s.r+3),sector:s.id});
const cave=chooseSpot(s,r,occupied,9);
if(cave)w.caves.push({...cave,id:'cave-'+s.id,active:false});
const nest=chooseSpot(s,r,occupied,13,600);
if(nest)w.nests.push({...nest,id:'nest-'+s.id,rare:biomeBySector[s.id]==='mountain'});
for(let j=0;j<7;j++){const p=chooseSpot(s,r,occupied,6);if(p)w.resources.push({...p,id:'resource-'+w.resources.length})}
for(let j=0;j<4;j++){const p=chooseSpot(s,r,occupied,7);if(p)w.enemies.push({...p,id:'enemy-'+w.enemies.length,type:['muscarabajo','lobrisco','ecosombra','cornazul'][Math.floor(r()*4)]})}
const density=BIOMES.find(b=>b.id===biomeBySector[s.id]).treeDensity;
for(let j=0;j<Math.round(48*density);j++){const p=chooseSpot(s,r,occupied,4.2,80);if(p)w.trees.push({...p,id:'veg-'+w.trees.length,kind:vegetation[Math.floor(r()*vegetation.length)],scale:.65+r()*.9,rotation:r()*Math.PI*2})}

}
for(const s of [SECTORS[1],SECTORS[3]]){const p=chooseSpot(s,r,occupied,9,550);if(p)w.beacons.push({...p,id:'beacon-'+w.beacons.length})}
const pool=OBJECTIVES.slice(1);for(let i=pool.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
w.objectives=[OBJECTIVES[0],...pool.slice(0,2)].map(o=>({...o}));
w.extractionCave=w.caves[Math.floor(r()*w.caves.length)]?.id||null;
for(const c of w.caves)c.active=c.id===w.extractionCave;
return w;
}
export function validateWorld(w){
const errors=[];
if(Object.keys(w.biomeBySector).length!==5||new Set(Object.values(w.biomeBySector)).size!==5)errors.push('Cinco biomas únicos');
if(w.nests.length!==5)errors.push('Se requieren cinco nidos');
if(w.beacons.length!==2)errors.push('Se requieren dos faros');
if(w.objectives.length!==3||w.objectives[0].id!=='egg')errors.push('Tres objetivos con huevo');
if(w.caves.length!==5||w.caves.filter(x=>x.active).length!==1)errors.push('Una extracción entre cinco cuevas');
if(w.spawn.x!==SPAWN.x||w.spawn.z!==SPAWN.z)errors.push('Spawn no fijo');
for(const p of [...w.trees,...w.nests,...w.resources])if(!clearCorridor(p.x,p.z))errors.push('Bloqueo de ruta '+p.id);
for(const s of SECTORS){
const direction=Math.atan2(-s.z,-s.x),r=s.r+7;
const x=s.x+Math.cos(direction)*r,z=s.z+Math.sin(direction)*r;
if(!passable(w,x,z))errors.push('Entrada de región bloqueada '+s.id);
}
return errors;
}
