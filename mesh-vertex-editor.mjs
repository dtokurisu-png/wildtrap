import * as THREE from 'three';
import {normalizedLocks,cleanVertexOperations} from './mesh-deform.mjs?v=0.9.12';

// Real GLB vertex editor: x-ray points / wireframe, rectangular vertex selection,
// locked-vertex persistence, and deformation of the remaining vertices.
// Overlay never changes the shared cached GLB geometry or the actual world JSON
// until a user explicitly locks vertices or applies a deformation.
export function createMeshVertexEditor({
 scene,camera,view,marquee,$,getSelectedNode,getRoot,getMode,
 snapshot,draw,persist,toast
}){
 let active=false,currentId=null,gesture=null;
 const selected=new Set();
 const samples=[],disposables=[],faded=[];
 const vertexBuckets=new Map();
 const maxPoints=40000;
 const meshCount=()=>$('meshVertexCount');
 const setText=(id,value)=>{const el=$(id);if(el)el.textContent=String(value)};
 const controls=$('meshEditControls');
 if(!controls)throw Error('Falta el panel de edición de malla');
 const pointKey=(key,index)=>key+':'+index;
 const lockKey=(v)=>v.x.toFixed(4)+':'+v.y.toFixed(4)+':'+v.z.toFixed(4);
 function clearVisuals(){
  for(const {mesh,orig,clone} of faded){
   if(mesh.material===clone)mesh.material=orig;
   for(const m of Array.isArray(clone)?clone:[clone])m?.dispose?.();
  }
  faded.length=0;
  for(const {object,geometry,material} of disposables){
   object.parent?.remove(object);
   geometry?.dispose?.();material?.dispose?.();
  }
  disposables.length=0;samples.length=0;vertexBuckets.clear();
 }
 function release(){
  if(gesture){
   try{if(view.hasPointerCapture?.(gesture.pointerId))view.releasePointerCapture(gesture.pointerId)}catch(_){}
  }
  gesture=null;marquee.style.display='none';
 }
 function dispose(){release();clearVisuals();selected.clear();currentId=null;updateInfo()}
 function getTarget(){
  const node=getSelectedNode();
  if(!node||node.kind!=='prefab'||node.editorHidden||node.editorIntangible)return null;
  const root=getRoot(node.id);
  return root?{node,root}:null;
 }
 function updateInfo(){
  const node=getSelectedNode();
  const supports=Boolean(node?.kind==='prefab'&&!node.editorHidden&&!node.editorIntangible&&getRoot(node.id));
  controls.hidden=!active;
  for(const id of ['meshLockVertices','meshUnlockVertices','meshScaleApply','meshResetDeform']){
   const button=$(id);if(button)button.disabled=!supports||(id==='meshLockVertices'||id==='meshUnlockVertices'?selected.size===0:false);
  }
  const locks=normalizedLocks(node?.vertexLocks);
  const totalLocked=Object.values(locks).reduce((sum,ids)=>sum+ids.length,0);
  setText('meshVertexCount',samples.length+(samples.length>=maxPoints?' (límite visual)':''));
  setText('meshVertexSelected',selected.size);
  setText('meshVertexLocked',totalLocked);
  setText('meshEditHelp',!active?'Activa Malla para editar vértices':
   !node?'Selecciona un modelo GLB desde Objetos':
   node.kind!=='prefab'?'Este objeto procedimental no tiene una malla GLB editable':
   node.editorIntangible?'Desactiva Intangible antes de editar esta malla':
   node.editorHidden?'Haz visible el modelo antes de editarlo':
   !getRoot(node.id)?'El archivo GLB todavía está cargando':
   'Clic en un vértice o arrastra un rectángulo. Ctrl añade o quita vértices.');
 }
 function refreshColors(){
  const node=getSelectedNode(),locks=normalizedLocks(node?.vertexLocks);
  const lockedSets=new Map(Object.entries(locks).map(([k,v])=>[k,new Set(v)]));
  for(const {geometry,sampleRefs} of disposables.filter(x=>x.sampleRefs)){
   const colors=geometry.getAttribute('color');
   for(const item of sampleRefs){
    const key=pointKey(item.key,item.index);
    const picked=selected.has(key);
    const locked=lockedSets.get(item.key)?.has(item.index)===true;
    colors.setXYZ(item.paintIndex,...(picked?[1,.82,.24]:locked?[1,.3,.38]:[.1,1,.86]));
   }
   colors.needsUpdate=true;
  }
  updateInfo();
 }
 // Rebuild is called after the editor recreates GLB instances, and when the
 // selected model changes. No overlay appears on invisible/intangible models.
 function rebuild(){
  clearVisuals();
  if(!active){updateInfo();return}
  const target=getTarget();
  if(!target){currentId=null;selected.clear();updateInfo();return}
  const {node,root}=target;
  if(currentId!==node.id){selected.clear();currentId=node.id}
  scene.updateMatrixWorld(true);
  let painted=0,meshCounter=0;
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||!mesh.geometry?.getAttribute('position'))return;
   const key=mesh.userData.wildtrapMeshKey;
   if(key===undefined)return;
   const position=mesh.geometry.getAttribute('position');
   const count=position.count;
   const left=maxPoints-painted;
   if(left<=0)return;
   const step=Math.max(1,Math.ceil(count/left));
   const verts=[],colors=[],sampleRefs=[];
   // Make selection dots ignore depth, revealing back-face vertices too.
   for(let i=0;i<count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const v=new THREE.Vector3(x,y,z);
    const id=pointKey(key,i);
    const token=lockKey(v.clone().applyMatrix4(mesh.matrixWorld));
    const bucket=vertexBuckets.get(token)||[];
    bucket.push(id);vertexBuckets.set(token,bucket);
    if(i%step!==0)continue;
    const sample={key,index:i,mesh,vertex:v,id,token,paintIndex:sampleRefs.length};
    sampleRefs.push(sample);samples.push(sample);
    verts.push(x,y,z);
    colors.push(.1,1,.86);
   }
   painted+=sampleRefs.length;
   const cloudGeo=new THREE.BufferGeometry();
   cloudGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
   cloudGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   const cloudMat=new THREE.PointsMaterial({size:5,sizeAttenuation:false,
    vertexColors:true,depthTest:false,depthWrite:false,transparent:true,opacity:1});
   const cloud=new THREE.Points(cloudGeo,cloudMat);
   cloud.userData.editorOnly=true;cloud.renderOrder=62;cloud.frustumCulled=false;
   mesh.add(cloud);disposables.push({object:cloud,geometry:cloudGeo,material:cloudMat,sampleRefs});
   if(count<=11000){
    const wireGeo=new THREE.WireframeGeometry(mesh.geometry);
    const wireMat=new THREE.LineBasicMaterial({color:0x39ffd0,transparent:true,opacity:.25,
     depthTest:false,depthWrite:false});
    const lines=new THREE.LineSegments(wireGeo,wireMat);
    lines.userData.editorOnly=true;lines.renderOrder=60;lines.frustumCulled=false;
    mesh.add(lines);disposables.push({object:lines,geometry:wireGeo,material:wireMat});
   }
   // Mesh-specific materials, leaving all GLB cache materials untouched.
   const orig=mesh.material;
   const cloneMat=m=>{
    const clone=m.clone();clone.transparent=true;clone.opacity=Math.min(.26,m.opacity??1);
    clone.depthWrite=false;clone.side=THREE.DoubleSide;
    return clone;
   };
   const clone=Array.isArray(orig)?orig.map(cloneMat):cloneMat(orig);
   mesh.material=clone;faded.push({mesh,orig,clone});
   meshCounter++;
  });
  refreshColors();
  setText('meshMeshCount',meshCounter);
 }
 function setActive(value){
  active=Boolean(value);
  if(!active)dispose();
  else rebuild();
 }
 function selectChanged(next){
  selected.clear();
  for(const id of next)selected.add(id);
  refreshColors();
 }
 function projected(sample){
  const p=sample.vertex.clone().applyMatrix4(sample.mesh.matrixWorld).project(camera);
  if(p.z< -1||p.z>1)return null;
  const box=view.getBoundingClientRect();
  return {x:box.left+(p.x+1)*box.width/2,y:box.top+(1-p.y)*box.height/2};
 }
 function matchingKeys(sample){return vertexBuckets.get(sample.token)||[sample.id];}
 function chooseByPoint(e){
  let closest=null,distance=13;
  for(const sample of samples){
   const p=projected(sample);if(!p)continue;
   const d=Math.hypot(e.clientX-p.x,e.clientY-p.y);
   if(d<distance){closest=sample;distance=d}
  }
  const next=(e.ctrlKey||e.metaKey||e.shiftKey)?new Set(selected):new Set();
  if(closest){
   const keys=matchingKeys(closest);
   if((e.ctrlKey||e.metaKey)&&keys.every(key=>next.has(key)))keys.forEach(key=>next.delete(key));
   else keys.forEach(key=>next.add(key));
  }
  selectChanged(next);
 }
 function chooseByRect(gesture,e){
  const left=Math.min(gesture.x,e.clientX),right=Math.max(gesture.x,e.clientX);
  const top=Math.min(gesture.y,e.clientY),bottom=Math.max(gesture.y,e.clientY);
  const next=(e.ctrlKey||e.metaKey||e.shiftKey)?new Set(selected):new Set();
  const keys=[];
  for(const sample of samples){
   const p=projected(sample);
   if(p&&p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom)keys.push(sample);
  }
  for(const sample of keys)for(const key of matchingKeys(sample))next.add(key);
  selectChanged(next);
 }
 function pointerdown(e){
  if(!active||e.button!==0||!getTarget())return false;
  e.preventDefault();e.stopImmediatePropagation();
  gesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,dragging:false};
  try{view.setPointerCapture(e.pointerId)}catch(_){}
  return true;
 }
 function pointermove(e){
  if(!gesture||e.pointerId!==gesture.pointerId)return false;
  e.preventDefault();e.stopImmediatePropagation();
  if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>5)gesture.dragging=true;
  if(gesture.dragging){
   marquee.style.display='block';
   marquee.style.left=Math.min(gesture.x,e.clientX)+'px';
   marquee.style.top=Math.min(gesture.y,e.clientY)+'px';
   marquee.style.width=Math.abs(e.clientX-gesture.x)+'px';
   marquee.style.height=Math.abs(e.clientY-gesture.y)+'px';
  }
  return true;
 }
 function pointerup(e){
  if(!gesture||e.pointerId!==gesture.pointerId)return false;
  const start=gesture;
  release();
  scene.updateMatrixWorld(true);
  if(start.dragging)chooseByRect(start,e);
  else chooseByPoint(e);
  return true;
 }
 function mutateLocks(locked){
  const node=getSelectedNode();
  if(!active||!node||node.kind!=='prefab'||!selected.size)return;
  const current=normalizedLocks(node.vertexLocks);
  const buckets=new Map(Object.entries(current).map(([k,ids])=>[k,new Set(ids)]));
  let changed=false;
  for(const token of selected){
   const sep=token.lastIndexOf(':'),part=token.slice(0,sep),idx=Number(token.slice(sep+1));
   if(!Number.isInteger(idx))continue;
   const ids=buckets.get(part)||new Set();
   if(ids.has(idx)!==locked){changed=true;if(locked)ids.add(idx);else ids.delete(idx)}
   buckets.set(part,ids);
  }
  if(!changed)return;
  const updated={};
  for(const [key,ids] of buckets)if(ids.size)updated[key]=[...ids].sort((a,b)=>a-b);
  snapshot();node.vertexLocks=updated;persist();refreshColors();
 }
 function applyScale(){
  const target=getTarget();
  if(!active||!target){toast('Primero selecciona un modelo GLB tangible');return}
  const {node,root}=target;
  const ops=cleanVertexOperations(node.meshScaleOps);
  if(ops.length>=24){toast('Máximo 24 deformaciones por modelo. Exporta o restaura antes de continuar.');return}
  const factor=Number($('meshScaleFactor').value);
  const axis=$('meshScaleAxis').value;
  if(!Number.isFinite(factor)||factor<.1||factor>5||Math.abs(factor-1)<.00001){
   toast('Elige un factor distinto de 1 entre 0.1 y 5');return;
  }
  const allBounds=new THREE.Box3();
  root.updateMatrixWorld(true);
  const invRoot=root.matrixWorld.clone().invert();
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.userData.wildtrapMeshKey===undefined)return;
   const pos=mesh.geometry?.getAttribute('position');
   if(!pos)return;
   const tr=invRoot.clone().multiply(mesh.matrixWorld);
   const v=new THREE.Vector3();
   for(let i=0;i<pos.count;i++){
    v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(tr);
    allBounds.expandByPoint(v);
   }
  });
  if(allBounds.isEmpty()){toast('Este modelo no contiene vértices editables');return}
  const center=allBounds.getCenter(new THREE.Vector3());
  const pivot=[center.x,node.anchorScaleY===true?allBounds.min.y:center.y,center.z];
  const frozen=normalizedLocks(node.vertexLocks);
  snapshot();
  node.meshScaleOps=[...ops,{axis,factor,pivot,locked:frozen}];
  draw();persist();
  toast('Deformación aplicada: los vértices bloqueados se mantienen fijos');
 }
 function resetDeformation(){
  const node=getSelectedNode();
  if(!active||node?.kind!=='prefab'||!node.meshScaleOps?.length)return;
  snapshot();node.meshScaleOps=[];draw();persist();
 }
 $('meshLockVertices').addEventListener('click',()=>mutateLocks(true));
 $('meshUnlockVertices').addEventListener('click',()=>mutateLocks(false));
 $('meshSelectAll').addEventListener('click',()=>selectChanged(samples.map(s=>s.id)));
 $('meshDeselect').addEventListener('click',()=>selectChanged([]));
 $('meshScaleApply').addEventListener('click',applyScale);
 $('meshResetDeform').addEventListener('click',resetDeformation);
 updateInfo();
 return {setActive,rebuild,beforeDraw:clearVisuals,dispose,updateInfo,
  pointerdown,pointermove,pointerup,hasGesture:()=>Boolean(gesture),
  getState:()=>({active,currentId,points:samples.length,selected:selected.size,
   locked:Object.values(normalizedLocks(getSelectedNode()?.vertexLocks)).reduce((a,b)=>a+b.length,0),
   operations:cleanVertexOperations(getSelectedNode()?.meshScaleOps).length})};
}
