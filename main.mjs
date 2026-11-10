import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {generateWorld,validateWorld,SECTORS,BIOMES,SPAWN,SIZE,rng,heightAt,passable,sectorAt} from './world.mjs';

const el=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9cbcb0);scene.fog=new THREE.FogExp2(0xacc8b8,.0026);
const renderer=new THREE.WebGLRenderer({canvas:el('game'),antialias:true,powerPreference:'default'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(67,1,.15,650);
scene.add(new THREE.HemisphereLight(0xe9fff0,0x475945,2.3));
const sun=new THREE.DirectionalLight(0xffe2ac,2);sun.position.set(-60,100,40);scene.add(sun);
const mat=hex=>new THREE.MeshLambertMaterial({color:hex,flatShading:true});
const materials={earth:mat(0x4b7652),wood:mat(0x66513a),leaf:mat(0x42744d),leaf2:mat(0x6f986e),rock:mat(0x7f9182),gold:mat(0xe7be75),egg:mat(0xffe0a7),enemy:mat(0x8b5265),eye:mat(0x77f8df),sample:mat(0x75ddbd),camp:mat(0x8caf96),blue:mat(0x42b7c9),trail:mat(0xa89d78)};
let root,avatar,world,modelTemplate=null,mixer=null,modelURL=null,hp=100,alert=0,mode='playing',respawnAt=0,credited=false,flashUntil=0;
let eggs=0,samples=0,hasCode=false,sealOpen=false,nestVisited=false;
let nestDone=new Set(),picked=new Set(),beaconDone=new Set(),objectiveDone=new Set(),actors=[],enemies=[],keys=new Set();
const rand=rng('fixed-enemy-phase'),clock=new THREE.Clock();
let yaw=0,pitch=.11;
let cameraDrag=false,prevPointer=null;
const tmpV=new THREE.Vector3();

function addMesh(parent,geometry,material,x=0,y=0,z=0){const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o}
function orb(parent,size,material,x=0,y=0,z=0){return addMesh(parent,new THREE.IcosahedronGeometry(size,0),material,x,y,z)}
function geometryTree(t){
const g=new THREE.Group();g.position.set(t.x,heightAt(world,t.x,t.z),t.z);root.add(g);
const scale=t.scale,k=t.kind;
if(k==='roca'){orb(g,1.35*scale,materials.rock,0,.7*scale,0);return}
if(['arbusto','helecho','flor','matorral'].includes(k)){orb(g,.8*scale,k==='flor'?materials.sample:materials.leaf2,0,.65*scale,0);return}
addMesh(g,new THREE.CylinderGeometry(.27*scale,.48*scale,2.6*scale,5),materials.wood,0,1.3*scale,0);
if(k==='tronco')return;
if(k==='hongo'){addMesh(g,new THREE.ConeGeometry(1.2*scale,.9*scale,6),materials.gold,0,2.8*scale,0);return}
addMesh(g,new THREE.ConeGeometry((k==='pino'?1.6:2.1)*scale,3.8*scale,5),k==='pino'?materials.earth:materials.leaf,0,4*scale,0).rotation.y=t.rotation;
if(k==='arbol-viejo')orb(g,.7*scale,materials.leaf2,0,5.8*scale,0);
}
function meshTerrain(){
const segments=140,geo=new THREE.PlaneGeometry(SIZE,SIZE,segments,segments);geo.rotateX(-Math.PI/2);
const pos=geo.attributes.position,colors=new Float32Array(pos.count*3),v=new THREE.Color();
for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=heightAt(world,x,z);pos.setY(i,h-.12);
const s=sectorAt(x,z),id=world.biomeBySector[s.id],biome=BIOMES.find(b=>b.id===id);
v.setHex(biome?.color||0x6d8d67);
const factor=.89+Math.max(-.08,Math.min(.15,h*.006));
colors[i*3]=v.r*factor;colors[i*3+1]=v.g*factor;colors[i*3+2]=v.b*factor;
}
geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();
addMesh(root,geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),0,0,0);
}
function barrierMesh(b){
const g=new THREE.Group();g.position.set(b.x,heightAt(world,b.x,b.z),b.z);root.add(g);
if(b.type==='rock'){
addMesh(g,new THREE.CylinderGeometry(3.2,4.5,b.altitude,5),materials.rock,0,b.altitude/2,0);
orb(g,3.4,materials.earth,0,b.altitude+.3,0);
}else{
for(let i=0;i<3;i++){const x=Math.cos(i*2.1)*2.2,z=Math.sin(i*2.1)*2.2;
addMesh(g,new THREE.CylinderGeometry(.6,1.05,b.altitude,5),materials.wood,x,b.altitude/2,z);
addMesh(g,new THREE.ConeGeometry(3.3,7,5),materials.leaf,x,b.altitude+2,z)}
}
}
function routeLine(ax,az,bx,bz){
const segments=Math.max(2,Math.ceil(Math.hypot(bx-ax,bz-az)/3)),verts=[];
for(let i=0;i<segments;i++){const t1=i/segments,t2=(i+1)/segments,dx=bx-ax,dz=bz-az;
const len=Math.hypot(dx,dz),nx=-dz/len*3.6,nz=dx/len*3.6;
const x1=ax+dx*t1,z1=az+dz*t1,x2=ax+dx*t2,z2=az+dz*t2;
const y1=heightAt(world,x1,z1)+.07,y2=heightAt(world,x2,z2)+.07;
verts.push(x1-nx,y1,z1-nz,x1+nx,y1,z1+nz,x2+nx,y2,z2+nz,
x1-nx,y1,z1-nz,x2+nx,y2,z2+nz,x2-nx,y2,z2-nz);
}
const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();
addMesh(root,geo,new THREE.MeshLambertMaterial({color:0xa69c78,side:THREE.DoubleSide}),0,0,0);
}
function campRefuge(){
const y=heightAt(world,SPAWN.x,SPAWN.z);const g=new THREE.Group();g.position.set(SPAWN.x,y,SPAWN.z);root.add(g);
addMesh(g,new THREE.CylinderGeometry(6,6,.2,10),materials.camp,0,.03,0);
for(let i=0;i<8;i++){const a=Math.PI*2*i/8;const x=Math.sin(a)*8,z=Math.cos(a)*8;
addMesh(g,new THREE.CylinderGeometry(1.5,1.5,6,6),materials.rock,x,3,z)}
addMesh(g,new THREE.ConeGeometry(11,6,8),materials.rock,0,8,0);
addMesh(g,new THREE.BoxGeometry(2.7,1.8,1.8),materials.wood,-2,1,2);
addMesh(g,new THREE.CylinderGeometry(1.6,1.6,.3,7),materials.gold,2,.35,1);
marker('camp','camp',SPAWN.x,SPAWN.z,9);
}
function createGate(x,z,id){
const g=new THREE.Group();g.position.set(x,heightAt(world,x,z),z);root.add(g);
for(let i=-2;i<=2;i++)addMesh(g,new THREE.CylinderGeometry(.12,.16,5.7,5),materials.gold,i*.95,2.85,0);
addMesh(g,new THREE.BoxGeometry(5.7,.4,.5),materials.wood,0,4.5,0);
addMesh(g,new THREE.BoxGeometry(5.7,.4,.5),materials.wood,0,.5,0);
return marker('gate',id,x,z,5.8,g);
}
function createStairs(stair){
const group=new THREE.Group();group.position.set(stair.x,heightAt(world,stair.x,stair.z),stair.z);root.add(group);
for(let i=0;i<5;i++)addMesh(group,new THREE.BoxGeometry(5,.35,1.1),materials.rock,0,.2+i*.16,-2+i*1.05);
}

