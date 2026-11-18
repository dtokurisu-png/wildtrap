import * as THREE from 'three';
// Soft, low-cost local player contact shadow. Independent of expensive world shadow maps.
// It never projects on cliff walls: only a walkable collision surface may receive it.
const LIMIT=(v,min,max)=>Math.min(max,Math.max(min,v));
const DEFAULTS=Object.freeze({enabled:true,opacity:.55,size:1.1,softness:.65,offsetX:.22,offsetZ:-.16});
export function createPlaytestContactShadow({scene,settings,groundAt}){
 const config={...DEFAULTS};
 function read(){for(const key of Object.keys(DEFAULTS)){
  const v=settings?.[key];if(typeof DEFAULTS[key]==='boolean')config[key]=v!==false;
  else if(Number.isFinite(Number(v)))config[key]=Number(v);
 }}
 read();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const ctx=canvas.getContext('2d');
 const tex=new THREE.CanvasTexture(canvas);
 tex.colorSpace=THREE.NoColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
 const material=new THREE.MeshBasicMaterial({map:tex,color:0x121713,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
 plane.name='ExplorerContactShadow';plane.rotation.x=-Math.PI/2;
 plane.renderOrder=12;plane.frustumCulled=false;plane.visible=false;
 plane.userData.noCollision=true;
 scene.add(plane);
 const normalAxis=new THREE.Vector3(0,0,1);
 const normal=new THREE.Vector3(0,1,0);
 function draw(){
  ctx.clearRect(0,0,128,128);
  const softness=LIMIT(config.softness,.05,1);
  const gradient=ctx.createRadialGradient(64,64,4,64,64,62);
  gradient.addColorStop(0,'rgba(255,255,255,1)');
  gradient.addColorStop(LIMIT(1-softness,0,.95),'rgba(255,255,255,.86)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  tex.needsUpdate=true;
 }
 function updateSettings(next){
  if(next&&typeof next==='object')Object.assign(config,next);
  config.opacity=LIMIT(Number(config.opacity)||0,0,1);
  config.size=LIMIT(Number(config.size)||1,.35,3);
  config.softness=LIMIT(Number(config.softness)||.05,.05,1);
  config.offsetX=LIMIT(Number(config.offsetX)||0,-2,2);
  config.offsetZ=LIMIT(Number(config.offsetZ)||0,-2,2);
  material.opacity=config.opacity;
  plane.scale.set(1.05*config.size,.72*config.size,1);
  draw();
 }
 updateSettings();
 function update(playerPosition,feetY=playerPosition.y){
  if(!config.enabled){plane.visible=false;return}
  const x=playerPosition.x+config.offsetX,z=playerPosition.z+config.offsetZ;
  const hit=groundAt(x,z,feetY);
  if(!hit||Math.abs(hit.normal?.y??1)<.66||Math.abs(feetY-hit.y)>1.2){
   plane.visible=false;return;
  }
  normal.set(hit.normal?.x||0,Math.abs(hit.normal?.y??1),hit.normal?.z||0).normalize();
  plane.quaternion.setFromUnitVectors(normalAxis,normal);
  plane.position.set(x,hit.y+.026,z);
  plane.visible=true;
 }
 function setVisible(visible){if(!visible)plane.visible=false}
 function dispose(){scene.remove(plane);plane.geometry.dispose();material.dispose();tex.dispose()}
 return {update,updateSettings,setVisible,dispose,get config(){return {...config}}};
}
