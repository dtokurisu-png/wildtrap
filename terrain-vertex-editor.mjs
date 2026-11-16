import * as THREE from 'three';
import {buildTerrainVertexGraph,shortestTerrainVertexPath,addTerrainSeam,removeTerrainSeam,updateManualTerrainSeamAnchors,seamVertexIds} from './terrain-seams.mjs?v=0.9.94';

// Terrain vertices are editable in all three dimensions. Displacements in X/Z
// are stored independently of the heightmap so saves and geometry rebuilds keep them.
export function createTerrainVertexEditor({
 scene,terrain,terrainGeo,camera,view,marquee,live,snapshot,refreshTerrain,persist,
 beginTerrainSelection=()=>false,toast=()=>{}
}){
 const count=terrainGeo.attributes.position.count;
 const maxSelected=40000;
 let active=false,gesture=null,lastAnchor=null,selectionRoute=[];
 const graph=buildTerrainVertexGraph(terrainGeo);
 const $=id=>document.getElementById(id);
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
 const seamGeo=new THREE.BufferGeometry();
 const seamLines=new THREE.LineSegments(seamGeo,new THREE.LineBasicMaterial({
  color:0xffbe66,transparent:true,opacity:.92,depthTest:false,depthWrite:false
 }));
 seamLines.name='ProtectedCliffSeams';
 seamLines.renderOrder=83;seamLines.frustumCulled=false;seamLines.userData.editorOnly=true;
 seamLines.raycast=()=>{};scene.add(seamLines);
 const seamDotsGeo=new THREE.BufferGeometry();
 const seamDots=new THREE.Points(seamDotsGeo,new THREE.PointsMaterial({
  color:0xffd36a,size:10,sizeAttenuation:false,depthTest:false,depthWrite:false
 }));
 seamDots.name='ProtectedCliffSeamVertices';
 seamDots.renderOrder=84;seamDots.frustumCulled=false;seamDots.userData.editorOnly=true;
 seamDots.raycast=()=>{};scene.add(seamDots);
 function seams(){return Array.isArray(live.terrainSeams)?live.terrainSeams:[]}
 function updateSeamVisuals(){
  const attr=terrainGeo.attributes.position;
  const locked=seamVertexIds(live,count);
  const dots=[],lines=[];
  for(const id of locked)dots.push(attr.getX(id),attr.getY(id),attr.getZ(id));
  for(const seam of seams()){
   const path=Array.isArray(seam.path)?seam.path:[];
   for(let k=1;k<path.length;k++){
    const a=path[k-1],b=path[k];
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||a>=count||b<0||b>=count)continue;
    if(!graph[a].includes(b))continue;
    lines.push(attr.getX(a),attr.getY(a),attr.getZ(a),
     attr.getX(b),attr.getY(b),attr.getZ(b));
   }
  }
  seamGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  seamDotsGeo.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));
  seamGeo.computeBoundingSphere();seamDotsGeo.computeBoundingSphere();
  seamLines.visible=seamDots.visible=active;
  const button=$('terrainCreateSeam'),clear=$('terrainClearVertexSelection');
  // This is an ACTION, not a disabled indicator: first click opens terrain
  // vertex editing; a later click saves the chosen line as a seam.
  if(button){
   button.disabled=false;
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
   button.title=active?'Guarda los vértices seleccionados como costura protegida':'Activa la selección de vértices para crear una costura';
  }
  if(clear)clear.disabled=!active||selected.size===0;
  if($('terrainSeamCount'))$('terrainSeamCount').textContent=
   seams().length+' costura(s) · '+locked.size+' vértices protegidos · '+selected.size+' seleccionados';
  const list=$('terrainSeamList');
  if(list){
   list.replaceChildren();
   for(const seam of seams()){
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:5px;align-items:center;margin:5px 0';
    const title=document.createElement('span');title.style.flex='1';
    title.textContent=(seam.name||'Costura')+' · '+(seam.vertices?.length||0)+' vértices';
    const remove=document.createElement('button');remove.type='button';
    remove.textContent='Quitar';remove.title='Eliminar esta protección sin mover los vértices';
    remove.onclick=()=>{
     snapshot();
     if(removeTerrainSeam(live,seam.id)){persist();refresh();updateSeamVisuals();}
    };
    row.append(title,remove);list.append(row);
   }
  }
 }
 function extendPath(target){
  const from=lastAnchor;
  if(from===null||!selected.has(from)){selected.add(target);selectionRoute=[target];lastAnchor=target;return false;}
  const path=shortestTerrainVertexPath(terrainGeo,graph,from,target);
  if(!path.length)return false;
  for(const id of path)selected.add(id);
  if(!selectionRoute.length)selectionRoute=[from];
  selectionRoute.push(...path.slice(1));lastAnchor=target;
  return true;
 }
 const createBtn=$('terrainCreateSeam'),clearBtn=$('terrainClearVertexSelection');
 createBtn?.addEventListener('click',()=>{
  // The former disabled-first-click behaviour made the visible tool inert.
  // A click now ALWAYS has an observable result, even before selection.
  if(!active){
   const started=beginTerrainSelection();
   if(!started||!active){
    toast('No se pudo activar la selección del terreno');
   }else{
    toast('Selecciona el primer vértice y usa Ctrl + clic para marcar la ruta');
   }
   updateSeamVisuals();
   return;
  }
  if(selected.size<2){
   toast('Selecciona al menos dos vértices. Ctrl + clic completa la línea.');
   return;
  }
  const attr=terrainGeo.attributes.position;
  const path=selectionRoute.length>1?selectionRoute:[...selected];
  snapshot();
  const seam=addTerrainSeam(live,[...selected],id=>[
   attr.getX(id),attr.getY(id),attr.getZ(id)],path);
  if(!seam){toast('No se pudo crear la costura: selección inválida');return}
  persist();
  selected.clear();lastAnchor=null;selectionRoute=[];updateSelection();
  toast(seam.name+' guardada · '+seam.vertices.length+' vértices protegidos');
 });
 clearBtn?.addEventListener('click',()=>{
  selected.clear();lastAnchor=null;selectionRoute=[];updateSelection();
 });

 // Updates the actual cut terrain mesh during drag, not only the selection dots.
 const v=new THREE.Vector3();
 function updateCloud(){
  const attr=terrainGeo.attributes.position;
  for(let i=0;i<count;i++){
   positions[i*3]=attr.getX(i);
   positions[i*3+1]=attr.getY(i);
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
  updateSeamVisuals();
 }
 function setActive(value){
  if(gesture)release();
  active=Boolean(value);
  dots.visible=active;outlines.visible=active;
  if(active){updateCloud();updateSelection();}
  else{selected.clear();lastAnchor=null;selectionRoute=[];updateSelection();}
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
  if(!extend){selected.clear();selectionRoute=[];}
  if(index!==-1){
   selected.add(index);lastAnchor=index;
   if(!extend)selectionRoute=[index];
  }else if(!extend)lastAnchor=null;
  updateSelection();
 }
 function release(){
  if(!gesture)return;
  try{if(view.hasPointerCapture?.(gesture.pointerId))view.releasePointerCapture(gesture.pointerId)}catch(_){}
  gesture=null;
  marquee.style.display='none';
 }
 function intersectPlane(e,dragPlane){
  const box=view.getBoundingClientRect();
  const ndc=new THREE.Vector2((e.clientX-box.left)/box.width*2-1,
   -(e.clientY-box.top)/box.height*2+1);
  const raycaster=new THREE.Raycaster();raycaster.setFromCamera(ndc,camera);
  return raycaster.ray.intersectPlane(dragPlane,new THREE.Vector3());
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
   // Blender-style Ctrl+click follows actual triangle edges from the previous point.
   if((e.ctrlKey||e.metaKey)&&lastAnchor!==null&&selected.has(lastAnchor)&&index!==lastAnchor){
    extendPath(index);updateSelection();
    gesture={pointerId:e.pointerId,kind:'select'};return true;
   }
   // Click selects a vertex. Drag can manually move even protected seam vertices.
   if(!wasSelected||e.ctrlKey||e.metaKey||e.shiftKey)toggleSelection(index,e);
   else lastAnchor=index;
   // Drag along a plane facing the current camera. Mouse horizontal and
   // vertical motion therefore translate to matching screen-space X/Y, with
   // world X/Y/Z determined by the actual orbit/view angle.
   camera.updateMatrixWorld(true);terrain.updateMatrixWorld(true);
   const origin=new THREE.Vector3(positions[index*3],positions[index*3+1],positions[index*3+2])
    .applyMatrix4(terrain.matrixWorld);
   const normal=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
   const dragPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,origin);
   const startPoint=intersectPlane(e,dragPlane);
   const starts=new Map();
   for(const i of selected)starts.set(i,[positions[i*3],positions[i*3+1],positions[i*3+2]]);
   gesture={pointerId:e.pointerId,kind:'move',x:e.clientX,y:e.clientY,
    moved:false,snapshotted:false,starts,dragPlane,startPoint};
  }
  try{view.setPointerCapture(e.pointerId)}catch(_){}
  return true;
 }
 function pointermove(e){
  if(!active||!gesture||gesture.pointerId!==e.pointerId)return false;
  e.preventDefault();e.stopImmediatePropagation();
  const g=gesture;
  if(g.kind==='select')return true;
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
  const at=intersectPlane(e,g.dragPlane);
  if(!at||!g.startPoint)return true;
  const worldDelta=at.sub(g.startPoint);
  const inverse=new THREE.Matrix4().copy(terrain.matrixWorld).invert();
  // Apply inverse world transform to both points for correct local translation.
  const localStart=g.startPoint.clone().applyMatrix4(inverse);
  const localEnd=g.startPoint.clone().add(worldDelta).applyMatrix4(inverse);
  const localDelta=localEnd.sub(localStart);
  if(![localDelta.x,localDelta.y,localDelta.z].every(Number.isFinite))return true;
  if(!g.snapshotted){snapshot();g.snapshotted=true;}
  g.moved=true;
  const attr=terrainGeo.attributes.position;
  const offsets=live.terrainVertexOffsets||(live.terrainVertexOffsets={});
  const movedSeamAnchors=new Map();
  const cell=630/128;
  for(const [i,original] of g.starts){
   const x=original[0]+localDelta.x,y=original[1]+localDelta.y,z=original[2]+localDelta.z;
   const h=Math.max(-500,Math.min(500,y));
   // The heightmap remains the authoritative Y storage for sculpting.
   live.heights[i]=h;
   const baseX=(i%129)*cell-315;
   const baseZ=Math.floor(i/129)*cell-315;
   const dx=x-baseX,dz=z-baseZ;
   if(Math.abs(dx)<.000001&&Math.abs(dz)<.000001)delete offsets[i];
   else offsets[i]=[dx,dz];
   attr.setXYZ(i,x,h,z);
   positions[i*3]=x;positions[i*3+1]=h;positions[i*3+2]=z;
   movedSeamAnchors.set(i,[x,h,z]);
  }
  // Manual editing is the ONLY operation authorized to re-anchor seam locks.
  updateManualTerrainSeamAnchors(live,movedSeamAnchors);
  attr.needsUpdate=true;
  geo.attributes.position.needsUpdate=true;
  geo.computeBoundingSphere();
  // Refresh the actual terrain mesh and the cut topology while the mouse moves.
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
    lastAnchor=null;selectionRoute=[];updateSelection();
   }else if(!g.additive){selected.clear();lastAnchor=null;selectionRoute=[];updateSelection();}
  }
  release();
  if(g.moved){
   refreshTerrain();
   // Geometric edits are high-value and can be many vertices at once.
   // Commit them immediately instead of waiting 700 ms for a timer that
   // is lost when the editor is reloaded or the browser tab is closed.
   void persist(true);
  }
  return true;
 }
 function dispose(){
  release();dots.parent?.remove(dots);outlines.parent?.remove(outlines);
  geo.dispose();outlineGeo.dispose();dots.material.dispose();outlines.material.dispose();
  seamLines.parent?.remove(seamLines);seamDots.parent?.remove(seamDots);
  seamGeo.dispose();seamDotsGeo.dispose();seamLines.material.dispose();seamDots.material.dispose();
 }
 return {setActive,refresh,dispose,pointerdown,pointermove,pointerup,
  getState:()=>({active,selected:selected.size,vertices:count,dragging:Boolean(gesture),
   seams:seams().length,protectedVertices:seamVertexIds(live,count).size}),
  getSelectedIndices:()=>[...selected],
  debugProjectVertex:id=>{
   if(!active||!Number.isInteger(id)||id<0||id>=count)return null;
   projectAll();return projected[id]?{...projected[id]}:null;
  },
  debugSelectPath:(a,b)=>{
   if(!active||a<0||b<0||a>=count||b>=count)return [];
   selected.clear();selected.add(a);lastAnchor=a;selectionRoute=[a];
   const path=shortestTerrainVertexPath(terrainGeo,graph,a,b);
   extendPath(b);updateSelection();return path;
  }};
}