function marker(type,id,x,z,range=3,existingGroup=null){
const g=existingGroup||new THREE.Group();if(!existingGroup){g.position.set(x,heightAt(world,x,z),z);root.add(g)}
if(type==='nest'){const ring=addMesh(g,new THREE.TorusGeometry(1.8,.4,4,10),materials.wood,0,.25,0);ring.rotation.x=Math.PI/2;orb(g,.75,materials.egg,0,1,0)}
if(type==='resource')orb(g,.55,materials.sample,0,.8,0);
if(type==='beacon'){addMesh(g,new THREE.CylinderGeometry(.5,.75,3,6),materials.rock,0,1.5,0);orb(g,.65,materials.blue,0,3.35,0)}
if(type==='code')addMesh(g,new THREE.BoxGeometry(1.3,1.4,.25),materials.gold,0,1.3,0);
if(type==='seal'){addMesh(g,new THREE.BoxGeometry(2,2.6,.6),materials.rock,0,1.3,0);orb(g,.45,materials.blue,0,1.8,0)}
if(type==='pack')addMesh(g,new THREE.BoxGeometry(1.5,.8,1.2),materials.gold,0,.5,0);
if(type==='enemy'){orb(g,1,materials.enemy,0,1.25,0);orb(g,.22,materials.eye,-.35,1.52,.77);orb(g,.22,materials.eye,.35,1.52,.77)}
if(type==='cave'){
const door=addMesh(g,new THREE.BoxGeometry(4,5,.45),materials.wood,0,2.6,0);
addMesh(g,new THREE.BoxGeometry(6,1.4,2),materials.rock,0,5.3,0);
addMesh(g,new THREE.CylinderGeometry(.45,.45,5.5,5),materials.rock,-3,2.7,0);
addMesh(g,new THREE.CylinderGeometry(.45,.45,5.5,5),materials.rock,3,2.7,0);
if(world.extractionCave===id){door.material=materials.gold;orb(g,.6,materials.blue,0,4.6,1)}
}
const a={type,id,x,z,range,group:g};actors.push(a);return a;
}

