import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {adaptSummonWalk} from './walk-adapter.mjs';

// Source is the original Farolera, read-only, published by the user's R.O.K. repository.
export const FAROLERA_URL='https://dtokurisu-png.github.io/rok-3d-test/assets/models/casters/farolera/chiara_idle.glb';
// Official summon walk #40 in the R.O.K. Arena 2.5D tester (Semillera).
const WALK_URL='https://dtokurisu-png.github.io/rok-3d-test/animations/Catwalk%20Walking.fbx';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const forwardOf=yaw=>new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));

export function createPlaytest({scene,renderer,view,orbit,terrain,cursor,live,heightAt,isHoleAt=()=>false,$,resizeEditor}){
 const camera=new THREE.PerspectiveCamera(68,1,.12,1400);
 const clock=new THREE.Clock();
 const player=new THREE.Group();
 player.name='FaroleraPlaytestPlayer';
 let active=false,busy=false,drag=false,lastX=0,lastY=0,yaw=0,pitch=.12;
 let imported=null,mixer=null,idle=null,walk=null,walkWanted=false;
 let oldShow=null,oldShadow=null;
const hiddenDebugMarkers=[];
 const keys=new Set();
 let modelURL=FAROLERA_URL;
 let localURL=null,loadingPromise=null,sourceError='';
 const modelStatus=()=>$('testModelStatus');
 const say=(message)=>{modelStatus().textContent=message;};
 function resize(){
  const width=Math.max(view.clientWidth,1),height=Math.max(view.clientHeight,1);
  camera.aspect=width/height;camera.updateProjectionMatrix();
 }
 function positionSpawn(){
  const n=live.nodes.find(n=>n.kind==='spawn');
  const pad=live.size*.5-37;
  const x=n?clamp(n.x,-pad,pad):pad;
  const z=n?clamp(n.z,-pad,pad):pad;
  return{x,z};
 }
 function resetPosition(){
  const s=positionSpawn(),ground=heightAt(s.x,s.z);
  player.position.set(s.x,ground,s.z);
  yaw=0;pitch=.12;
  player.rotation.y=0;
  camera.position.set(s.x+.7,ground+2.1,s.z+3.1);
  camera.lookAt(s.x,ground+1.1,s.z-4);
 }
 async function fetchModel(){
  if(imported)return imported;
  if(loadingPromise)return loadingPromise;
  const url=modelURL;
  loadingPromise=(async()=>{
    say('Descargando Farolera original de R.O.K. (4,9 MB)…');
    const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),22000);
    let bytes;
    try{
      const response=await fetch(url,{signal:abort.signal,cache:'default'});
      if(!response.ok)throw Error('Servidor HTTP '+response.status);
      bytes=await response.arrayBuffer();
    }catch(err){throw Error('No se pudo cargar el modelo original de R.O.K.: '+err.message+
      '. Puedes seleccionar el GLB local en el panel.');}
    finally{clearTimeout(timer)}
    say('Preparando geometría, texturas y animación original…');
    const gltf=await new GLTFLoader().parseAsync(bytes,url.startsWith('blob:')?'':url.slice(0,url.lastIndexOf('/')+1));
    if(!gltf.scene)throw Error('El archivo no contiene un modelo 3D');
    const visual=new THREE.Group();
    visual.name='ROKOriginalFarolera';
    visual.add(gltf.scene);
    visual.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(gltf.scene),size=new THREE.Vector3();
    bounds.getSize(size);
    if(!Number.isFinite(size.y)||size.y<.01)throw Error('Escala GLB inválida');
    // Exactly half of the v0.5 on-screen size (2.18 -> 1.09 world units).
    const scale=clamp(1.09/size.y,.001,100);
    gltf.scene.scale.setScalar(scale);
    gltf.scene.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(gltf.scene);
    const center=box.getCenter(new THREE.Vector3());
    gltf.scene.position.x-=center.x;
    gltf.scene.position.z-=center.z;
    gltf.scene.position.y-=box.min.y;
    // R.O.K. character faces +Z in its source rig; our gameplay forward is -Z.
    visual.rotation.y=Math.PI;
    player.add(visual);
    gltf.scene.traverse(object=>{
      if(object.isMesh){object.frustumCulled=false;object.castShadow=false;object.receiveShadow=true}
    });
    imported=gltf;
    if(gltf.animations?.length){
      mixer=new THREE.AnimationMixer(gltf.scene);
      const clip=gltf.animations.find(a=>/idle|standing/i.test(a.name))||gltf.animations[0];
      idle=mixer.clipAction(clip);idle.play();
      say('Farolera cargada · animación original: '+clip.name);
    }else say('Farolera cargada (GLB sin clips incrustados)');
    // Walk is optional; the source Idle is always available. A loading failure must not block the scene.
    void loadWalk();
    return imported;
  })().catch(error=>{sourceError=error.message;loadingPromise=null;throw error});
  return loadingPromise;
 }
 async function loadWalk(){
   if(!imported||!mixer)return;
   try{
     say('Farolera cargada · preparando caminata oficial #40 del tester R.O.K.…');
     const abort=new AbortController();
     const timer=setTimeout(()=>abort.abort(),18000);
     let data;
     try{
      const response=await fetch(WALK_URL,{signal:abort.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      data=await response.arrayBuffer();
     }finally{clearTimeout(timer)}
     const fbx=new FBXLoader().parse(data,WALK_URL.slice(0,WALK_URL.lastIndexOf('/')+1));
     if(!fbx.animations?.length)throw Error('FBX #40 sin clip');
     const converted=adaptSummonWalk(fbx,fbx.animations[0],imported.scene);
     if(!converted?.tracks?.length)throw Error('Rig incompatible con la Farolera');
     walk=mixer.clipAction(converted);
     walk.enabled=true;walk.setLoop(THREE.LoopRepeat,Infinity);walk.setEffectiveWeight(0);
     say('Farolera · Idle original y caminata oficial de invocaciones #40');
   }catch(error){
     // Never substitute an improvised animation for the requested movement.
     walk=null;
     say('Error caminata oficial #40: '+error.message+' · se mantiene Idle');
   }
 }
 function crossfade(moving){
   if(!mixer||!idle||!walk)return;
   if(walkWanted===moving)return;
   walkWanted=moving;
   if(moving){
     walk.reset().play();walk.enabled=true;
     idle.crossFadeTo(walk,.20,false);
   }else{
     idle.enabled=true;idle.play();
     walk.crossFadeTo(idle,.20,false);
   }
 }
 function handleMouseDown(event){
  if(!active||event.button!==0&&event.button!==2)return;
  event.preventDefault();drag=true;lastX=event.clientX;lastY=event.clientY;
  view.setPointerCapture?.(event.pointerId);
 }
 function handleMouseMove(event){
  if(!active||!drag)return;
  const dx=event.clientX-lastX,dy=event.clientY-lastY;
  lastX=event.clientX;lastY=event.clientY;
  yaw-=dx*.0048;
  pitch=clamp(pitch+dy*.0034,-.24,.61);
  event.preventDefault();
 }
 function handleMouseUp(){drag=false}
 function keyDown(event){
  if(!active||event.target?.matches?.('input,textarea,select'))return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'].includes(event.code)){
   event.preventDefault();keys.add(event.code);
  }
  if(event.code==='Escape'){event.preventDefault();stop()}
 }
 function keyUp(event){keys.delete(event.code)}
 view.addEventListener('pointerdown',handleMouseDown);
 view.addEventListener('pointermove',handleMouseMove);
 window.addEventListener('pointerup',handleMouseUp);
 view.addEventListener('contextmenu',event=>{if(active)event.preventDefault()});
 window.addEventListener('keydown',keyDown);
 window.addEventListener('keyup',keyUp);
 window.addEventListener('blur',()=>keys.clear());
 function start(){
  if(active||busy)return Promise.resolve();
  busy=true;
  $('test').disabled=true;
  return fetchModel().then(()=>{
    if(active)return;
    resetPosition();
    oldShow=cursor.visible;
    oldShadow=terrain.visible;
    cursor.visible=false;terrain.visible=true;
    hiddenDebugMarkers.length=0;
    scene.traverse(object=>{if(object.userData.editorOnly&&object.visible){hiddenDebugMarkers.push(object);object.visible=false}});
    scene.add(player);
    orbit.enabled=false;
    active=true;busy=false;
    document.body.classList.add('testing');
    $('test').disabled=false;
    $('test').textContent='Probando…';
    resizeEditor();resize();
    clock.getDelta();
    say(walk?'Farolera · caminata oficial #40':'Farolera · preparando caminata oficial #40');
  }).catch(err=>{
    busy=false;$('test').disabled=false;sourceError=err.message;
    say('Error: '+err.message);
    $('toast').textContent='No se pudo iniciar prueba: '+err.message;
    // Editor remains functional. No placeholder creature silently replaces the user's model.
  });
 }
 function stop(){
  if(!active)return;
  active=false;drag=false;keys.clear();
  player.removeFromParent();
  cursor.visible=oldShow===null?true:oldShow;
  terrain.visible=oldShadow===null?true:oldShadow;
  for(const node of hiddenDebugMarkers)node.visible=true;
  hiddenDebugMarkers.length=0;
  orbit.enabled=true;walkWanted=false;
  if(mixer){mixer.stopAllAction();idle?.reset().play();if(walk)walk.setEffectiveWeight(0)}
  $('test').textContent='▶ Probar';
  document.body.classList.remove('testing');
  resizeEditor();resize();
  $('testModelStatus').textContent='Modo edición · la prueba no cambió el terreno';
 }
 function frame(){
  if(!active)return null;
  const dt=Math.min(clock.getDelta(),.055);
  const front=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const moving=front!==0||side!==0;
  // Half v0.5 speed: 5.2/8.5 -> 2.6/4.25.
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?4.25:2.6;
  // Character movement uses fixed world axes, unrelated to the camera yaw.
  const f=new THREE.Vector3(0,0,-1),right=new THREE.Vector3(1,0,0);
  if(moving){
    const move=f.multiplyScalar(front).addScaledVector(right,side).normalize();
    const nx=clamp(player.position.x+move.x*speed*dt,-live.size/2+3,live.size/2-3);
    const nz=clamp(player.position.z+move.z*speed*dt,-live.size/2+3,live.size/2-3);
    const ny=heightAt(nx,nz),dy=ny-player.position.y;
    if(!isHoleAt(nx,nz)&&dy<1.2&&dy>-2.2){
      player.position.set(nx,THREE.MathUtils.damp(player.position.y,ny,17,dt),nz);
      const heading=Math.atan2(move.x,-move.z);
      player.rotation.y+=Math.atan2(Math.sin(heading-player.rotation.y),Math.cos(heading-player.rotation.y))*Math.min(1,dt*11);
    }
  }else player.position.y=THREE.MathUtils.damp(player.position.y,heightAt(player.position.x,player.position.z),17,dt);
  crossfade(moving);
  if(mixer)mixer.update(dt);
  const camF=forwardOf(yaw),camR=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw));
  const desired=player.position.clone().addScaledVector(camF,-3.15).addScaledVector(camR,.75);
  desired.y+=2.15+pitch*2.8;
  desired.y=Math.max(desired.y,heightAt(desired.x,desired.z)+1.25);
  camera.position.lerp(desired,1-Math.exp(-dt*14));
  const look=player.position.clone().addScaledVector(camF,4.8);
  look.y+=1.05-pitch*2.1;
  camera.lookAt(look);
  $('testCoords').textContent='X '+player.position.x.toFixed(1)+' · Z '+player.position.z.toFixed(1)+' · altura '+heightAt(player.position.x,player.position.z).toFixed(1);
  return camera;
 }
 function fromFile(file){
   if(!file)return;
   const previous=localURL;
   localURL=URL.createObjectURL(file);
   modelURL=localURL;
   if(previous)URL.revokeObjectURL(previous);
   imported=null;loadingPromise=null;
   if(player.children.length)player.clear();
   mixer=null;idle=null;walk=null;
   $('testModelStatus').textContent='Farolera local seleccionada · pulsa Probar';
 }
 return {start,stop,frame,resize,fromFile,get active(){return active},get busy(){return busy},get sourceError(){return sourceError}};
}
