import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {inPlaceClip} from './playtest-animation.mjs?v=0.9.36';
import {createPlaytestCollider} from './playtest-collision.mjs?v=0.9.39';
import {movementAxes,movementHeading} from './playtest-movement.mjs?v=0.9.33';
// The user's own WT GLB and animation files will be supplied separately.
// No R.O.K. model or animation is loaded.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const forwardOf=yaw=>new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
const EXPLORER_URL='./assets/explorador%201%20wt.glb';

export function createPlaytest({scene,renderer,view,orbit,terrain,cursor,live,heightAt,isHoleAt=()=>false,collisionRoots=[],$,resizeEditor,onStop=()=>{}}){
 const camera=new THREE.PerspectiveCamera(68,1,.12,1400);
 const cameraFocus=new THREE.Vector3();
 const CAMERA_DISTANCE=5.1,CAMERA_HEIGHT=1.45;
 // Keep the classic third-person chase framing; never shorten the orbit
 // due to an intersecting terrain wall.
 const clock=new THREE.Clock();
 const collider=createPlaytestCollider({THREE,terrain,roots:collisionRoots});
 let verticalSpeed=0;
 const player=new THREE.Group();
 player.name='WILDTRAPPlayer1';
 let active=false,busy=false,drag=false,lastX=0,lastY=0,yaw=0,pitch=.22;
 let imported=null,mixer=null,idle=null,walk=null,walkWanted=false;
 const IDLE_CLIP_INDEX=2,RUN_CLIP_INDEX=4;
 let oldShow=null,oldShadow=null;
const hiddenDebugMarkers=[];
 const keys=new Set();
 let modelURL=EXPLORER_URL;
 let localURL=null,loadingPromise=null,sourceError='';
 const modelStatus=()=>$('testModelStatus');
 const say=(message)=>{modelStatus().textContent=message;};
 function resize(){
  const width=Math.max(view.clientWidth,1),height=Math.max(view.clientHeight,1);
  camera.aspect=width/height;camera.updateProjectionMatrix();
 }
 function positionSpawn(){
  const n=live.nodes.find(n=>n.kind==='playerSpawn'&&n.playerSlot===1)||live.nodes.find(n=>n.kind==='spawn');
  const pad=live.size*.5-37;
  const x=n?clamp(n.x,-pad,pad):pad;
  const z=n?clamp(n.z,-pad,pad):pad;
  return{x,z};
 }
 function resetPosition(){
  const s=positionSpawn();
  const ground=collider.floorAt(s.x,s.z,heightAt(s.x,s.z),{stepUp:2,searchDepth:35})?.y??heightAt(s.x,s.z);
  verticalSpeed=0;
  player.position.set(s.x,ground,s.z);
  yaw=0;pitch=.22;
  player.rotation.y=0;
  // Same shoulder chase placement as the earlier Farolera tester.
  const forward=forwardOf(yaw);
  cameraFocus.set(s.x,ground+CAMERA_HEIGHT,s.z).addScaledVector(forward,2.8);
  camera.position.set(s.x+.6,ground+2.9+pitch*1.7,s.z+CAMERA_DISTANCE);
  camera.lookAt(cameraFocus);
 }
 async function fetchModel(){
  if(imported)return imported;
  if(loadingPromise)return loadingPromise;
  const url=modelURL;
  if(!url){say('Selecciona el GLB del Explorador 1 WT para comenzar la prueba.');return null;}
  loadingPromise=(async()=>{
    say('Cargando Explorador 1 WT desde assets…');
    const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),22000);
    let bytes;
    try{
      const response=await fetch(url,{signal:abort.signal,cache:'default'});
      if(!response.ok)throw Error('Servidor HTTP '+response.status);
      bytes=await response.arrayBuffer();
    }catch(err){throw Error('No se pudo cargar el modelo local: '+err.message+
      '. Puedes seleccionar el GLB local en el panel.');}
    finally{clearTimeout(timer)}
    say('Preparando malla y materiales de Explorador 1 WT…');
    const gltf=await new GLTFLoader().parseAsync(bytes,url.startsWith('blob:')?'':url.slice(0,url.lastIndexOf('/')+1));
    if(!gltf.scene)throw Error('El archivo no contiene un modelo 3D');
    const assetInfo=gltf.parser?.json||{};
    if(!Array.isArray(assetInfo.meshes)||assetInfo.meshes.length===0){
      throw Error('El archivo contiene '+(assetInfo.skins?.length||0)+' esqueleto(s) y '+
        (assetInfo.animations?.length||0)+' animaciones, pero 0 mallas. En Blender selecciona '+
        'la malla y el Armature y exporta ambos como glTF Binary (.glb).');
    }
    const visual=new THREE.Group();
    visual.name='Explorador 1 WT';
    visual.add(gltf.scene);
    visual.updateMatrixWorld(true);
    // Inspect raw geometry before trusting the transformed Box3 of a rig.
    // A model may be exported lying down, with zero root scale, or with
    // a skin whose bind pose produces degenerate world bounds.
    const rawBounds=new THREE.Box3(),worldBounds=new THREE.Box3();
    let meshes=0,vertices=0;
    gltf.scene.traverse(obj=>{
      if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
      const positions=obj.geometry.attributes.position;
      if(!positions.count)return;
      meshes++;vertices+=positions.count;
      obj.frustumCulled=false;
      obj.geometry.computeBoundingBox();
      const bound=obj.geometry.boundingBox;
      if(bound&& !bound.isEmpty()){
        rawBounds.union(bound);
        obj.updateWorldMatrix(true,false);
        worldBounds.union(bound.clone().applyMatrix4(obj.matrixWorld));
      }
      // Don't let an accidentally hidden mesh prevent the main character
      // from showing during playtest.
      obj.visible=true;
    });
    if(!meshes||!vertices||rawBounds.isEmpty())
      throw Error('El Explorador GLB no contiene geometría visible: mallas '+meshes+', vértices '+vertices);
    const rawSize=rawBounds.getSize(new THREE.Vector3());
    const worldSize=worldBounds.getSize(new THREE.Vector3());
    // If an exporter flattened an axis, recover a reasonable orientation
    // without touching the original asset or any skin weights.
    if((!Number.isFinite(worldSize.y)||worldSize.y<1e-5)&&rawSize.z>1e-5&&rawSize.z>=rawSize.x){
      visual.rotation.x=-Math.PI/2;
    }else if((!Number.isFinite(worldSize.y)||worldSize.y<1e-5)&&rawSize.x>1e-5&&rawSize.x>rawSize.z){
      visual.rotation.z=Math.PI/2;
    }
    // Some GLBs carry a zeroed parent scale. Unblock mesh rendering only
    // for zero/nonfinite transform axes, retaining valid scale/animations.
    gltf.scene.traverse(obj=>{
      if(obj.scale&&(!Number.isFinite(obj.scale.x)||!Number.isFinite(obj.scale.y)||!Number.isFinite(obj.scale.z)||
        Math.abs(obj.scale.x)<1e-8||Math.abs(obj.scale.y)<1e-8||Math.abs(obj.scale.z)<1e-8)){
        obj.scale.set(
          Number.isFinite(obj.scale.x)&&Math.abs(obj.scale.x)>1e-8?obj.scale.x:1,
          Number.isFinite(obj.scale.y)&&Math.abs(obj.scale.y)>1e-8?obj.scale.y:1,
          Number.isFinite(obj.scale.z)&&Math.abs(obj.scale.z)>1e-8?obj.scale.z:1
        );
      }
    });
    visual.updateMatrixWorld(true);
    let actual=new THREE.Box3().setFromObject(visual);
    let h=actual.getSize(new THREE.Vector3()).y;
    // Last resort: raw dimensions establish an approximate human height.
    if(!Number.isFinite(h)||h<1e-5){
      h=Math.max(rawSize.y,rawSize.z,rawSize.x);
      console.warn('Explorador WT: rig sin bounds transformados; usando dimensiones originales',
        {meshes,vertices,raw:rawSize.toArray(),world:worldSize.toArray()});
    }
    if(!Number.isFinite(h)||h<1e-5)
      throw Error('No se puede calcular el tamaño del Explorador: '+meshes+' mallas, '+vertices+' vértices');
    visual.scale.setScalar(clamp(1.8/h,.00001,10000));
    visual.updateMatrixWorld(true);
    actual=new THREE.Box3().setFromObject(visual);
    if(!actual.isEmpty()&&Number.isFinite(actual.min.y)){
      const center=actual.getCenter(new THREE.Vector3());
      visual.position.sub(new THREE.Vector3(center.x,actual.min.y,center.z));
      console.info('WT Explorer avatar bounds', {height:actual.max.y-actual.min.y,scale:visual.scale.x});
    }else{
      // Geometry exists but world transforms are still malformed.
      // Present a diagnostic instead of silently starting an invisible avatar.
      console.warn('Explorador WT: geometría detectada sin bounds mundiales', {meshes,vertices});
    }
    // The exported WT rig faces +Z while the controller forward is -Z.
    // Turn the visual only; never reverse camera/WASD or playback speed.
    visual.rotation.y=Math.PI;
    player.add(visual);
    gltf.scene.traverse(object=>{
      if(object.isMesh){object.frustumCulled=false;object.castShadow=false;object.receiveShadow=true}
    });
    imported=gltf;
    // WT animation slots are 1-based for the designer:
    // clip 3 = stationary, clip 5 = moving forward with W.
    const clips=gltf.animations||[];
    if(clips.length){
      mixer=new THREE.AnimationMixer(gltf.scene);
      const stationary=inPlaceClip(clips[IDLE_CLIP_INDEX]||clips[0]);
      const running=inPlaceClip(clips[RUN_CLIP_INDEX]||clips[IDLE_CLIP_INDEX]||clips[0]);
      idle=mixer.clipAction(stationary.clip);
      walk=mixer.clipAction(running.clip);
      console.info('WT animaciones in-place', {idle:stationary.corrected,run:running.corrected});
      idle.reset().setLoop(THREE.LoopRepeat).play();
      walkWanted=false;
      say('Explorador WT listo · animación 3 quieto / 5 con W');
    }else say('Explorador WT listo · sin clips incrustados');
    return imported;
  })().catch(error=>{sourceError=error.message;loadingPromise=null;throw error});
  return loadingPromise;
 }
 function setMovingAnimation(wPressed){
  if(!mixer||!idle||!walk||idle===walk)return;
  if(walkWanted===wPressed)return;
  walkWanted=wPressed;
  const from=wPressed?idle:walk,to=wPressed?walk:idle;
  to.reset().setLoop(THREE.LoopRepeat).play();
  from.crossFadeTo(to,.16,false);
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
  // Camera orbit only: no forced character rotation or movement remapping.
  yaw-=dx*.0032;
  pitch=clamp(pitch+dy*.0025,-.18,.95);
  event.preventDefault();
 }
 function handleMouseUp(){drag=false}
 function keyDown(event){
  if(!active)return;
  // Once testing begins, keys belong to the game, not to the previously
  // focused editor button or an invisible control.
  if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))event.target.blur?.();
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
    oldShow=cursor.visible;
    oldShadow=terrain.visible;
    cursor.visible=false;terrain.visible=true;
    collider.refresh();
    resetPosition();
    if(mixer){mixer.stopAllAction();idle?.reset().play();walkWanted=false;}
    hiddenDebugMarkers.length=0;
    scene.traverse(object=>{if(object.userData.editorOnly&&object.visible){hiddenDebugMarkers.push(object);object.visible=false}});
    scene.add(player);
    orbit.enabled=false;
    active=true;busy=false;
    document.body.classList.add('testing');
    keys.clear();
    // Probar was clicked with keyboard/mouse and may retain focus.
    document.activeElement?.blur?.();
    view.tabIndex=0;
    view.focus({preventScroll:true});
    $('test').disabled=false;
    $('test').textContent='Probando…';
    resizeEditor();resize();
    clock.getDelta();
    say(imported?'Modo Probar WILDTRAP · Jugador 1':'Exploración sin personaje · Spawn del Jugador 1');
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
  collider.restore();
  player.removeFromParent();
  cursor.visible=oldShow===null?true:oldShow;
  terrain.visible=oldShadow===null?true:oldShadow;
  for(const node of hiddenDebugMarkers)node.visible=true;
  hiddenDebugMarkers.length=0;
  orbit.enabled=true;walkWanted=false;
  if(mixer)mixer.stopAllAction();
  $('test').textContent='▶ Probar';
  document.body.classList.remove('testing');
  resizeEditor();resize();
  $('testModelStatus').textContent='Modo edición · la prueba no cambió el terreno';
  onStop();
 }
 function frame(){
  if(!active)return null;
  const dt=Math.min(clock.getDelta(),.055);
  // W goes where the camera faces; A/D strafe left/right relative to its yaw.
  // The camera never moves the player without keyboard input.
  const move=movementAxes(keys,yaw),moving=move.moving;
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?6.0:3.8;
  let moved=false;
  if(moving){
    const nx=clamp(player.position.x+move.x*speed*dt,-live.size/2+3,live.size/2-3);
    const nz=clamp(player.position.z+move.z*speed*dt,-live.size/2+3,live.size/2-3);
    const dx=nx-player.position.x,dz=nz-player.position.z;
    // Use real post-cut triangles. A polygon opening is genuinely passable.
    // Probe the width and height of the Explorer, not a solid heightmap cell.
    if(!collider.blocked(player.position.x,player.position.y,player.position.z,dx,dz)){
      const futureGround=collider.floorAt(nx,nz,player.position.y);
      // Don't climb an abrupt vertical ledge. Descending into a cave is allowed.
      if(!futureGround||futureGround.y-player.position.y<=.70){
        player.position.x=nx;player.position.z=nz;
        moved=Math.hypot(dx,dz)>1e-6;
        const heading=movementHeading(move.x,move.z);
        player.rotation.y=-heading; // Mixamo's +Z rig correction
      }
    }
  }
  // Follow the closest supporting cave/arena surface below the character.
  // No floor means gravity, not an invisible barrier around a cut opening.
  const floor=collider.floorAt(player.position.x,player.position.z,player.position.y);
  if(floor&&floor.y>=player.position.y-.28&&verticalSpeed<=0){
    player.position.y=floor.y;verticalSpeed=0;
  }else{
    verticalSpeed=Math.max(-24,verticalSpeed-19.6*dt);
    const nextY=player.position.y+verticalSpeed*dt;
    if(floor&&nextY<=floor.y){player.position.y=floor.y;verticalSpeed=0;}
    else player.position.y=nextY;
  }
  setMovingAnimation(keys.has('KeyW')||keys.has('ArrowUp'));
  if(mixer)mixer.update(dt);
  // Classic Farolera-style chase: camera BEHIND and ABOVE the player,
  // looking slightly ahead. Mouse orbit changes only direction/aim.
  const camF=forwardOf(yaw),camR=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw));
  const desired=player.position.clone().addScaledVector(camF,-CAMERA_DISTANCE).addScaledVector(camR,.6);
  desired.y+=3.0+pitch*1.7;
  // Keep height clearance without forcing the camera toward first person.
  // Never clamp the camera against the uncut heightmap while inside a cave.
  const cameraFloor=collider.floorAt(desired.x,desired.z,player.position.y,{stepUp:3.5,searchDepth:8});
  if(cameraFloor&&Math.abs(cameraFloor.y-player.position.y)<2.5)
    desired.y=Math.max(desired.y,cameraFloor.y+1.5);
  const look=player.position.clone().addScaledVector(camF,2.8);
  look.y+=CAMERA_HEIGHT-pitch*1.35;
  camera.position.lerp(desired,1-Math.exp(-dt*10));
  cameraFocus.lerp(look,1-Math.exp(-dt*14));
  camera.lookAt(cameraFocus);
  $('testCoords').textContent='X '+player.position.x.toFixed(1)+' · Z '+player.position.z.toFixed(1)+' · altura '+player.position.y.toFixed(1);
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
   mixer=null;idle=null;walk=null;walkWanted=false;
   $('testModelStatus').textContent='Personaje propio: '+file.name+' · pulsa Probar';
 }
 return {start,stop,frame,resize,fromFile,get active(){return active},get busy(){return busy},get sourceError(){return sourceError}};
}