function build(seed){
world=generateWorld(seed);const problems=validateWorld(world);if(problems.length)throw new Error(problems.join('; '));
if(root){scene.remove(root);root.traverse(o=>o.geometry?.dispose())}
root=new THREE.Group();scene.add(root);actors=[];enemies=[];nestDone.clear();picked.clear();beaconDone.clear();objectiveDone.clear();
eggs=0;samples=0;hasCode=false;sealOpen=false;nestVisited=false;hp=100;alert=0;mode='playing';credited=false;
meshTerrain();
routeLine(SPAWN.x,SPAWN.z,0,0);for(const s of SECTORS)routeLine(0,0,s.x,s.z);
for(const b of world.barriers)barrierMesh(b);
for(const st of world.stairs)createStairs(st);
for(const gate of world.gates)createGate(gate.x,gate.z,gate.id);
for(const t of world.trees)geometryTree(t);
for(const n of world.nests)marker('nest',n.id,n.x,n.z,3.2);
for(const r of world.resources)marker('resource',r.id,r.x,r.z,2.5);
for(const b of world.beacons)marker('beacon',b.id,b.x,b.z,3.3);
for(const cave of world.caves)marker('cave',cave.id,cave.x,cave.z,4.5);
const note=world.nests[3]||world.nests[0],seal=world.nests[1]||world.nests[2];
if(note)marker('code','note',note.x+5,note.z,3.1);
if(seal)marker('seal','seal',seal.x+5,seal.z,3.1);
for(const e of world.enemies){const a=marker('enemy',e.id,e.x,e.z);
enemies.push({...a,species:e.type,homeX:e.x,homeZ:e.z,state:'patrol',stun:0,cooldown:0,offset:rand()*6.28})}
avatar=new THREE.Group();root.add(avatar);
const standin=new THREE.Group();addMesh(standin,new THREE.CapsuleGeometry(.8,1.4,3,7),materials.blue,0,1.45,0);avatar.add(standin);avatar.userData.standin=standin;
avatar.position.set(SPAWN.x,heightAt(world,SPAWN.x,SPAWN.z),SPAWN.z);yaw=-Math.PI*.75;avatar.rotation.y=yaw;
if(modelTemplate)applyModel(modelTemplate);
campRefuge();el('seed').value=seed;notice('Refugio seguro: inicia la expedición');hud();
}

