import * as THREE from 'three';
import {createPlaytest} from './playtest.mjs?v=0.9.170';
import {createTerrainTexturePainter} from './editor-terrain-texture-renderer.mjs?v=0.9.170';
import {createPrefabLibrary} from './prefab-library.mjs?v=0.9.160';

const $=id=>document.getElementById(id);
const canvas=$('world'),loading=$('loading'),map=$('map'),ctx=map.getContext('2d');
const SIZE=630,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let play=null,world=null,terrain=null,renderer=null,marked=null;
const stopLoading=(message)=>{loading.textContent=message};
function drawMap(){
 if(!world)return;
 const res=world.resolution,heights=world.heights;
 const image=ctx.createImageData(630,630);
 let min=Infinity,max=-Infinity;
 for(const v of heights){min=Math.min(min,v);max=Math.max(max,v)}
 for(let y=0;y<630;y++)for(let x=0;x<630;x++){
  const i=Math.min(res-1,Math.round(y/630*(res-1)))*res+Math.min(res-1,Math.round(x/630*(res-1)));
  const h=(heights[i]-min)/Math.max(1,max-min),shade=Math.round(26+h*85),index=(y*630+x)*4;
  image.data[index]=shade*.73;image.data[index+1]=shade;image.data[index+2]=shade*.83;image.data[index+3]=255;
 }
 ctx.putImageData(image,0,0);
 const palette={forest:'#50bc8b',mountain:'#a5a9b0',desert:'#d5b97b',swamp:'#527f74',plains:'#a4b96e'};
 for(const zone of world.zones||[]){
  if(zone.isCliff||!zone.points?.length)continue;
  ctx.beginPath();
  zone.points.forEach((p,i)=>{const x=p.x+SIZE/2,y=p.z+SIZE/2;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});
  ctx.closePath();ctx.fillStyle=(palette[zone.biomeId]||'#8cc0bb')+'55';ctx.fill();
  ctx.strokeStyle=palette[zone.biomeId]||'#a2cbc1';ctx.lineWidth=2;ctx.stroke();
 }
 if(marked){
  const x=marked.x+SIZE/2,y=marked.z+SIZE/2;
  ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fillStyle='#00ffdf';ctx.fill();ctx.strokeStyle='#122a24';ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-13,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y+13);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();
 }
}
function heightAt(x,z){
 const n=world.resolution;const fx=clamp((x/SIZE+.5)*(n-1),0,n-1),fz=clamp((z/SIZE+.5)*(n-1),0,n-1);
 const ix=Math.floor(fx),iz=Math.floor(fz),ax=Math.min(n-1,ix+1),az=Math.min(n-1,iz+1),tx=fx-ix,tz=fz-iz,h=world.heights;
 return (h[iz*n+ix]*(1-tx)+h[iz*n+ax]*tx)*(1-tz)+(h[az*n+ix]*(1-tx)+h[az*n+ax]*tx)*tz;
}
function setupJoystick(){
 const pad=$('joystick'),knob=$('knob');let pointer=null;
 function reset(){pointer=null;knob.style.transform='translate(0px,0px)';play?.setJoystick(0,0)}
 function move(e){
  const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const d=Math.max(1,Math.hypot(e.clientX-cx,e.clientY-cy)),max=46;
  const x=(e.clientX-cx)*Math.min(1,max/d),y=(e.clientY-cy)*Math.min(1,max/d);
  knob.style.transform='translate('+x+'px,'+y+'px)';
  play?.setJoystick(x/max,y/max);
 }
 pad.addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(e.pointerId);move(e)});
 pad.addEventListener('pointermove',e=>{if(pointer===e.pointerId){e.preventDefault();move(e)}});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(pointer===e.pointerId)reset()});
 window.addEventListener('blur',reset);
}
function setupMap(){
 $('spawnButton').onclick=()=>{
  if(!play?.active)return;
  marked=null;drawMap();$('coords').textContent='Selecciona un punto del mapa';
  $('mapOverlay').hidden=false;play.setJoystick(0,0);
 };
 map.addEventListener('pointerdown',e=>{
  const rect=map.getBoundingClientRect(),x=clamp((e.clientX-rect.left)/rect.width,0,1),z=clamp((e.clientY-rect.top)/rect.height,0,1);
  marked={x:x*SIZE-SIZE/2,z:z*SIZE-SIZE/2};
  $('coords').textContent='X '+marked.x.toFixed(1)+' · Z '+marked.z.toFixed(1);
  drawMap();
 });
 $('cancel').onclick=()=>{$('mapOverlay').hidden=true;marked=null};
 $('accept').onclick=()=>{
  if(!marked)return;
  const result=play.teleport(marked.x,marked.z);
  if(result){$('mapOverlay').hidden=true;marked=null}
 };
}
async function main(){
 setupJoystick();setupMap();
 try{
  const response=await fetch('./assets/terrain/wildtrap-mobile-world.json',{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  world=await response.json();
  if(world.size!==SIZE||world.heights?.length!==world.resolution**2)throw Error('Escenario incompatible');
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power',alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#789f9f');
  const sky=new THREE.HemisphereLight(0xf1f5e5,0x53634a,2.2);sky.layers.enable(1);scene.add(sky);
  const sun=new THREE.DirectionalLight(0xffe5c0,2.0);sun.layers.enable(1);sun.position.set(-280,600,250);scene.add(sun);
  const n=world.resolution,geo=new THREE.PlaneGeometry(SIZE,SIZE,n-1,n-1);
  geo.rotateX(-Math.PI/2);
  const pos=geo.getAttribute('position');
  for(let i=0;i<pos.count;i++){
   const o=world.terrainVertexOffsets?.[i];
   pos.setXYZ(i,pos.getX(i)+(Number(o?.[0])||0),world.heights[i],pos.getZ(i)+(Number(o?.[1])||0));
  }
  pos.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();
  const base=new THREE.MeshLambertMaterial({color:'#668972',side:THREE.DoubleSide});
  terrain=new THREE.Mesh(geo,base);terrain.name='MobileTerrain';scene.add(terrain);
  const textures=createTerrainTexturePainter({scene,terrain,renderer,material:base,intangibleMaterial:base,live:world,
   toast:console.warn,isTesting:()=>true});
  textures.schedule();
  const models=new THREE.Group();scene.add(models);
  const library=createPrefabLibrary();
  // Only the three placed GLB objects; the entire catalog is never preloaded.
  for(const node of world.nodes.filter(n=>n.kind==='prefab')){
   await library.load(node.prefabId);
   const model=library.instance(node,heightAt,{applyCuts:false});
   if(model)models.add(model);
  }
  const orbit={enabled:false};
  const marker={visible:false};
  function resize(){
   const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
   renderer.setSize(w,h,false);play?.resize();
  }
  play=createPlaytest({scene,renderer,view:canvas,orbit,terrain,cursor:marker,live:world,heightAt,$,resizeEditor:resize,
   collisionRoots:()=>[models],onStop:()=>{}});
  window.addEventListener('resize',resize);resize();
  drawMap();
  await play.start();
  if(!play.active)throw Error(play.sourceError||'No se pudo iniciar Explorador 1 WT');
  loading.hidden=true;
  let previous=0;
  function frame(now){
   requestAnimationFrame(frame);
   if(document.hidden)return;
   const cam=play.frame();
   if(!cam)return;
   if(now-previous>23){renderer.render(scene,cam);previous=now}
  }
  requestAnimationFrame(frame);
 }catch(e){
  console.error('WildTrap móvil:',e);
  stopLoading('No se pudo abrir WildTrap móvil: '+(e.message||e));
 }
}
void main();
