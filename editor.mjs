import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createPlaytest} from './playtest.mjs';
import {createTerrainHoles} from './terrain-holes.mjs';
import {createCavePieceObject} from './cave-pieces-three.mjs';
import {pieceOptions,CAVE_PIECE_TYPES} from './cave-pieces.mjs';
import {createPrefabLibrary,prefabById,PREFABS} from './prefab-library.mjs';
import {createPrefabGallery} from './prefab-gallery.mjs';
const $=id=>document.getElementById(id), SIZE=630, N=129, COUNT=N*N;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), index=(x,z)=>z*N+x;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xb9c9c1);
const renderer=new THREE.WebGLRenderer({canvas:$('viewport'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth-340,innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff,0x68765b,2.4));
const light=new THREE.DirectionalLight(0xffffff,1.8);light.position.set(-160,280,120);scene.add(light);
const view=$('viewport');
const camera=new THREE.OrthographicCamera(-SIZE*.65,SIZE*.65,SIZE*.65,-SIZE*.65,.1,2600);
const orbit=new OrbitControls(camera,view);orbit.enableDamping=true;orbit.screenSpacePanning=true;
orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
const terrainGeo=new THREE.PlaneGeometry(SIZE,SIZE,N-1,N-1);terrainGeo.rotateX(-Math.PI/2);
const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
const terrain=new THREE.Mesh(terrainGeo,material);terrain.name='heightmap terrain';scene.add(terrain);
const surface=new THREE.Group();scene.add(surface);
const interiors=new THREE.Group();scene.add(interiors);
const cavePiecesLayer=new THREE.Group();scene.add(cavePiecesLayer);
const selectedHighlights=new THREE.Group();scene.add(selectedHighlights);
const hoverHighlights=new THREE.Group();scene.add(hoverHighlights);
const renderedNodes=new Map();
let prefabLibrary=null;
const cursor=new THREE.Mesh(new THREE.RingGeometry(1,1.02,64),new THREE.MeshBasicMaterial({color:0xffdd7a,transparent:true,opacity:.9,side:THREE.DoubleSide,depthTest:false}));cursor.rotation.x=-Math.PI/2;cursor.renderOrder=20;scene.add(cursor);
const colours={path:0xb69c6b,wall:0x826f57,tree:0x276b53,mountain:0x7f756a,cave:0x442c34,stairs:0xb8a080,spawn:0x1ebfef,exit:0xf47979,gate:0xe1b94f,anchor:0xffd76b};
const solid=(c,alpha=1)=>new THREE.MeshLambertMaterial({color:c,flatShading:true,transparent:alpha<1,opacity:alpha,side:THREE.DoubleSide});
const live={version:3,size:SIZE,resolution:N,heights:Array(COUNT).fill(0),nodes:[],holes:[],cuts3d:[],nextId:1,settings:{heightMax:120}};
let holesEditor=null;
const undo=[];let saveTimer=null;function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('wildtrap-editor-draft-v1',JSON.stringify(live))}catch(e){$('toast').textContent='Aviso: guardado automático bloqueado; exporta JSON'}},700)}
let mode='raise',pointerDown=false,dragId=null,selectedId=null,pending=null,changed=false;
const selectedIds=new Set();let marqueeStart=null,moveBases=null;
let armedPrefabId=null,placementGhost=null,hoveredNodeId=null,dragSession=null;
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const temp=new THREE.Vector3();
const pos=(x,z)=>({x:clamp(x,-SIZE/2,SIZE/2),z:clamp(z,-SIZE/2,SIZE/2)});
function heightAt(x,z){
const fx=clamp((x/SIZE+.5)*(N-1),0,N-1),fz=clamp((z/SIZE+.5)*(N-1),0,N-1),ix=Math.floor(fx),iz=Math.floor(fz),xx=Math.min(N-1,ix+1),zz=Math.min(N-1,iz+1),tx=fx-ix,tz=fz-iz;
const a=live.heights[index(ix,iz)],b=live.heights[index(xx,iz)],c=live.heights[index(ix,zz)],d=live.heights[index(xx,zz)];
return(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz;
}
function snapshot(){undo.push(JSON.stringify(live));if(undo.length>20)undo.shift();persist()}
function refreshTerrain(){
const p=terrainGeo.attributes.position;
const rgb=new Float32Array(COUNT*3),color=new THREE.Color();
for(let i=0;i<COUNT;i++){
 const h=live.heights[i];p.setY(i,h);
 const green=.40+clamp(h/55,0,1)*-.25;color.setRGB(.20+green*.18,green+.20,.26+green*.08);
 rgb[i*3]=color.r;rgb[i*3+1]=color.g;rgb[i*3+2]=color.b;
}
p.needsUpdate=true;terrainGeo.setAttribute('color',new THREE.BufferAttribute(rgb,3));terrainGeo.computeVertexNormals();terrainGeo.computeBoundingSphere();terrainGeo.computeBoundingBox();holesEditor?.syncGeometry();
}
function shape(type,geo,color,x,y,z,group=surface){const m=new THREE.Mesh(geo,solid(color));m.position.set(x,y,z);group.add(m);return m}
function marker(x,z,color,scale=2){const g=new THREE.Group();g.name='EditorOnlyMarker';g.userData.editorOnly=true;g.position.set(x,heightAt(x,z),z);surface.add(g);
shape('marker',new THREE.ConeGeometry(scale,scale*2,5),color,0,scale+1.5,0,g);
return g}
function routeMesh(a,b,type){
const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<.2)return;
const count=Math.ceil(d/4),width=type==='path'?8:5,verts=[];
for(let i=0;i<count;i++){
 const build=(t,offset)=>{const x=a.x+dx*t+(-dz/d)*offset,z=a.z+dz*t+(dx/d)*offset;
 return[x,heightAt(x,z)+(type==='path'?.25:.1),z]};
 const x=i/count,y=(i+1)/count,aa=build(x,-width/2),bb=build(x,width/2),cc=build(y,-width/2),dd=build(y,width/2);
 verts.push(...aa,...bb,...dd,...aa,...dd,...cc);
}
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();
const m=new THREE.Mesh(g,solid(type==='path'?colours.path:colours.stairs));surface.add(m);
}
function stairMesh(a,b,rise=8){
const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.2)return;
const steps=Math.max(2,Math.ceil(len/2.8)),heading=-Math.atan2(dz,dx);
const y1=heightAt(a.x,a.z),rawY2=heightAt(b.x,b.z);
const y2=Math.abs(rawY2-y1)>=1.5?rawY2:y1+rise;
for(let i=0;i<steps;i++){
 const t=(i+.5)/steps,x=a.x+dx*t,z=a.z+dz*t;
 const y=y1+(y2-y1)*(i+1)/steps;
 const block=shape('',new THREE.BoxGeometry(len/steps+.07,.6,5),colours.stairs,x,y-.25,z);
 block.rotation.y=heading;
}
}
function wallMesh(a,b,wallHeight=12){
const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.2)return;
const segments=Math.max(1,Math.ceil(len/7));
for(let k=0;k<segments;k++){
 const t=(k+.5)/segments,x=a.x+dx*t,z=a.z+dz*t,y=heightAt(x,z);
 const h=wallHeight;
 const block=shape('',new THREE.BoxGeometry(len/segments+.3,h,3.6),colours.wall,x,y+h/2,z);
 block.rotation.y=-Math.atan2(dz,dx);
}
}
function gateMesh(a,b){const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(!d)return;
const y=(heightAt(a.x,a.z)+heightAt(b.x,b.z))/2;
for(let i=0;i<Math.ceil(d/1.7);i++){
 const t=i/Math.max(1,Math.ceil(d/1.7)-1),x=a.x+dx*t,z=a.z+dz*t;
 shape('',new THREE.CylinderGeometry(.25,.25,8,5),colours.gate,x,heightAt(x,z)+4,z);
}
const bar=shape('',new THREE.BoxGeometry(d,.7,.7),colours.gate,(a.x+b.x)/2,y+7.4,(a.z+b.z)/2);bar.rotation.y=-Math.atan2(dz,dx);
}
function caveModel(o){
const {x,z}=o,y=heightAt(x,z);
const group=new THREE.Group();group.position.set(x,y,z);group.scale.setScalar(o.scale||1);surface.add(group);
shape('',new THREE.BoxGeometry(13,10,3),colours.cave,0,4.5,0,group);
shape('',new THREE.BoxGeometry(5,8,3.6),0x090c14,0,4,1.9,group);
shape('',new THREE.BoxGeometry(18,2,8),colours.wall,0,10,0,group);
shape('',new THREE.ConeGeometry(11,7,5),colours.wall,0,13,0,group);
const interior=new THREE.Group();interior.position.set(x,-15,z);interior.scale.setScalar(o.scale||1);interiors.add(interior);
const floor=shape('',new THREE.BoxGeometry(34,.4,38),0x665e54,0,-.2,0,interior);
for(const [xx,zz,w,d] of [[-17,0,2,40],[17,0,2,40],[0,-19,36,2],[0,19,36,2]]){
shape('',new THREE.BoxGeometry(w,8,d),colours.wall,xx,4,zz,interior)}
interior.visible=true;
const lip=shape('',new THREE.BoxGeometry(5,1,5),colours.stairs,0,y-2,0,group);lip.visible=false;
}
function mountainModel(o){
const y=heightAt(o.x,o.z),radius=o.radius||33,height=o.height||35,group=new THREE.Group();group.position.set(o.x,y,o.z);group.rotation.y=o.rotation||0;surface.add(group);
shape('',new THREE.CylinderGeometry(radius*.62,radius,height,7,1),colours.mountain,0,height/2,0,group);
shape('',new THREE.CylinderGeometry(radius*.62,radius*.64,1.1,7),0x9ca08a,0,height+.5,0,group);
const steps=28;
for(let i=0;i<steps;i++){
const t=i/steps,a=t*Math.PI*2*1.35,x=Math.cos(a)*(radius-3-t*radius*.43),z=Math.sin(a)*(radius-3-t*radius*.43);
const step=shape('',new THREE.BoxGeometry(7,1.2,5),colours.path,x,1.3+t*(height-2),z,group);step.rotation.y=-a;
}
shape('',new THREE.BoxGeometry(8,7,2),colours.cave,radius*.25,height+4,0,group);
shape('',new THREE.BoxGeometry(5,6,2.2),0x10131c,radius*.25,height+3.5,1.5,group);
}
function resolvePoint(p){const a=p?.anchorId&&live.nodes.find(n=>n.id===p.anchorId&&n.kind==='anchor');return a?{x:a.x,z:a.z}:{x:p.x,z:p.z}}
function snapPoint(x,z){let near=null,best=10;for(const n of live.nodes){if(n.kind!=='anchor')continue;const d=Math.hypot(n.x-x,n.z-z);if(d<best){best=d;near=n}}return near?{x:near.x,z:near.z,anchorId:near.id}:{x,z}}
function draw(){
renderedNodes.clear();
for(const collection of [surface,interiors,cavePiecesLayer])while(collection.children.length){
 const g=collection.children[0];collection.remove(g);
 // GLB instances share their immutable geometry and materials with the cache.
 if(g.userData.sharedAsset)continue;
 g.traverse(m=>{m.geometry?.dispose();const mats=Array.isArray(m.material)?m.material:(m.material?[m.material]:[]);for(const mat of mats)mat?.dispose?.()});
}
for(const n of live.nodes){
 const layers=[surface,interiors,cavePiecesLayer];
 const before=layers.map(layer=>layer.children.length);
 if(n.kind==='anchor')marker(n.x,n.z,colours.anchor,1.4);
if(n.kind==='tree')marker(n.x,n.z,colours.tree,2.2);
if(n.kind==='wallspawn')marker(n.x,n.z,colours.wall,2.2);
if(n.kind==='spawn')marker(n.x,n.z,colours.spawn,3);
if(n.kind==='exit')marker(n.x,n.z,colours.exit,3);
if(n.kind==='cave')caveModel(n);
if(n.kind==='mountain')mountainModel(n);
if(n.kind==='cavePiece')cavePiecesLayer.add(createCavePieceObject(n,heightAt));
if(n.kind==='prefab'){const object=prefabLibrary?.instance(n,heightAt);if(object)cavePiecesLayer.add(object);}
if(n.kind==='path')routeMesh(resolvePoint(n.a),resolvePoint(n.b),'path');
if(n.kind==='stairs')stairMesh(resolvePoint(n.a),resolvePoint(n.b),n.rise||8);
if(n.kind==='wall')wallMesh(resolvePoint(n.a),resolvePoint(n.b),n.height||12);
if(n.kind==='gate')gateMesh(resolvePoint(n.a),resolvePoint(n.b));
 const roots=[];
 for(let i=0;i<layers.length;i++)for(const root of layers[i].children.slice(before[i])){
  root.userData.wildtrapNodeId=n.id;
  roots.push(root);
 }
 renderedNodes.set(n.id,roots);
}
surface.visible=true;terrain.visible=true;interiors.visible=false;
updateSelectionHighlights();updateHoverHighlight();updateStatus();
}
function updatePrefabLoadStatus(){
 if(!prefabLibrary)return;
 const entries=prefabLibrary.status();
 const done=entries.filter(x=>x.state==='listo').length;
 const errors=entries.filter(x=>x.state==='error');
 $('prefabStatus').textContent=done+'/4 GLB cargados'+(errors.length?' · Error: '+errors.map(e=>e.name).join(', '):'');
}
function updateSelectionHighlights(){
 for(const obj of [...selectedHighlights.children]){
  selectedHighlights.remove(obj);obj.geometry?.dispose();obj.material?.dispose();
 }
 scene.updateMatrixWorld(true);
 for(const id of selectedIds){
  const roots=renderedNodes.get(id)||[];
  const bounds=new THREE.Box3();
  for(const root of roots)if(root.visible)bounds.expandByObject(root);
  if(!bounds.isEmpty()){
   const outline=new THREE.Box3Helper(bounds,0xffdb74);
   outline.userData.editorOnly=true;
   selectedHighlights.add(outline);
  }
 }
}
function updateHoverHighlight(){
 for(const item of [...hoverHighlights.children]){
  hoverHighlights.remove(item);item.geometry?.dispose();item.material?.dispose();
 }
 if(hoveredNodeId===null)return;
 const bounds=new THREE.Box3();
 for(const root of renderedNodes.get(hoveredNodeId)||[])if(root.visible)bounds.expandByObject(root);
 if(bounds.isEmpty())return;
 const helper=new THREE.Box3Helper(bounds,0x00ffdf);
 helper.userData.editorOnly=true;hoverHighlights.add(helper);
}
function clearPlacement(){
 if(placementGhost){prefabLibrary?.disposePreview(placementGhost);placementGhost=null;}
 armedPrefabId=null;
 $('interactionHelp').style.display='none';cursor.visible=true;
}
function armPlacement(id){
 clearPlacement();
 if(!prefabById(id))return false;
 armedPrefabId=id;
 placementGhost=prefabLibrary?.createPreview(id)||null;
 if(!placementGhost){armedPrefabId=null;toast('No se pudo preparar la vista del modelo');return false}
 scene.add(placementGhost);
 $('prefabType').value=id;
 $('interactionHelp').textContent='✥ '+(prefabById(id)?.name||id)+' · Mueve el cursor sobre el terreno y haz clic para colocarlo · Esc: cancelar';
 $('interactionHelp').style.display='block';cursor.visible=false;
 return true;
}
function updatePlacementAt(point){
 if(!placementGhost)return;
 if(!point){placementGhost.visible=false;return}
 placementGhost.position.set(point.x,heightAt(point.x,point.z),point.z);
 placementGhost.visible=true;
}
function setHoverNode(node,event){
 const next=node?.id??null;
 if(next!==hoveredNodeId){hoveredNodeId=next;updateHoverHighlight();}
 const indicator=$('modelHoverIndicator');
 if(node&&!marqueeStart){
  const noun=node.kind==='prefab'?(prefabById(node.prefabId)?.name||'Modelo'):'Elemento';
  indicator.textContent=(event.shiftKey&&node.kind==='prefab'?'↕ Escalar ':'✥ ')+noun+' · '+(event.shiftKey&&node.kind==='prefab'?'Shift + arrastrar':'Clic y arrastrar');
  indicator.style.left=Math.min(event.clientX+18,Math.max(0,innerWidth-220))+'px';
  indicator.style.top=Math.min(event.clientY+18,Math.max(0,innerHeight-42))+'px';
  indicator.style.display='block';
  view.style.cursor=event.shiftKey&&node.kind==='prefab'?'ns-resize':'grab';
 }else{
  indicator.style.display='none';view.style.cursor='crosshair';
 }
}
function updateStatus(){
 const n=live.nodes.length;
 $('status').textContent=n+' elementos · '+(live.holes||[]).length+' celdas antiguas · '+(live.cuts3d||[]).filter(x=>x.op==='cut').length+' cortes 3D · '+live.nodes.filter(x=>x.kind==='prefab').length+' modelos GLB';
 const picked=live.nodes.find(x=>x.id===selectedId);
 $('selected').textContent=selectedIds.size>1?selectedIds.size+' elementos seleccionados':(picked?'ID '+picked.id+' · '+(picked.kind==='prefab'?prefabById(picked.prefabId)?.name||picked.prefabId:picked.kind):'Nada seleccionado');
 if(picked?.kind==='prefab'){
  if(!armedPrefabId)$('prefabType').value=picked.prefabId;
  $('prefabX').value=picked.x;
  $('prefabZ').value=picked.z;
  $('prefabRotation').value=((picked.rotation||0)*180/Math.PI).toFixed(1);
  $('prefabOffsetY').value=picked.offsetY||0;
  $('prefabScale').value=picked.scale||1;
 }
 $('pending').textContent=pending?'Primer punto fijado: selecciona el segundo':'';
}
function setMode(v){
 if(v!=='prefab'&&armedPrefabId)clearPlacement();
 mode=v;pending=null;
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===v));
 $('openPrefabGallery').classList.toggle('active',v==='prefab');
 updateStatus();
}
const tools={raise:1,lower:1,flatten:1,smooth:1,holePaint:1,holeErase:1};
function brush(x,z){
const radius=Number($('brushRadius').value),strength=Number($('strength').value),target=Number($('flatHeight').value),cell=SIZE/(N-1);
const cx=Math.round((x/SIZE+.5)*(N-1)),cz=Math.round((z/SIZE+.5)*(N-1));const r=Math.ceil(radius/cell);
let source=mode==='smooth'?live.heights.slice():null;
for(let j=Math.max(0,cz-r);j<=Math.min(N-1,cz+r);j++)for(let i=Math.max(0,cx-r);i<=Math.min(N-1,cx+r);i++){
const px=(i/(N-1)-.5)*SIZE,pz=(j/(N-1)-.5)*SIZE,d=Math.hypot(px-x,pz-z);
if(d>radius)continue;const falloff=(1-d/radius)**2,k=index(i,j),old=live.heights[k],delta=strength*.12*falloff;
if(mode==='raise')live.heights[k]=clamp(old+delta,0,Number($('maxHeight').value));
if(mode==='lower')live.heights[k]=clamp(old-delta,0,Number($('maxHeight').value));
if(mode==='flatten')live.heights[k]=clamp(old+(target-old)*clamp(delta*.17,0,1),0,Number($('maxHeight').value));
if(mode==='smooth'){let v=0,num=0;for(let yy=Math.max(0,j-1);yy<=Math.min(N-1,j+1);yy++)for(let xx=Math.max(0,i-1);xx<=Math.min(N-1,i+1);xx++){v+=source[index(xx,yy)];num++}live.heights[k]=old+(v/num-old)*clamp(delta*.4,0,1)}
}
refreshTerrain();draw();persist();
}
function addNode(node){snapshot();const n={id:live.nextId++,...node};live.nodes.push(n);selectedId=n.id;selectedIds.clear();selectedIds.add(n.id);draw();persist()}
function convertCoords(event){
const rect=view.getBoundingClientRect();
mouse.x=((event.clientX-rect.left)/rect.width)*2-1;mouse.y=-((event.clientY-rect.top)/rect.height)*2+1;
ray.setFromCamera(mouse,camera);
if(mode==='holePaint'||mode==='holeErase')return holesEditor?.pick(ray)||null;
const hits=ray.intersectObject(terrain);
if(hits.length)return{x:hits[0].point.x,z:hits[0].point.z,y:hits[0].point.y};
return ray.ray.intersectPlane(plane,temp)?{x:temp.x,z:temp.z,y:heightAt(temp.x,temp.z)}:null;
}
function act(point){
const {x,z}=point,link=['path','wall','stairs','gate'];
if(link.includes(mode)){
 if(!pending){pending=snapPoint(x,z);updateStatus();return}
 addNode({kind:mode,a:pending,b:snapPoint(x,z),...(mode==='stairs'?{rise:Number($('stairRise').value)||8}:{}),...(mode==='wall'?{height:Number($('wallHeight').value)||12}:{})});pending=null;return;
}
if(mode==='select'||mode==='move'||mode==='delete'){
 let best=null,d=Infinity;
 for(const n of live.nodes){
let dd=Infinity;
if(n.x!==undefined)dd=Math.hypot(x-n.x,z-n.z);
else if(n.a&&n.b){const a=resolvePoint(n.a),b=resolvePoint(n.b),vx=b.x-a.x,vz=b.z-a.z,len=vx*vx+vz*vz;const t=len?clamp(((x-a.x)*vx+(z-a.z)*vz)/len,0,1):0;dd=Math.hypot(x-(a.x+vx*t),z-(a.z+vz*t))}
if(dd<d){d=dd;best=n}}
 if(best&&d<Math.max(16,best.kind==='prefab'?34:16)){
  if(mode==='delete'){snapshot();live.nodes=live.nodes.filter(n=>n.id!==best.id);selectedIds.delete(best.id);selectedId=null;draw();persist()}
  else{
   if(!selectedIds.has(best.id)){selectedIds.clear();selectedIds.add(best.id)}
   selectedId=best.id;
   if(mode==='move'){
    snapshot();dragId=best.id;
    moveBases={x,z,nodes:[...selectedIds].map(id=>live.nodes.find(n=>n.id===id)).filter(Boolean).map(n=>({id:n.id,original:structuredClone(n)}))};
   }
   draw();
  }
 }
 return;
}
if(mode==='prefab'){
 const prefabId=armedPrefabId||$('prefabType').value;
 if(!armedPrefabId||!prefabById(prefabId)){toast('Primero elige un modelo en la galería');return}
 addNode({kind:'prefab',prefabId,x,z,rotation:0,scale:1,offsetY:0});
 clearPlacement();setMode('move');
 $('prefabChosen').textContent='Modelo colocado · Selecciónalo y arrástralo, o abre la galería para colocar otro';
}else if(['tree','wallspawn','spawn','exit','anchor'].includes(mode))addNode({kind:mode,x,z});
}
function resize(){
const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h,false);
if(camera.isOrthographicCamera){const aspect=w/h;camera.left=-viewSpan*aspect/2;camera.right=viewSpan*aspect/2;camera.top=viewSpan/2;camera.bottom=-viewSpan/2}
else camera.aspect=w/h;camera.updateProjectionMatrix();
}
let viewSpan=720;
function setTop(){camera.position.set(0,950,.01);camera.up.set(0,0,-1);orbit.target.set(0,0,0);camera.lookAt(0,0,0);orbit.update();orbit.enableRotate=false;resize()}
setTop();
prefabLibrary=createPrefabLibrary(()=>{draw();updatePrefabLoadStatus()});
void prefabLibrary.preload().then(()=>{draw();updatePrefabLoadStatus()});
updatePrefabLoadStatus();
const prefabGallery=createPrefabGallery({
 library:prefabLibrary,
 root:$('prefabModal'),
 onPick:id=>{
  setNodeSelection([]);
  if(!armPlacement(id))return;
  $('prefabChosen').textContent='Modelo elegido: '+(prefabById(id)?.name||id)+' · Sigue el cursor · Haz clic sobre el terreno para colocarlo';
  setMode('prefab');
 }
});
$('openPrefabGallery').onclick=()=>prefabGallery.open();
holesEditor=createTerrainHoles({scene,terrainGeo,terrain,live,heightAt,refreshTerrain,snapshot,persist,toast,$});
const preview=createPlaytest({scene,renderer,view,orbit,terrain,cursor,live,heightAt,$,resizeEditor:resize,isHoleAt:(x,y,z)=>holesEditor.isHoleAt(x,z,y)});
$('test').onclick=()=>preview.start();
$('createHole').onclick=()=>{holesEditor.apply(true);draw()};
$('restoreHole').onclick=()=>{holesEditor.apply(false);draw()};
$('clearHoleSelection').onclick=()=>holesEditor.clearSelection();
$('stopTest').onclick=()=>preview.stop();
$('localFarolera').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)preview.fromFile(file);e.target.value=''});
function setNodeSelection(ids){
 selectedIds.clear();
 for(const id of ids)if(live.nodes.some(n=>n.id===id))selectedIds.add(id);
 selectedId=[...selectedIds].at(-1)??null;
 updateSelectionHighlights();updateStatus();
}
function pointerRay(e){
 const bounds=view.getBoundingClientRect();
 mouse.x=(e.clientX-bounds.left)/bounds.width*2-1;
 mouse.y=-(e.clientY-bounds.top)/bounds.height*2+1;
 ray.setFromCamera(mouse,camera);
 return ray;
}
function pickedNodeAt(e){
 pointerRay(e);
 // Ensure raycasting uses current positions even during a live drag.
 scene.updateMatrixWorld(true);
 const hits=ray.intersectObjects([...surface.children,...cavePiecesLayer.children],true);
 for(const hit of hits){
  let obj=hit.object;
  while(obj&&!Number.isInteger(obj.userData?.wildtrapNodeId))obj=obj.parent;
  if(obj){
   const node=live.nodes.find(n=>n.id===obj.userData.wildtrapNodeId);
   if(node)return node;
  }
 }
 // Some imported GLBs have inward-facing normals. Test both sides only
 // for picking, then restore shared materials. Never select an empty cave opening
 // just because its bounding box contains the ray.
 const originals=new Map();
 cavePiecesLayer.traverse(obj=>{
  if(!obj.isMesh)return;
  for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material])){
   if(mat&&!originals.has(mat)){originals.set(mat,mat.side);mat.side=THREE.DoubleSide}
  }
 });
 let doubleHits=[];
 try{doubleHits=ray.intersectObjects(cavePiecesLayer.children,true)}
 finally{for(const [mat,side] of originals)mat.side=side}
 for(const hit of doubleHits){
  let obj=hit.object;
  while(obj&&!Number.isInteger(obj.userData?.wildtrapNodeId))obj=obj.parent;
  if(obj){
   const node=live.nodes.find(n=>n.id===obj.userData.wildtrapNodeId);
   if(node)return node;
  }
 }
 return null;
}
function updateMarquee(x,y){
 if(!marqueeStart)return;
 const el=$('selectionMarquee');
 const left=Math.min(marqueeStart.x,x),top=Math.min(marqueeStart.y,y);
 el.style.left=left+'px';el.style.top=top+'px';
 el.style.width=Math.abs(x-marqueeStart.x)+'px';
 el.style.height=Math.abs(y-marqueeStart.y)+'px';
}
function marqueeHits(x,y){
 const left=Math.min(marqueeStart.x,x),right=Math.max(marqueeStart.x,x);
 const top=Math.min(marqueeStart.y,y),bottom=Math.max(marqueeStart.y,y);
 const viewBox=view.getBoundingClientRect(),ids=[];
 scene.updateMatrixWorld(true);
 camera.updateMatrixWorld(true);
 for(const [id,roots] of renderedNodes){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const root of roots){
   if(!root.visible)continue;
   const bounds=new THREE.Box3().setFromObject(root);
   if(bounds.isEmpty())continue;
   for(const bx of [bounds.min.x,bounds.max.x])
    for(const by of [bounds.min.y,bounds.max.y])
     for(const bz of [bounds.min.z,bounds.max.z]){
      const v=new THREE.Vector3(bx,by,bz).project(camera);
      if(v.z < -1||v.z>1)continue;
      const sx=viewBox.left+(v.x+1)*viewBox.width/2;
      const sy=viewBox.top+(1-v.y)*viewBox.height/2;
      minX=Math.min(minX,sx);minY=Math.min(minY,sy);
      maxX=Math.max(maxX,sx);maxY=Math.max(maxY,sy);
     }
  }
  if(minX<=right&&maxX>=left&&minY<=bottom&&maxY>=top)ids.push(id);
 }
 return ids;
}
let previousOrbitEnabled=true;
view.addEventListener('pointerdown',e=>{
 if(preview.active||preview.busy||!e.ctrlKey||(e.button!==0&&e.button!==2))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.button===0){
  const picked=pickedNodeAt(e);
  if(!picked){setNodeSelection([]);return}
  const next=new Set(selectedIds);
  if(next.has(picked.id))next.delete(picked.id);else next.add(picked.id);
  setNodeSelection(next);
 }else{
  marqueeStart={x:e.clientX,y:e.clientY};
  previousOrbitEnabled=orbit.enabled;orbit.enabled=false;
  $('selectionMarquee').style.display='block';
  updateMarquee(e.clientX,e.clientY);
 }
},true);
view.addEventListener('pointermove',e=>{
 if(!marqueeStart)return;
 e.preventDefault();e.stopImmediatePropagation();
 updateMarquee(e.clientX,e.clientY);
},true);
view.addEventListener('contextmenu',e=>{if(e.ctrlKey||marqueeStart)e.preventDefault()});
window.addEventListener('pointerup',e=>{
 if(!marqueeStart)return;
 const start=marqueeStart,dx=e.clientX-start.x,dy=e.clientY-start.y;
 if(Math.hypot(dx,dy)>5)setNodeSelection(marqueeHits(e.clientX,e.clientY));
 marqueeStart=null;
 $('selectionMarquee').style.display='none';
 orbit.enabled=previousOrbitEnabled;
});
// Direct model interaction: the terrain ray positions models; the mesh ray selects them.
function beginModelDrag(e,node){
 if(!selectedIds.has(node.id))setNodeSelection([node.id]);
 selectedId=node.id;
 const ground=convertCoords(e)||{x:node.x||0,z:node.z||0};
 dragSession={
  pointerId:e.pointerId,
  startX:e.clientX,startY:e.clientY,
  ground:{x:ground.x,z:ground.z},
  action:e.shiftKey&&node.kind==='prefab'?'scale':'move',
  nodes:[...selectedIds].map(id=>live.nodes.find(n=>n.id===id)).filter(Boolean).map(n=>({id:n.id,original:structuredClone(n)})),
  changed:false
 };
 try{view.setPointerCapture(e.pointerId)}catch(_){}
 view.style.cursor=dragSession.action==='scale'?'ns-resize':'grabbing';
 updateStatus();
}
function updateMovedPrefabs(){
 let hasNonPrefab=false;
 for(const id of selectedIds){
  const n=live.nodes.find(node=>node.id===id);
  if(!n)continue;
  if(n.kind!=='prefab'){hasNonPrefab=true;continue}
  for(const root of renderedNodes.get(id)||[]){
   if(!root.userData.sharedAsset)continue;
   root.position.set(n.x,heightAt(n.x,n.z)+(Number(n.offsetY)||0),n.z);
   root.rotation.y=n.rotation||0;
   root.scale.setScalar(n.scale||1);
  }
 }
 if(hasNonPrefab)draw();
 else{updateSelectionHighlights();updateHoverHighlight();updateStatus()}
}
function moveModelDrag(e){
 if(!dragSession)return;
 if(e.pointerId!==dragSession.pointerId)return;
 const session=dragSession;
 if(Math.hypot(e.clientX-session.startX,e.clientY-session.startY)<3&&!session.changed)return;
 if(!session.changed){snapshot();session.changed=true;}
 if(session.action==='scale'){
  const multiplier=Math.exp((session.startY-e.clientY)*.008);
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id);
   if(n?.kind==='prefab')n.scale=clamp((item.original.scale||1)*multiplier,.05,15);
  }
 }else{
  const p=convertCoords(e);
  if(!p)return;
  const dx=p.x-session.ground.x,dz=p.z-session.ground.z;
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id),orig=item.original;
   if(!n)continue;
   if(orig.a&&orig.b){
    n.a={x:orig.a.x+dx,z:orig.a.z+dz};
    n.b={x:orig.b.x+dx,z:orig.b.z+dz};
   }else if(orig.x!==undefined){
    n.x=clamp(orig.x+dx,-SIZE/2+1,SIZE/2-1);
    n.z=clamp(orig.z+dz,-SIZE/2+1,SIZE/2-1);
   }
  }
 }
 updateMovedPrefabs();
 view.style.cursor=session.action==='scale'?'ns-resize':'grabbing';
 const current=live.nodes.find(x=>x.id===session.nodes[0]?.id);
 if(current)setHoverNode(current,e);
}
function completeModelDrag(e){
 if(!dragSession)return;
 const old=dragSession;
 dragSession=null;
 if(old.changed)persist();
 try{if(view.hasPointerCapture?.(old.pointerId))view.releasePointerCapture(old.pointerId)}catch(_){}
 view.style.cursor='crosshair';
}
view.addEventListener('pointerdown',e=>{
 if(preview.active||preview.busy||marqueeStart||prefabGallery.isOpen()||e.ctrlKey||e.button!==0)return;
 // First raycast the actual GLB/scene meshes, so clicking any visible rock selects it.
 const hovered=pickedNodeAt(e);
 if(hovered){
  e.preventDefault();
  if(mode==='delete'){
   snapshot();live.nodes=live.nodes.filter(n=>n.id!==hovered.id);
   selectedIds.delete(hovered.id);selectedId=null;setHoverNode(null,e);draw();persist();
   return;
  }
  if(armedPrefabId)setMode('move'); // Clicking an existing model cancels placement.
  beginModelDrag(e,hovered);setHoverNode(hovered,e);
  return;
 }
 const p=convertCoords(e);
 if(!p)return;
 if(armedPrefabId&&mode==='prefab'){
  // The translucent preview is NOT an extra node; commit one actual GLB here.
  act(p);setHoverNode(null,e);return;
 }
 pointerDown=true;changed=false;
 if(mode==='holePaint'||mode==='holeErase'){
  holesEditor.paint(p,mode==='holeErase');changed=true;
 }else if(tools[mode]){
  snapshot();brush(p.x,p.z);changed=true;
 }else if(mode==='move'){
  setNodeSelection([]);setHoverNode(null,e);
 }else act(p);
});
view.addEventListener('pointermove',e=>{
 if(preview.active||preview.busy||prefabGallery.isOpen()||marqueeStart)return;
 if(dragSession){moveModelDrag(e);return}
 // Keep hover picking independent of edit mode. Ghosts and selection outlines
 // are outside these raycast layers and never intercept a model click.
 const hovered=pickedNodeAt(e);
 setHoverNode(hovered,e);
 const p=convertCoords(e);
 if(!p){updatePlacementAt(null);return}
 $('coords').textContent='X '+p.x.toFixed(1)+' · Z '+p.z.toFixed(1)+' · altura '+heightAt(p.x,p.z).toFixed(1);
 if(armedPrefabId&&mode==='prefab'){updatePlacementAt(p);return}
 const holeMode=mode==='holePaint'||mode==='holeErase';
 if(holeMode&&p.normal){
  const normal=new THREE.Vector3(...p.normal);
  cursor.position.set(p.x+.22*normal.x,p.y+.22*normal.y,p.z+.22*normal.z);
  cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
 }else{
  cursor.position.set(p.x,p.y+.3,p.z);
  cursor.rotation.set(-Math.PI/2,0,0);
 }
 const radius=tools[mode]?Number($('brushRadius').value):4;
 cursor.scale.setScalar(radius);
 if(pointerDown&&holeMode)holesEditor.paint(p,mode==='holeErase');
 else if(pointerDown&&tools[mode])brush(p.x,p.z);
});
view.addEventListener('pointerleave',e=>{
 if(!dragSession){setHoverNode(null,e);updatePlacementAt(null)}
});
window.addEventListener('pointerup',e=>{
 completeModelDrag(e);
 pointerDown=false;holesEditor.endStroke();moveBases=null;dragId=null;
});
view.addEventListener('wheel',e=>{if(!camera.isOrthographicCamera)return;e.preventDefault();viewSpan=clamp(viewSpan*Math.exp(e.deltaY*.001),80,1400);resize()},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.tool)));
$('top').onclick=()=>{setTop();$('viewType').textContent='Vista cenital'};
$('angle').onclick=()=>{camera.up.set(0,1,0);camera.position.set(300,330,350);orbit.target.set(0,0,0);orbit.enableRotate=true;orbit.update();$('viewType').textContent='Vista 3D'};
$('reset').onclick=()=>{if(!confirm('¿Vaciar el editor y el terreno?'))return;snapshot();live.heights.fill(0);live.nodes=[];live.holes=[];live.cuts3d=[];live.nextId=1;selectedIds.clear();selectedId=null;holesEditor.clearSelection();refreshTerrain();draw();persist()};
$('undo').onclick=()=>{const data=undo.pop();if(!data)return;const v=JSON.parse(data);Object.assign(live,v);if(!Array.isArray(live.holes))live.holes=[];if(!Array.isArray(v.cuts3d))live.cuts3d=[];selectedIds.clear();selectedId=null;holesEditor.clearSelection();refreshTerrain();draw();persist()};
$('prefabType').addEventListener('change',()=>{if(mode==='prefab')updateStatus()});
$('applyPrefab').onclick=()=>{
 const targets=[...selectedIds].map(id=>live.nodes.find(n=>n.id===id)).filter(n=>n?.kind==='prefab');
 if(!targets.length){toast('Selecciona un modelo GLB con Ctrl + clic');return}
 snapshot();
 const primary=targets.find(n=>n.id===selectedId)||targets[0];
 const dx=(Number($('prefabX').value)||0)-primary.x;
 const dz=(Number($('prefabZ').value)||0)-primary.z;
 const rot=(Number($('prefabRotation').value)||0)*Math.PI/180;
 const rotationDelta=rot-(primary.rotation||0);
 const heightDelta=(Number($('prefabOffsetY').value)||0)-(primary.offsetY||0);
 const newScale=clamp(Number($('prefabScale').value)||1,.05,15);
 const scaleRatio=newScale/(primary.scale||1);
 for(const n of targets){
  n.x=clamp(n.x+dx,-SIZE/2,SIZE/2);
  n.z=clamp(n.z+dz,-SIZE/2,SIZE/2);
  n.rotation=(n.rotation||0)+rotationDelta;
  n.offsetY=(n.offsetY||0)+heightDelta;
  n.scale=clamp((n.scale||1)*scaleRatio,.05,15);
 }
 draw();persist();toast(targets.length+' modelo(s) actualizado(s)');
};
$('duplicatePrefab').onclick=()=>{
 const n=live.nodes.find(n=>n.id===selectedId&&n.kind==='prefab');
 if(!n){toast('Selecciona un modelo GLB con Ctrl + clic');return}
 const copy=structuredClone(n);delete copy.id;
 copy.x=clamp(copy.x+12,-SIZE/2+3,SIZE/2-3);
 copy.z=clamp(copy.z+8,-SIZE/2+3,SIZE/2-3);
 addNode(copy);toast('Modelo duplicado');
};
$('clearNodeSelection').onclick=()=>setNodeSelection([]);
$('remove').onclick=()=>{if(!selectedIds.size)return;snapshot();live.nodes=live.nodes.filter(n=>!selectedIds.has(n.id));selectedIds.clear();selectedId=null;draw();persist()};
$('export').onclick=()=>{download('wildtrap-escenario.json',new Blob([JSON.stringify(live)],{type:'application/json'}))};
$('importJSON').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const x=JSON.parse(await file.text());if(x.size!==SIZE||x.resolution!==N||!Array.isArray(x.heights)||x.heights.length!==COUNT||!Array.isArray(x.nodes))throw Error('Formato o tamaño incompatible');snapshot();Object.assign(live,x);live.holes=Array.isArray(x.holes)?x.holes:[];live.cuts3d=Array.isArray(x.cuts3d)?x.cuts3d:[];selectedIds.clear();selectedId=null;holesEditor.clearSelection();updateMaxHeightControl();refreshTerrain();draw();persist();toast('Proyecto cargado')}catch(err){toast('No se pudo cargar: '+err.message)}e.target.value=''});
function download(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function toast(msg){$('toast').textContent=msg;setTimeout(()=>{if($('toast').textContent===msg)$('toast').textContent=''},4500)}
window.addEventListener('keydown',e=>{if(preview.active||preview.busy)return;if(e.target.matches('input,textarea'))return;
if(e.key==='Escape'){pending=null;setNodeSelection([]);setMode('move')}
if(e.key==='Delete')$('remove').click();
if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undo').click()}
});
window.addEventListener('resize',()=>{resize();preview.resize()});
function updateMaxHeightControl(){
 const peak=live.heights.reduce((a,v)=>Math.max(a,v),0);
 $('maxHeight').value=Math.min(150,Math.max(120,Math.ceil(peak/10)*10));
}
async function restoreSavedBase(confirmOverwrite=false){
 if(confirmOverwrite&&!confirm('¿Cargar el terreno base? El guardado actual del editor será reemplazado; puedes exportarlo antes.'))return;
 try{
  const response=await fetch('./assets/terrain/wildtrap-terreno-base.json',{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(data.size!==SIZE||data.resolution!==N||data.heights?.length!==COUNT)throw Error('Terreno base incompatible');
  if(confirmOverwrite)snapshot();
  Object.assign(live,data);
  live.holes=[];
  live.cuts3d=[];
  live.version=3;
  selectedIds.clear();selectedId=null;
  holesEditor.clearSelection();updateMaxHeightControl();
  refreshTerrain();draw();persist();
  toast('Terreno base original recuperado · 630 × 630');
 }catch(error){toast('No se pudo abrir terreno base: '+error.message)}
}
$('restoreBase').onclick=()=>restoreSavedBase(true);
let recoveredDraft=false;
try{
 const saved=localStorage.getItem('wildtrap-editor-draft-v1');
 if(saved){
  const d=JSON.parse(saved);
  if(d.size===SIZE&&d.resolution===N&&d.heights?.length===COUNT&&Array.isArray(d.nodes)){
   Object.assign(live,d);live.holes=Array.isArray(d.holes)?d.holes:[];live.cuts3d=Array.isArray(d.cuts3d)?d.cuts3d:[];
   recoveredDraft=true;
   toast('Proyecto recuperado del guardado automático; puedes usar Cargar terreno base');
  }
 }
}catch(e){toast('No se pudo recuperar el proyecto local')}
updateMaxHeightControl();refreshTerrain();draw();setMode('raise');
async function loadPublishedWorld(){
 try{
  const response=await fetch('./assets/terrain/wildtrap-world.json',{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const world=await response.json();
  if(world.size!==SIZE||world.resolution!==N||world.heights?.length!==COUNT||!Array.isArray(world.nodes))throw Error('Escenario publicado incompatible');
  Object.assign(live,world);
  live.holes=Array.isArray(world.holes)?world.holes:[];
  live.cuts3d=Array.isArray(world.cuts3d)?world.cuts3d:[];
  selectedIds.clear();selectedId=null;
  updateMaxHeightControl();refreshTerrain();draw();persist();
  toast('Escenario oficial cargado desde el repositorio');
 }catch(err){console.warn('No se pudo cargar mapa oficial',err);void restoreSavedBase(false)}
}
$('loadPublished').onclick=()=>{if(confirm('¿Abrir el mapa publicado en GitHub? El proyecto local será reemplazado. Exporta JSON antes si necesitas conservarlo.')){snapshot();void loadPublishedWorld()}};
if(!recoveredDraft)void loadPublishedWorld();
function animate(){requestAnimationFrame(animate);if(!preview.active)orbit.update();renderer.render(scene,preview.frame()||camera)}animate();
window.__editorReady?.();