function applyModel(model){
if(!avatar)return;
if(avatar.userData.model){avatar.remove(avatar.userData.model);mixer=null}
const copy=model.clone(true);avatar.add(copy);avatar.userData.model=copy;avatar.userData.standin.visible=false;
el('modelStatus').textContent='Farolera GLB cargada (personaje temporal)';
}
function loadModel(url){
el('modelStatus').textContent='Cargando Farolera GLB…';
new GLTFLoader().load(url,gltf=>{
const m=gltf.scene;let box=new THREE.Box3().setFromObject(m),size=new THREE.Vector3();box.getSize(size);
m.scale.setScalar(Math.min(4/Math.max(size.y,.001),3));
box.setFromObject(m);m.position.y-=box.min.y;
modelTemplate=m;applyModel(m);
mixer=null;
if(gltf.animations?.length){mixer=new THREE.AnimationMixer(avatar.userData.model);mixer.clipAction(gltf.animations[0]).play()}
},undefined,e=>{el('modelStatus').textContent='Error de GLB: '+String(e).slice(0,90)});
}
function notice(message){el('message').textContent=message;el('message').style.opacity='1';flashUntil=performance.now()+2800}
const dist=(x,z,a,b)=>Math.hypot(x-a,z-b);
function objectives(){
for(const o of world.objectives){
if(objectiveDone.has(o.id))continue;
if((o.id==='egg'&&eggs>=1)||(o.id==='samples'&&samples>=3)||(o.id==='beacons'&&beaconDone.size===2)||(o.id==='code'&&sealOpen)||(o.id==='nest'&&nestVisited)){objectiveDone.add(o.id);notice('Objetivo: '+o.title)}
}}
function hud(){
objectives();el('status').textContent='Refugio SE · 5 biomas · Semilla: '+world.seed+' · Vida: '+Math.max(0,Math.ceil(hp))+' · Alerta: '+Math.ceil(alert)+'% | Huevos: '+eggs+'/3 · Muestras: '+samples+' · Faros: '+beaconDone.size+'/2';
el('objectives').replaceChildren(...world.objectives.map(o=>{const li=document.createElement('li');li.textContent=o.title;if(objectiveDone.has(o.id))li.className='done';return li}))
}
function nearest(){
if(mode!=='playing')return null;
return actors.filter(a=>a.type!=='enemy'&&a.type!=='camp'&&!picked.has(a.id)&&dist(avatar.position.x,avatar.position.z,a.x,a.z)<a.range)
.sort((a,b)=>dist(avatar.position.x,avatar.position.z,a.x,a.z)-dist(avatar.position.x,avatar.position.z,b.x,b.z))[0]||null;
}
function interact(){
if(mode!=='playing')return;
const a=nearest();if(!a){notice('Acércate a un objeto interactivo');return}
if(a.type==='nest'){if(eggs>=3){notice('Mochila llena: tres huevos');return}eggs++;nestVisited=true;alert=Math.min(100,alert+26);picked.add(a.id);a.group.visible=false;notice('Huevo robado: ¡las criaturas escucharon!')}
if(a.type==='resource'){samples++;picked.add(a.id);a.group.visible=false;notice('Muestra recuperada')}
if(a.type==='beacon'){beaconDone.add(a.id);picked.add(a.id);a.group.children.forEach(ch=>{if(ch.material===materials.blue)ch.material=materials.sample});notice('Faro activado')}
if(a.type==='code'){hasCode=true;picked.add(a.id);a.group.visible=false;notice('Código encontrado: '+world.code)}
if(a.type==='seal'){if(!hasCode){notice('Busca la nota antes de abrirlo');return}sealOpen=true;picked.add(a.id);a.group.visible=false;notice('Sello abierto')}
if(a.type==='gate'){picked.add(a.id);a.group.visible=false;notice('Compuerta desbloqueada; paso habilitado')}
if(a.type==='cave'){if(a.id===world.extractionCave)extract();else notice('Cueva secundaria: sin salida en esta expedición')}
if(a.type==='pack'){if(eggs+a.eggs>3){notice('Necesitas espacio para recuperar la mochila');return}eggs+=a.eggs;samples+=a.samples;picked.add(a.id);a.group.visible=false;notice('Mochila recuperada')}
hud();
}
function defend(){
if(mode!=='playing')return;alert=Math.min(100,alert+12);
const target=enemies.filter(e=>e.stun<=0&&dist(e.x,e.z,avatar.position.x,avatar.position.z)<6).sort((a,b)=>dist(a.x,a.z,avatar.position.x,avatar.position.z)-dist(b.x,b.z,avatar.position.x,avatar.position.z))[0];
if(target){target.stun=3;target.state='retreat';notice('Criatura ahuyentada')}else notice('Ninguna criatura al alcance');
}
function save(){
if(mode!=='extracted'){notice('Extrae primero en el campamento');return}
if(credited){notice('Esta expedición ya fue guardada');return}
try{const p=JSON.parse(localStorage.getItem('wildtrap-demo')||'{"eggs":0,"samples":0,"runs":0}');
p.eggs+=eggs;p.samples+=samples;p.runs++;localStorage.setItem('wildtrap-demo',JSON.stringify(p));credited=true;notice('Guardado local de prueba completado')}
catch(e){notice('No se pudo guardar en el navegador')}
}
function extract(){
const cave=world.caves.find(c=>c.id===world.extractionCave);
if(!cave||dist(avatar.position.x,avatar.position.z,cave.x,cave.z)>=5.3){notice('Encuentra la cueva de extracción marcada en el minimapa');return}
if(!eggs){notice('Primero consigue un huevo');return}
mode='extracted';hud();notice('¡Expedición completa! Huevos '+eggs+' · Objetivos '+objectiveDone.size+'/3');save();
}

