import * as THREE from 'three';
import {normalizedLocks,cleanVertexOperations} from './mesh-deform.mjs?v=0.9.12';
import {normalizedVertexAnchors} from './mesh-vertex-freeze.mjs?v=0.9.19';

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
  // Preview layers may remain on while the knife is active. Vertex mutation
  // controls must stay hidden so the cutter exclusively receives pointer input.
  controls.hidden=node?.kind!=='prefab';
  const canEdit=active&&getMode()==='meshEdit';
  for(const id of ['meshLockVertices','meshUnlockVertices','meshResetDeform','meshMoveXNeg','meshMoveXPos','meshMoveYNeg','meshMoveYPos','meshMoveZNeg','meshMoveZPos']){
   const button=$(id);if(button)button.disabled=!supports||!canEdit||(id==='meshLockVertices'||id==='meshUnlockVertices'||id.startsWith('meshMove')?selected.size===0:false);
  }
  const locks=normalizedLocks(node?.vertexLocks);
  const totalLocked=Object.values(locks).reduce((sum,ids)=>sum+ids.length,0);
  setText('meshVertexCount',samples.length+(samples.length>=maxPoints?' (límite visual)':''));
  setText('meshVertexSelected',selected.size);
  setText('meshVertexLocked',totalLocked);
  $('meshTotalLock').disabled=!supports||!canEdit||totalLocked===0;
  $('meshTotalLock').checked=node?.vertexTotalLock===true;
  for(const id of ['meshSelectAll','meshDeselect'])$(id).disabled=!supports||!canEdit;
  setText('meshEditHelp',!active?'Pulsa «Editar vértices del modelo» para seleccionar y deformar sus puntos':
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
    colors.setXYZ(item.paintIndex,...(picked?[1,1,1]:locked?[1,.18,.33]:[0,1,.87]));
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
   // A cut GLB has newly triangulated indices. Edit its uncut source buffer,
   // which preserves stable vertex IDs for saved locks and future cut rebuilds.
   const original=mesh.userData.wildtrapSourceGeometry||mesh.geometry;
   const position=original.getAttribute('position');
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
    colors.push(0,1,.87);
   }
   painted+=sampleRefs.length;
   const cloudGeo=new THREE.BufferGeometry();
   cloudGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
   cloudGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   const cloudMat=new THREE.PointsMaterial({size:11,sizeAttenuation:false,
    vertexColors:true,depthTest:false,depthWrite:false,transparent:false,opacity:1});
   const cloud=new THREE.Points(cloudGeo,cloudMat);
   cloud.userData.editorOnly=true;cloud.renderOrder=45;cloud.frustumCulled=false;
   mesh.add(cloud);disposables.push({object:cloud,geometry:cloudGeo,material:cloudMat,sampleRefs,kind:'vertices'});
   // Edges reflect the ACTUAL cut topology. Dense GLBs can show full wireframe.
   const wireGeo=new THREE.WireframeGeometry(mesh.geometry);
   const wireMat=new THREE.LineBasicMaterial({color:0x39ffd0,transparent:true,opacity:.52,
    depthTest:false,depthWrite:false});
   const lines=new THREE.LineSegments(wireGeo,wireMat);
   lines.userData.editorOnly=true;lines.renderOrder=12;lines.frustumCulled=false;
   mesh.add(lines);disposables.push({object:lines,geometry:wireGeo,material:wireMat,kind:'edges'});
   // Mesh-specific materials, leaving all GLB cache materials untouched.
   const orig=mesh.material;
   const cloneMat=m=>{
    const clone=m.clone();clone.transparent=true;clone.opacity=Math.min(.26,m.opacity??1);
    clone.depthWrite=false;clone.side=THREE.DoubleSide;
    clone.userData.wildtrapGhostOpacity=clone.opacity;
    return clone;
   };
   const clone=Array.isArray(orig)?orig.map(cloneMat):cloneMat(orig);
   mesh.material=clone;faded.push({mesh,orig,clone});
   meshCounter++;
  });
  refreshColors();
  setText('meshMeshCount',meshCounter);
  updateLayers();
 }
 function updateLayers(){
  const xray=$('modelXray').checked;
  for(const item of disposables){
   if(item.kind==='vertices')item.object.visible=$('modelVertices').checked;
   if(item.kind==='edges')item.object.visible=$('modelEdges').checked;
   if(item.kind==='vertices'||item.kind==='edges'){
    item.material.depthTest=item.kind==='vertices'?false:!xray;item.material.needsUpdate=true;
   }
  }
  for(const {clone} of faded)for(const mat of (Array.isArray(clone)?clone:[clone])){
   mat.opacity=$('modelFaces').checked?(mat.userData.wildtrapGhostOpacity??.26):0;
   mat.depthTest=!xray;mat.depthWrite=false;mat.needsUpdate=true;
  }
 }
 for(const id of ['modelFaces','modelEdges','modelVertices','modelXray'])
  $(id).addEventListener('change',updateLayers);
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
 function closestSample(e){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  let best=null,distance=16;
  for(const sample of samples){
   const p=projected(sample);if(!p)continue;
   const d=Math.hypot(e.clientX-p.x,e.clientY-p.y);
   if(d<distance){best=sample;distance=d}
  }
  return best;
 }
 function worldUnitsPerPixel(worldPoint){
  const box=view.getBoundingClientRect();
  if(camera.isOrthographicCamera)return (camera.top-camera.bottom)/Math.max(.001,camera.zoom)/Math.max(1,box.height);
  const distance=Math.max(.1,worldPoint.distanceTo(camera.position));
  return 2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/
   Math.max(.001,camera.zoom)/Math.max(1,box.height);
 }
 function pointerdown(e){
  if(!active||e.button!==0||!getTarget())return false;
  e.preventDefault();e.stopImmediatePropagation();
  const sample=closestSample(e);
  if(sample){
   const keys=matchingKeys(sample);
   const next=e.ctrlKey||e.metaKey?new Set(selected):new Set(keys);
   if(e.ctrlKey||e.metaKey){
    if(keys.every(k=>next.has(k)))keys.forEach(k=>next.delete(k));
    else keys.forEach(k=>next.add(k));
   }
   selectChanged(next);
   const target=getTarget(),root=target.root;
   const origin=sample.vertex.clone().applyMatrix4(sample.mesh.matrixWorld);
   gesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,kind:'vertex',
    moved:false,snapshotTaken:false,node:target.node,root,origin,
    initialMoves:structuredClone(target.node.meshVertexMoves||{}),
    locked:normalizedLocks(target.node.vertexLocks),selectedKeys:[...selected],
    worldScale:worldUnitsPerPixel(origin)};
  }else{
   gesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,kind:'marquee',dragging:false};
  }
  try{view.setPointerCapture(e.pointerId)}catch(_){}
  return true;
 }
 function pointermove(e){
  if(!gesture||e.pointerId!==gesture.pointerId)return false;
  e.preventDefault();e.stopImmediatePropagation();
  if(gesture.kind==='vertex'){
   const g=gesture,dx=e.clientX-g.x,dy=e.clientY-g.y;
   if(Math.hypot(dx,dy)<2&&!g.moved)return true;
   if(!g.selectedKeys.length)return true;
   if(!g.snapshotTaken){
    snapshot();g.snapshotTaken=true;
    g.dragGeometry=new Map();
    for(const item of samples){
     if(!g.selectedKeys.includes(item.id)||g.dragGeometry.has(item.mesh))continue;
     const original=item.mesh.geometry;
     // The GLB's source geometry can be shared by other instances.
     // Display the drag on an isolated temporary geometry only.
     const preview=original.clone();
     item.mesh.geometry=preview;
     g.dragGeometry.set(item.mesh,{original,preview});
    }
   }
   g.moved=true;
   // Screen-plane drag by default; Shift locks X/Y, Alt+Shift vertical locks Z.
   const cameraRight=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
   const cameraUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
   let movement;
   if(e.shiftKey){
    const axes=new THREE.Vector3();
    if(e.altKey)axes.set(0,0,-dy);
    else axes.set(dx,-dy,0);
    // Axis-constrained movement is in the model's X/Y/Z axes.
    movement=axes.multiplyScalar(g.worldScale).applyQuaternion(g.root.getWorldQuaternion(new THREE.Quaternion()));
   }else{
    movement=cameraRight.multiplyScalar(dx*g.worldScale).addScaledVector(cameraUp,-dy*g.worldScale);
   }
   const rootDelta=movement.applyQuaternion(g.root.getWorldQuaternion(new THREE.Quaternion()).invert())
    .divide(g.root.getWorldScale(new THREE.Vector3()));
   const moves=structuredClone(g.initialMoves);
   for(const token of g.selectedKeys){
    const cut=token.lastIndexOf(':'),key=token.slice(0,cut),index=Number(token.slice(cut+1));
    if(!Number.isInteger(index)||g.locked[key]?.includes(index))continue;
    if(!moves[key])moves[key]={};
    const old=Array.isArray(moves[key][index])?moves[key][index]:[0,0,0];
    moves[key][index]=[old[0]+rootDelta.x,old[1]+rootDelta.y,old[2]+rootDelta.z];
   }
   g.node.meshVertexMoves=moves;
   // Preview coordinates are based on the drag's original positions,
   // never accumulated per pointermove. Keep all uncropped source GLBs intact.
   if(!g.sampleOrigins)g.sampleOrigins=new Map();
   const chosen=new Set(g.selectedKeys);
   for(const item of samples){
    if(!chosen.has(item.id))continue;
    const cut=item.id.lastIndexOf(':'),key=item.id.slice(0,cut),index=Number(item.id.slice(cut+1));
    if(g.locked[key]?.includes(index))continue;
    if(!g.sampleOrigins.has(item.id))g.sampleOrigins.set(item.id,item.vertex.clone());
    const local=movement.clone()
     .applyQuaternion(item.mesh.getWorldQuaternion(new THREE.Quaternion()).invert())
     .divide(item.mesh.getWorldScale(new THREE.Vector3()));
    item.vertex.copy(g.sampleOrigins.get(item.id)).add(local);
    const originalGeometry=g.dragGeometry?.get(item.mesh)?.original;
    const previewGeometry=g.dragGeometry?.get(item.mesh)?.preview;
    // A cut mesh changes topology/index mapping. Its preview is limited to
    // the selection markers; the canonical cut rebuild occurs on mouseup.
    if(previewGeometry&&originalGeometry===item.mesh.userData.wildtrapSourceGeometry||
       previewGeometry&&!item.mesh.userData.wildtrapSourceGeometry){
     const position=previewGeometry.getAttribute('position');
     if(position&&index<position.count){
      position.setXYZ(index,item.vertex.x,item.vertex.y,item.vertex.z);
      position.needsUpdate=true;
     }
    }
   }
   for(const {geometry,sampleRefs} of disposables.filter(v=>v.sampleRefs)){
    const attr=geometry.getAttribute('position');
    for(const item of sampleRefs)if(chosen.has(item.id))
     attr.setXYZ(item.paintIndex,item.vertex.x,item.vertex.y,item.vertex.z);
    attr.needsUpdate=true;
   }
   return true;
  }
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
  const g=gesture;
  if(g.kind==='marquee'){
   release();
   scene.updateMatrixWorld(true);
   if(g.dragging)chooseByRect(g,e);
   else chooseByPoint(e);
  }else{
   release();
   if(g.moved){
    // Restore the original mesh buffers before reconstructing from saved JSON.
    for(const [mesh,{original,preview}] of g.dragGeometry||[]){
     mesh.geometry=original;preview.dispose();
    }
    draw();persist();
   }
  }
  return true;
 }
 // Capture the exact vertex positions when locking. Anchors are stored per
 // mesh and stable vertex index, and survive closing the vertex editor.
 function captureAnchors(node,root,locks,existing={},recapture=false){
  const anchors=normalizedVertexAnchors(existing);
  root.updateMatrixWorld(true);
  const worldToRoot=root.matrixWorld.clone().invert();
  root.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.userData.wildtrapMeshKey===undefined)return;
   const key=String(mesh.userData.wildtrapMeshKey),list=locks[key]||[];
   if(!list.length)return;
   const position=(mesh.userData.wildtrapSourceGeometry||mesh.geometry)?.getAttribute('position');
   if(!position)return;
   const out=anchors[key]||{},v=new THREE.Vector3(),w=new THREE.Vector3();
   for(const index of list){
    if(index>=position.count||(!recapture&&out[index]))continue;
    v.set(position.getX(index),position.getY(index),position.getZ(index));
    w.copy(v).applyMatrix4(mesh.matrixWorld);
    out[index]={
     root:w.clone().applyMatrix4(worldToRoot).toArray(),
     world:w.toArray(),
     scale:Math.max(.01,Number(node.scale)||1)
    };
   }
   if(Object.keys(out).length)anchors[key]=out;
  });
  for(const [key,vertices] of Object.entries(anchors)){
   const set=new Set(locks[key]||[]);
   for(const index of Object.keys(vertices))if(!set.has(Number(index)))delete vertices[index];
   if(!Object.keys(vertices).length)delete anchors[key];
  }
  return anchors;
 }
 function ensureAnchors(id){
  const node=getSelectedNode();
  if(!node||node.id!==id||node.kind!=='prefab')return false;
  const locks=normalizedLocks(node.vertexLocks),root=getRoot(id);
  if(!root||!Object.keys(locks).length)return false;
  const anchors=normalizedVertexAnchors(node.vertexLockAnchors);
  const missing=Object.entries(locks).some(([key,ids])=>
   ids.some(index=>!anchors[key]?.[index]));
  if(!missing)return false;
  node.vertexLockAnchors=captureAnchors(node,root,locks,anchors);
  return true;
 }
 function mutateLocks(locked){
  const target=getTarget();
  if(!active||!target||!selected.size)return;
  const {node,root}=target;
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
  snapshot();node.vertexLocks=updated;
  node.vertexLockAnchors=captureAnchors(node,root,updated,node.vertexLockAnchors);
  if(!Object.keys(updated).length)node.vertexTotalLock=false;
  draw();persist();
 }
 function setTotalLock(){
  const target=getTarget();if(!active||!target)return;
  const {node,root}=target,locks=normalizedLocks(node.vertexLocks);
  if(!Object.keys(locks).length){$('meshTotalLock').checked=false;return}
  const enable=$('meshTotalLock').checked;
  snapshot();
  // Re-snapshot the current transformed vertex positions. Toggling normal to
  // total fixes the current visible world positions, not an obsolete anchor.
  node.vertexLockAnchors=captureAnchors(node,root,locks,node.vertexLockAnchors,true);
  node.vertexTotalLock=enable;
  draw();persist();
 }
 function resetDeformation(){
  const node=getSelectedNode();
  if(!active||node?.kind!=='prefab'||(!node.meshScaleOps?.length&&!node.meshSculptOps?.length&&!Object.keys(node.meshVertexMoves||{}).length))return;
  snapshot();node.meshScaleOps=[];node.meshSculptOps=[];node.meshVertexMoves={};draw();persist();
 }
 function moveSelection(axis,sign){
  const target=getTarget();if(!active||!target||!selected.size)return false;
  const step=Math.max(.001,Math.min(10,Number($('meshMoveStep')?.value)||.1));
  const {node}=target,locks=normalizedLocks(node.vertexLocks);
  const moves=structuredClone(node.meshVertexMoves||{});
  const component={x:0,y:1,z:2}[axis];if(component===undefined)return false;
  let changed=false;
  for(const token of selected){
   const sep=token.lastIndexOf(':'),key=token.slice(0,sep),i=Number(token.slice(sep+1));
   if(!Number.isInteger(i)||locks[key]?.includes(i))continue;
   if(!moves[key])moves[key]={};
   const delta=Array.isArray(moves[key][i])?moves[key][i].slice():[0,0,0];
   delta[component]=Math.round((delta[component]+sign*step)*100000)/100000;
   moves[key][i]=delta;changed=true;
  }
  if(!changed)return false;
  snapshot();node.meshVertexMoves=moves;draw();persist();return true;
 }
 for(const axis of ['X','Y','Z']){
  for(const [direction,suffix] of [[-1,'Neg'],[1,'Pos']])
   $('meshMove'+axis+suffix)?.addEventListener('click',()=>moveSelection(axis.toLowerCase(),direction));
 }
 window.addEventListener('keydown',event=>{
  if(!active||getMode()!=='meshEdit'||!event.shiftKey||event.ctrlKey||event.altKey||
   /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||''))return;
  const controls={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['y',1],ArrowDown:['y',-1],
   PageUp:['z',1],PageDown:['z',-1]};
  const action=controls[event.code];if(!action)return;
  event.preventDefault();moveSelection(...action);
 });
 $('meshLockVertices').addEventListener('click',()=>mutateLocks(true));
 $('meshUnlockVertices').addEventListener('click',()=>mutateLocks(false));
 $('meshSelectAll').addEventListener('click',()=>selectChanged([...vertexBuckets.values()].flat()));
 $('meshDeselect').addEventListener('click',()=>selectChanged([]));
 $('meshTotalLock').addEventListener('change',setTotalLock);
 $('meshResetDeform').addEventListener('click',resetDeformation);
 updateInfo();
 return {setActive,rebuild,beforeDraw:clearVisuals,dispose,updateInfo,
  pointerdown,pointermove,pointerup,ensureAnchors,hasGesture:()=>Boolean(gesture),
  debugSelectFirst:()=>{
   if(!active||!samples.length)return null;
   const first=samples[0];selectChanged(matchingKeys(first));
   return {key:first.key,index:first.index,selected:[...selected]};
  },
  getState:()=>({active,currentId,points:samples.length,selected:selected.size,
   locked:Object.values(normalizedLocks(getSelectedNode()?.vertexLocks)).reduce((a,b)=>a+b.length,0),
   operations:cleanVertexOperations(getSelectedNode()?.meshScaleOps).length+
    Object.values(getSelectedNode()?.meshVertexMoves||{}).reduce((n,v)=>n+Object.keys(v).length,0)+
    (Array.isArray(getSelectedNode()?.meshSculptOps)?getSelectedNode().meshSculptOps.length:0),
   totalLock:getSelectedNode()?.vertexTotalLock===true,
   renderedEdges:disposables.filter(x=>x.kind==='edges').length,
   visibleEdges:disposables.filter(x=>x.kind==='edges'&&x.object.visible).length,
   visibleVertices:disposables.filter(x=>x.kind==='vertices'&&x.object.visible).length,
   visibleFaces:$('modelFaces').checked,xray:$('modelXray').checked})};
}
