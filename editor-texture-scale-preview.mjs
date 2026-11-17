import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// The preview and the renderer use precisely the same world-size formula:
// one repeat spans 630 / repeat terrain units. The explorer is 0.9 world units
// high, matching the active WildTrap Play avatar, not a generic mannequin.
export function createTextureScalePreview({onApply,toast,getTextureAssetUrl=url=>url}){
 const $=id=>document.getElementById(id);
 const dialog=$('textureScaleDialog'),canvas=$('textureScaleCanvas');
 const number=$('textureScaleNumber'),world=$('textureScaleWorld'),status=$('textureScalePreviewStatus');
 const apply=$('textureScaleApply'),cancel=$('textureScaleCancel');
 let renderer=null,scene=null,camera=null,orbit=null,plane=null,texture=null,model=null;
 let raf=0,openToken=0,drag=null,request=null,active=null;
 const bounds=(v,min,max)=>Math.max(min,Math.min(max,v));
 const value=()=>bounds(Number(number.value)||8,.25,1000);
 const label=()=>{
  const v=value(),tile=630/v;
  world.textContent=tile.toFixed(2)+' unidades por repetición · '+v.toFixed(2)+' repeticiones / mapa';
  return tile;
 };
 function update(){
  const tile=label();
  if(plane){
   plane.scale.set(tile,tile,1);
   plane.rotation.set(-Math.PI/2,0,0);plane.position.set(0,-.008,0);
   }
   // Keep the explorer anchored at tile center. Camera distance is a
  // visual choice; changing tile size never alters character dimensions.
  if(camera&&renderer){
   const height=Math.max(tile*1.25,3.4);
   const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
   const aspect=w/h;
   camera.left=-height*aspect/2;camera.right=height*aspect/2;
   camera.top=height/2;camera.bottom=-height/2;
   camera.near=.02;camera.far=3000;camera.updateProjectionMatrix();
  }
 }
 function dispose(){
  cancelAnimationFrame(raf);raf=0;drag=null;
  orbit?.dispose();orbit=null;
  model?.traverse(o=>{if(o.isMesh){o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(!m)continue;for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'])m[k]?.dispose?.();m.dispose();}}});
  plane?.geometry?.dispose();plane?.material?.dispose();texture?.dispose();
  renderer?.dispose();
  renderer=null;scene=null;camera=null;plane=null;texture=null;model=null;
  delete window.__wildtrapTexturePreviewMemory;
 }
 async function loadScene(token,item){
  const scene3d=new THREE.Scene();scene3d.background=new THREE.Color('#253c31');
  scene3d.add(new THREE.HemisphereLight(0xffffff,0x65705a,2.6));
  const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(-4,9,7);scene3d.add(key);
  scene=scene3d;
  const geometry=new THREE.PlaneGeometry(1,1);
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide});
  plane=new THREE.Mesh(geometry,mat);
  scene.add(plane);
  const base=new THREE.GridHelper(20,20,0x5aa889,0x406959);
  base.position.y=-.025;scene.add(base);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  camera=new THREE.OrthographicCamera(-5,5,5,-5,.02,3000);
  camera.position.set(7,10,13);camera.lookAt(0,0,0);
   orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;
  orbit.target.set(0,0,0);orbit.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
  update();
  const draw=()=>{
   if(token!==openToken||!dialog.open)return;
   const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
   if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){
    renderer.setSize(width,height,false);update();
   }
   orbit.update();renderer.render(scene,camera);
   window.__wildtrapTexturePreviewMemory={...renderer.info.memory};
   raf=requestAnimationFrame(draw);
  };
  draw();
  const url=item.url;
  const loadImage=new Promise((resolve,reject)=>new THREE.TextureLoader().load(getTextureAssetUrl(url),resolve,undefined,reject));
  const loadGLB=new GLTFLoader().loadAsync('./assets/explorador%201%20wt.glb');
  const settled=await Promise.allSettled([loadImage,loadGLB]);
  if(token!==openToken||!dialog.open){
   if(settled[0].status==='fulfilled')settled[0].value.dispose();
   return;
  }
  if(settled[0].status==='fulfilled'){
   texture=settled[0].value;texture.colorSpace=THREE.SRGBColorSpace;
   texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.anisotropy=4;
   mat.map=texture;mat.needsUpdate=true;
  }
  if(settled[1].status==='fulfilled'){
   const root=settled[1].value.scene;
   // Play uses exactly 0.9 world units in height for Explorer 1.
   root.updateMatrixWorld(true);
   root.traverse(o=>{if(o.scale&&(!Number.isFinite(o.scale.x)||!Number.isFinite(o.scale.y)||!Number.isFinite(o.scale.z)||
    Math.abs(o.scale.x)<1e-8||Math.abs(o.scale.y)<1e-8||Math.abs(o.scale.z)<1e-8))
    o.scale.set(1,1,1);});
   root.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(root),height=box.getSize(new THREE.Vector3()).y;
   if(Number.isFinite(height)&&height>1e-7){
    root.scale.multiplyScalar(.9/height);
    root.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(root),center=b.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(center.x,b.min.y,center.z));
    root.rotation.y=Math.PI;
    model=root;scene.add(root);
   }
  }
  status.textContent=settled[0].status==='rejected'?'No se pudo cargar la imagen.':
   settled[1].status==='rejected'?'Textura lista; no se pudo cargar Explorador 1 WT.':
   'Suelo · plano horizontal XZ · Explorador 1 WT (0.9 unidades)';
 }
 function onDown(e){
  if(e.button!==0||!e.shiftKey)return;
  e.preventDefault();e.stopImmediatePropagation();
  drag={id:e.pointerId,y:e.clientY,scale:value()};
  try{canvas.setPointerCapture(e.pointerId)}catch(_){}
 }
 function onMove(e){
  if(!drag||e.pointerId!==drag.id)return;
  e.preventDefault();e.stopImmediatePropagation();
  // Drag up enlarges the image footprint; down shrinks it.
  number.value=String(Math.round(bounds(drag.scale*Math.exp((e.clientY-drag.y)*.012),.25,1000)*4)/4);
  update();
 }
 function onUp(e){if(drag?.id===e.pointerId)drag=null}
 canvas.addEventListener('pointerdown',onDown,true);
 canvas.addEventListener('pointermove',onMove,true);
 canvas.addEventListener('pointerup',onUp,true);
 canvas.addEventListener('pointercancel',onUp,true);
 number.addEventListener('input',update);
 cancel.onclick=()=>dialog.close();
 apply.onclick=()=>{
  if(!active)return;
  const next={...active,scale:value()};
  dialog.close();onApply(next);
 };
 dialog.addEventListener('close',()=>{openToken++;dispose();active=null});
 return {
  refreshTexture(){
   if(!active||!dialog.open||!plane?.material)return;
   const token=openToken;
   new THREE.TextureLoader().load(getTextureAssetUrl(active.url),next=>{
    if(!dialog.open||token!==openToken){next.dispose();return}
    const old=texture;
    next.colorSpace=THREE.SRGBColorSpace;
    next.wrapS=next.wrapT=THREE.ClampToEdgeWrapping;next.anisotropy=4;
    texture=next;plane.material.map=next;plane.material.needsUpdate=true;
    old?.dispose();
    status.textContent='Imagen actualizada · escala conservada';
   },undefined,()=>{if(dialog.open&&token===openToken)
    status.textContent='No se pudo actualizar la imagen'});
  },
  open(item){
   if(dialog.open)dialog.close();
   active=item;request=item.url;
   $('textureScaleTitle').textContent='Editar suelo · '+item.name;
   number.value=String(bounds(item.scale,.25,1000));
   status.textContent='Cargando textura y Explorador 1 WT…';
   dialog.showModal();
   const token=++openToken;
   void loadScene(token,item).catch(e=>{
    if(token===openToken){status.textContent='Error de vista previa: '+e.message;toast('No se pudo crear la vista previa');}
   });
  }
 };
}