function knocked(now){
if(mode!=='playing')return;
if(eggs||samples){const a=marker('pack','pack-'+now,avatar.position.x+2,avatar.position.z+1,3);a.eggs=eggs;a.samples=samples;eggs=0;samples=0}
mode='down';respawnAt=now+4500;notice('Has caído. Mochila recuperable en el bosque');hud();
}
function gateBlocks(x,z){
return world.gates.some(g=>!picked.has(g.id)&&Math.abs(x-g.x)<3.8&&Math.abs(z-g.z)<2);
}
function tick(dt,now){
if(mode==='down'){if(now>=respawnAt){mode='playing';hp=100;alert=20;avatar.position.set(SPAWN.x,heightAt(world,SPAWN.x,SPAWN.z),SPAWN.z);notice('Has reaparecido en el refugio')}return}
if(mode!=='playing')return;
const strafe=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
const moving=Math.hypot(strafe,forward)>0,run=keys.has('ShiftLeft')||keys.has('ShiftRight');
if(moving){
const speed=run?12:7.4,scale=speed*dt/Math.hypot(strafe,forward);
const dx=(Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*scale;
const dz=(Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*scale;
const x=avatar.position.x+dx,z=avatar.position.z+dz;
const y=heightAt(world,x,z),dy=y-avatar.position.y;
if(passable(world,x,z)&&!gateBlocks(x,z)&&dy<2.5&&dy>-3.2){avatar.position.x=x;avatar.position.z=z;avatar.position.y=y}
avatar.rotation.y=yaw;
alert=Math.min(100,alert+dt*(run?5.5:.6))
}else alert=Math.max(0,alert-dt*2);
for(const e of enemies){
if(e.stun>0){e.stun-=dt;continue}
e.cooldown=Math.max(0,e.cooldown-dt);
const d=dist(e.x,e.z,avatar.position.x,avatar.position.z);
const detect=(e.species==='ecosombra'?17:e.species==='lobrisco'?15:10)+(run?8:0)+alert*.06;
e.state=e.species==='muscarabajo'&&d<8?'retreat':d<detect?'chase':'patrol';
let tx=e.homeX+Math.sin(now*.0004+e.offset)*5,tz=e.homeZ+Math.cos(now*.0003+e.offset)*5,speed=1.3;
if(e.state==='chase'){tx=avatar.position.x;tz=avatar.position.z;speed=e.species==='lobrisco'?5.3:3.5}
if(e.state==='retreat'){tx=e.homeX;tz=e.homeZ;speed=6}
const vx=tx-e.x,vz=tz-e.z,len=Math.hypot(vx,vz);
if(len>.3){const x=e.x+vx/len*speed*dt,z=e.z+vz/len*speed*dt;if(passable(world,x,z)&&!gateBlocks(x,z)&&Math.abs(heightAt(world,x,z)-heightAt(world,e.x,e.z))<2.8){e.x=x;e.z=z;e.group.position.set(x,heightAt(world,x,z),z)}}
if(e.state==='chase'&&d<2.5&&e.cooldown<=0){hp-=e.species==='lobrisco'?20:9;e.cooldown=1.8;alert=Math.min(100,alert+5);if(hp<=0){knocked(now);break}}
}
hud();
}

function minimap(){
const c=el('map'),ctx=c.getContext('2d'),w=c.width;
ctx.clearRect(0,0,w,w);ctx.fillStyle='#103426';ctx.fillRect(0,0,w,w);
const pt=(x,z)=>[(x/SIZE+.5)*w,(z/SIZE+.5)*w];
for(const s of SECTORS){const [x,y]=pt(s.x,s.z);ctx.beginPath();ctx.arc(x,y,s.r/SIZE*w,0,7);const b=BIOMES.find(q=>q.id===world.biomeBySector[s.id]);ctx.fillStyle='#'+(b?.color||0x3e7052).toString(16).padStart(6,'0');ctx.fill()}
for(const c of world.caves){const [x,y]=pt(c.x,c.z);ctx.fillStyle=c.active?'#f6a2a2':'#855f59';ctx.fillRect(x-3,y-3,6,6)}
{const [x,y]=pt(SPAWN.x,SPAWN.z);ctx.fillStyle='#62b4ff';ctx.fillRect(x-3,y-3,6,6)}
for(const a of actors){if(a.type==='enemy'||picked.has(a.id))continue;const [x,y]=pt(a.x,a.z);ctx.fillStyle=a.type==='nest'?'#ffde91':a.type==='resource'?'#8cf8c5':'#87d8ff';ctx.fillRect(x-2,y-2,4,4)}
for(const e of enemies){const [x,y]=pt(e.x,e.z);ctx.fillStyle='#fd948d';ctx.fillRect(x-1,y-1,3,3)}
const [x,y]=pt(avatar.position.x,avatar.position.z);ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fillStyle='#fff';ctx.fill();
}
function resize(){renderer.setSize(window.innerWidth,window.innerHeight,false);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize);resize();
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;keys.add(e.code);if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;
if(e.code==='KeyE')interact();if(e.code==='Space')defend();if(e.code==='KeyX')extract();if(e.code==='KeyR')build(world.seed)});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
el('new').addEventListener('click',()=>{try{build(el('seed').value.trim()||'bosque-001')}catch(e){notice('Error de generación: '+e.message)}});
el('save').addEventListener('click',save);
el('modelFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(modelURL)URL.revokeObjectURL(modelURL);modelURL=URL.createObjectURL(file);loadModel(modelURL)});
let frames=0;
function frame(){
requestAnimationFrame(frame);
const dt=Math.min(clock.getDelta(),.05),now=performance.now();
if(mixer)mixer.update(dt);
tick(dt,now);
if(avatar){
const x=avatar.position.x,y=avatar.position.y,z=avatar.position.z;
const back=7.8,overShoulder=1.3;
const desired=new THREE.Vector3(x-Math.sin(yaw)*back+Math.cos(yaw)*overShoulder,
y+4.2+Math.sin(pitch)*4,
z-Math.cos(yaw)*back-Math.sin(yaw)*overShoulder);
const ground=heightAt(world,desired.x,desired.z);
desired.y=Math.max(desired.y,ground+2.0);
camera.position.lerp(desired,Math.min(1,dt*9));
camera.lookAt(x+Math.sin(yaw)*6,y+2.25+Math.sin(pitch)*5,z+Math.cos(yaw)*6);
minimap();
const a=nearest();
el('prompt').textContent=mode==='playing'?(a?'E · '+({nest:'Robar huevo',resource:'Recoger muestra',beacon:'Activar faro',code:'Leer nota',seal:'Abrir sello',pack:'Recuperar mochila',gate:'Abrir compuerta',cave:'Investigar cueva'}[a.type]||'Interactuar'):'Busca el huevo y localiza la cueva de extracción'):mode==='down'?'Incapacitado: reaparecerás en el refugio':'';
}
if(now>flashUntil)el('message').style.opacity='0';
renderer.render(scene,camera);
}
renderer.domElement.addEventListener('pointerdown',e=>{cameraDrag=true;prevPointer={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId)});
renderer.domElement.addEventListener('pointerup',()=>{cameraDrag=false;prevPointer=null});
renderer.domElement.addEventListener('pointermove',e=>{if(!cameraDrag||!prevPointer)return;const dx=e.clientX-prevPointer.x,dy=e.clientY-prevPointer.y;yaw-=dx*.0045; pitch=THREE.MathUtils.clamp(pitch+dy*.003,-.35,.55);prevPointer={x:e.clientX,y:e.clientY}});

build(new URLSearchParams(location.search).get('seed')||'bosque-001');
camera.position.set(SPAWN.x,5,SPAWN.z+9);camera.lookAt(SPAWN.x,2,SPAWN.z);
const url=new URLSearchParams(location.search).get('farolera');if(url)loadModel(url);
requestAnimationFrame(frame);
window.__wildtrapReady?.();
