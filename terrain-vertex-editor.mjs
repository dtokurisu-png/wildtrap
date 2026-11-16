import * as THREE from 'three';

// Terrain vertices are stored as a fixed XZ heightfield, so editing their Y
// values preserves the existing grid, cuts, saved holes, and collision logic.
export function createTerrainVertexEditor({
 scene,terrain,terrainGeo,camera,view,marquee,live,snapshot,refreshTerrain,persist
}){
 const count=terrainGeo.attributes.position.count;
 const maxSelected=40000;
 let active=false,gesture=null;
 const selected=new Set(),positions=new Float32Array(count*3);
 const geo=new THREE.BufferGeometry();
 const colors=new Float32Array(count*3);
 geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
 const dots=new THREE.Points(geo,new THREE.PointsMaterial({
  size:11,sizeAttenuation:false,vertexColors:true,
  depthTest:false,depthWrite:false
 }));
 dots.name='EditableTerrainVertices';
 dots.userData.editorOnly=true;
 dots.renderOrder=80;dots.frustumCulled=false;
 scene.add(dots);dots.visible=false;dots.raycast=()=>{};
 const outlineGeo=new THREE.BufferGeometry();
 const outlines=new THREE.Points(outlineGeo,new THREE.PointsMaterial({
  size:19,sizeAttenuation:false,color:0xffffff,depthTest:false,depthWrite:false
 }));
 outlines.userData.editorOnly=true;outlines.renderOrder=79;
 outlines.visible=false;outlines.raycast=()=>{};scene.add(outlines);
 const projected=new Array(count);
 // Updates the actual cut terrain mesh during drag, not only the selection dots.
 const v=new THREE.Vector3();
 function updateCloud(){
  const attr=terrainGeo.attributes.position;
  for(let i=0;i<count;i++){
   positions[i*3]=attr.getX(i);
   positions[i*3+1]=live.heights[i]??attr.getY(i);
   positions[i*3+2]=attr.getZ(i);
  }
  geo.attributes.position.needsUpdate=true;
  geo.computeBoundingSphere();
 }
 function updateSelection(){
  let k=0;
  const selectedPos=[];
  for(let i=0;i<count;i++){
   const chosen=selected.has(i);
   colors[k++]=chosen?1:0;
   colors[k++]=chosen?.1:1;
   colors[k++]=chosen?.9:.87;
   if(chosen)selectedPos.push(positions[i*3],positions[i*3+1],positions[i*3+2]);
  }
  geo.attributes.color.needsUpdate=true;
  outlineGeo.setAttribute('position',new THREE.Float32BufferAttribute(selectedPos,3));
  outlineGeo.computeBoundingSphere();
 }
 function setActive(value){
  if(gesture)release();
  active=Boolean(value);
  dots.visible=active;outlines.visible=active;
  if(active){updateCloud();updateSelection();}
  else{selected.clear();updateSelection();}
 }
 function refresh(){if(!active)return;updateCloud();updateSelection();}
 function pointInViewport(e){
  const box=view.getBoundingClientRect();
  return e.clientX>=box.left&&e.clientX<=box.right&&e.clientY>=box.top&&e.clientY<=box.bottom;
 }
 function projectAll(){
  camera.updateMatrixWorld(true);terrain.updateMatrixWorld(true);
  const box=view.getBoundingClientRect(),m=terrain.matrixWorld;
  for(let i=0;i<count;i++){
   v.set(positions[i*3],positions[i*3+1],positions[i*3+2]).applyMatrix4(m).project(camera);
   projected[i]=v.z < -1||v.z>1?null:{
    x:box.left+(v.x+1)*box.width*.5,y:box.top+(1-v.y)*box.height*.5
   };
  }
 }
 function nearest(x,y){
  projectAll();
  let index=-1,best=14*14;
  for(let i=0;i<count;i++){
   const p=projected[i];if(!p)continue;
   const d=(p.x-x)**2+(p.y-y)**2;
   if(d<best){best=d;index=i;}
  }
  return index;
 }
 function toggleSelection(index,e){
  const extend=e.ctrlKey||e.metaKey||e.shiftKey;
  if(!extend)selected.clear();
  if(index!==-1){
   if((e.ctrlKey||e.metaKey)&&selected.has(index))selected.delete(index);
   else selected.add(index);
  }
  updateSelection();
 }
 function release(){
  if(!gesture)return;
  try{if(view.hasPointerCapture?.(gesture.pointerId))view.releasePointerCapture(gesture.pointerId)}catch(_){}
  gesture=null;
  marquee.style.display='none';
 }
 function pointerdown(e){
  if(!active||e.button!==0||!pointInViewport(e))return false;
  e.preventDefault();e.stopImmediatePropagation();
  const index=nearest(e.clientX,e.clientY);
  const wasSelected=selected.has(index);
  if(index<0){
   gesture={pointerId:e.pointerId,kind:'marquee',x:e.clientX,y:e.clientY,
    additive:Boolean(e.ctrlKey||e.metaKey||e.shiftKey),dragging:false};
  }else{
   // Clicking a selected vertex moves the entire current selection.
   if(!wasSelected||e.ctrlKey||e.metaKey||e.shiftKey)toggleSelection(index,e);
   const startHeights=new Map();
   for(const i of selected)startHeights.set(i,Number(live.heights[i])||0);
   // Actual projection of a +1 world-Y displacement determines how much
   // mouse movement corresponds to one height unit in this camera view.
   const box=view.getBoundingClientRect();
   const base=new THREE.Vector3(positions[index*3],positions[index*3+1],positions[index*3+2])
    .applyMatrix4(terrain.matrixWorld);
   const p0=base.clone().project(camera),p1=base.clone().add(new THREE.Vector3(0,1,0)).project(camera);
   const pixelsPerUnit=(p0.y-p1.y)*box.height*.5;
   gesture={pointerId:e.pointerId,kind:'move',x:e.clientX,y:e.clientY,
    moved:false,snapshotted:false,startHeights,
    // Positive screen-up means positive height, regardless of camera direction.
    pixelsPerUnit:Math.abs(pixelsPerUnit)>.001?pixelsPerUnit:Math.max(1,box.height/100)};
  }
  try{view.setPointerCapture(e.pointerId)}catch(_){}
  return true;
 }
 function pointermove(e){
  if(!active||!gesture||gesture.pointerId!==e.pointerId)return false;
  e.preventDefault();e.stopImmediatePropagation();
  const g=gesture;
  if(g.kind==='marquee'){
   const dx=e.clientX-g.x,dy=e.clientY-g.y;
   g.dragging=Math.hypot(dx,dy)>4;
   if(g.dragging){
    marquee.style.display='block';
    marquee.style.left=Math.min(g.x,e.clientX)+'px';
    marquee.style.top=Math.min(g.y,e.clientY)+'px';
    marquee.style.width=Math.abs(dx)+'px';
    marquee.style.height=Math.abs(dy)+'px';
   }
   return true;
  }
  if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<3&&!g.moved)return true;
  const delta=(g.y-e.clientY)/g.pixelsPerUnit;
  if(!Number.isFinite(delta))return true;
  if(!g.snapshotted){snapshot();g.snapshotted=true;}
  g.moved=true;
  const attr=terrainGeo.attributes.position;
  for(const [i,original] of g.startHeights){
   const h=Math.max(-500,Math.min(500,original+delta));
   live.heights[i]=h;
   attr.setY(i,h);
   positions[i*3+1]=h;
  }
  attr.needsUpdate=true;
  geo.attributes.position.needsUpdate=true;
  geo.computeBoundingSphere();
  terrainGeo.computeVertexNormals();terrainGeo.computeBoundingSphere();
  // Rebuild the visible (possibly cut) terrain on EVERY pointer move.
  // Previously only the vertex markers moved; the real mesh caught up on release.
  refreshTerrain();
  updateSelection();
  return true;
 }
 function pointerup(e){
  if(!gesture||gesture.pointerId!==e.pointerId)return false;
  const g=gesture;
  if(g.kind==='marquee'){
   if(g.dragging){
    projectAll();
    if(!g.additive)selected.clear();
    const l=Math.min(g.x,e.clientX),r=Math.max(g.x,e.clientX);
    const t=Math.min(g.y,e.clientY),b=Math.max(g.y,e.clientY);
    for(let i=0;i<count&&selected.size<maxSelected;i++){
     const p=projected[i];
     if(p&&p.x>=l&&p.x<=r&&p.y>=t&&p.y<=b)selected.add(i);
    }
    updateSelection();
   }else if(!g.additive){selected.clear();updateSelection();}
  }
  release();
  if(g.moved){refreshTerrain();persist();}
  return true;
 }
 function dispose(){
  release();dots.parent?.remove(dots);outlines.parent?.remove(outlines);
  geo.dispose();outlineGeo.dispose();dots.material.dispose();outlines.material.dispose();
 }
 return {setActive,refresh,dispose,pointerdown,pointermove,pointerup,
  getState:()=>({active,selected:selected.size,vertices:count,dragging:Boolean(gesture)})};
}
