import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createSceneObjectManager} from './scene-object-manager.mjs?v=0.9.17';
import {categoryForNode,cleanObjectGroups} from './scene-object-catalog.mjs?v=0.9.10';
import {createPlaytest} from './playtest.mjs?v=0.9.12';
import {createTerrainHoles} from './terrain-holes.mjs?v=0.9.13';
import {createTerrainMeshInspector} from './terrain-mesh-inspector.mjs?v=0.9.17';
import {createObjectMeshOverlays,normalizedMeshLayers} from './scene-mesh-overlays.mjs?v=0.9.17';
import {createCavePieceObject} from './cave-pieces-three.mjs?v=0.9.6';
import {pieceOptions,CAVE_PIECE_TYPES} from './cave-pieces.mjs?v=0.9.6';
import {createPrefabLibrary,prefabById,PREFABS} from './prefab-library.mjs?v=0.9.12';
import {createMeshVertexEditor} from './mesh-vertex-editor.mjs?v=0.9.17';
import {constrainedRotation} from './mesh-deform.mjs?v=0.9.12';
import {DEFAULT_3D_CAMERA,normalizeEditorCameraState} from './editor-camera-state.mjs?v=0.9.18';
import {isFreeCave,prefabWorldY} from './prefab-catalog.mjs?v=0.9.7';
import {createPrefabGallery} from './prefab-gallery.mjs?v=0.9.11';
import {scaleFromVerticalDrag,translateNodeOnTerrain,rotateFromPointerDrag,altitudeFromVerticalDrag,freeCaveFromScreenDrag,constrainTranslationAxes} from './prefab-gestures.mjs?v=0.9.16';
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
const intangibleTerrainMaterial=material.clone();
intangibleTerrainMaterial.transparent=true;
intangibleTerrainMaterial.opacity=.24;
intangibleTerrainMaterial.depthTest=true;
intangibleTerrainMaterial.depthWrite=false;
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
const live={version:3,size:SIZE,resolution:N,heights:Array(COUNT).fill(0),nodes:[],objectGroups:[],holes:[],cuts3d:[],nextId:1,settings:{heightMax:120}};
let holesEditor=null,vertexEditor=null,terrainInspector=null,objectMeshOverlays=null,testingScene=false;
// Modo seguro usa otro espacio local: nunca sobreescribe el proyecto habitual.
const flags=new URLSearchParams(location.search);
const safeMode=flags.has('safe'),recoveryMode=flags.has('recover');
const draftKey=recoveryMode?'wildtrap-editor-draft-recovered-v1':
 safeMode?'wildtrap-editor-draft-safe-v1':'wildtrap-editor-draft-v1';
// A separate small key survives reloads even if the full world draft write
// is still debounced. Each mode has its own camera state.
const cameraKey=draftKey+'-camera-v1';
const undo=[],undoSerials=[];let actionSerial=0;
const nextUndoSerial=()=>++actionSerial;
let saveTimer=null;function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(draftKey,JSON.stringify(live))}catch(e){$('toast').textContent='Aviso: guardado automático bloqueado; exporta JSON'}},700)}
let mode='raise',pointerDown=false,dragId=null,selectedId=null,pending=null,changed=false;
const selectedIds=new Set();let marqueeStart=null,moveBases=null;
// El gestor usa el historial del editor: no modifica la escena por su cuenta.
let sceneObjectManager=null,terrainPropertiesSelected=false;
function sceneGroups(){return cleanObjectGroups(live.objectGroups)}
function pruneUnusedSceneGroups(){
 const active=new Set(live.nodes.filter(n=>categoryForNode(n)).map(n=>n.groupId));
 live.objectGroups=sceneGroups().filter(g=>active.has(g.id));
}
function commitTerrainVisibility(show){
 if((live.settings?.hideTerrainEditor!==true)===show)return;
 snapshot();
 if(!live.settings||typeof live.settings!=='object')live.settings={heightMax:120};
 live.settings.hideTerrainEditor=!show;
 draw();persist();
}
function commitObjectVisibility(ids,show){
 const targets=live.nodes.filter(n=>ids.includes(n.id)&&categoryForNode(n)&&Boolean(n.editorHidden)!==!show);
 if(!targets.length)return;
 snapshot();
 for(const node of targets)node.editorHidden=!show;
 draw();persist();
}
function commitObjectMeshVisibility(ids,enabled){
 const nodes=live.nodes.filter(n=>ids.includes(n.id)&&categoryForNode(n)&&Boolean(n.editorMeshVisible)!==enabled);
 if(!nodes.length)return;
 snapshot();
 for(const n of nodes)n.editorMeshVisible=enabled;
 draw();persist();
}
function commitTerrainMeshVisibility(enabled){
 if(Boolean(live.settings?.terrainMeshVisible)===enabled)return;
 snapshot();
 live.settings.terrainMeshVisible=enabled;
 updateMeshInspection();sceneObjectManager?.render();persist();
}
function commitTerrainIntangible(enabled){
 if(Boolean(live.settings?.terrainIntangible)===enabled)return;
 snapshot();
 live.settings.terrainIntangible=enabled;
 draw();persist();
}
function commitObjectIntangible(ids,enabled){
 const targets=live.nodes.filter(n=>ids.includes(n.id)&&categoryForNode(n)&&Boolean(n.editorIntangible)!==enabled);
 if(!targets.length)return;
 snapshot();
 for(const n of targets)n.editorIntangible=enabled;
 if(enabled&&targets.some(n=>n.id===hoveredNodeId))hoveredNodeId=null;
 draw();persist();
}
function commitObjectGroup(ids,name){
 const targets=live.nodes.filter(n=>ids.includes(n.id)&&categoryForNode(n));
 if(targets.length<2)return;
 const clean=String(name||'').trim().slice(0,65);
 if(!clean)return;
 snapshot();
 live.objectGroups=sceneGroups();
 let i=1;while(live.objectGroups.some(g=>g.id==='group-'+i))i++;
 const groupId='group-'+i;
 live.objectGroups.push({id:groupId,name:clean});
 for(const n of targets)n.groupId=groupId;
 pruneUnusedSceneGroups();draw();persist();
}
function commitObjectUngroup(ids){
 const targets=live.nodes.filter(n=>ids.includes(n.id)&&categoryForNode(n)&&n.groupId);
 if(!targets.length)return;
 snapshot();
 for(const node of targets)delete node.groupId;
 pruneUnusedSceneGroups();draw();persist();
}
function commitObjectRename(id,label){
 const node=live.nodes.find(n=>n.id===id&&categoryForNode(n));
 const name=String(label||'').trim().slice(0,90);
 if(!node||!name||node.name===name)return;
 snapshot();node.name=name;draw();persist();
}
sceneObjectManager=createSceneObjectManager({
 root:document.querySelector('[data-tab-view="objects"]')?.firstElementChild,
 hierarchyRoot:document.querySelector('[data-tab-view="scene"]')?.firstElementChild,
 getNodes:()=>live.nodes,getGroups:()=>live.objectGroups||[],
 getSelection:()=>[...selectedIds],lookup:prefabById,
 select:ids=>{if(mode==='holePaint')setMode('move');setNodeSelection(ids)},
 setVisibility:commitObjectVisibility,setIntangible:commitObjectIntangible,
 setMeshVisibility:commitObjectMeshVisibility,
 group:commitObjectGroup,ungroup:commitObjectUngroup,rename:commitObjectRename,
 terrainIsVisible:()=>live.settings?.hideTerrainEditor!==true,
 setTerrainVisibility:commitTerrainVisibility,
 terrainIsIntangible:()=>live.settings?.terrainIntangible===true,
 setTerrainIntangible:commitTerrainIntangible,
 terrainMeshIsVisible:()=>live.settings?.terrainMeshVisible===true,
 setTerrainMeshVisibility:commitTerrainMeshVisibility,
 selectTerrain:()=>{
  selectedIds.clear();selectedId=null;
  terrainPropertiesSelected=true;
  updateSelectionHighlights();updateStatus();
  window.__workspaceLayout?.activateTab('object');
 }
});
window.__sceneObjectManager=sceneObjectManager;
let armedPrefabId=null,placementGhost=null,placementWorldY=null,hoveredNodeId=null,dragSession=null;
// Keep free cave XY elevation and XZ plane gestures independent of terrain.
let cavePlaneModifierDown=false;
window.addEventListener('keydown',e=>{
 if(e.code!=='Space'||e.target?.matches?.('input,textarea,select,button,[contenteditable="true"]'))return;
 if(testingScene)return;
 cavePlaneModifierDown=true;
 if(dragSession?.action==='free'||dragSession?.action==='plane'||
  live.nodes.some(n=>selectedIds.has(n.id)&&n.kind==='prefab'&&isFreeCave(n.prefabId)))
  e.preventDefault();
},true);
window.addEventListener('keyup',e=>{if(e.code==='Space')cavePlaneModifierDown=false},true);
window.addEventListener('blur',()=>{cavePlaneModifierDown=false});
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const temp=new THREE.Vector3();
const pos=(x,z)=>({x:clamp(x,-SIZE/2,SIZE/2),z:clamp(z,-SIZE/2,SIZE/2)});
function heightAt(x,z){
const fx=clamp((x/SIZE+.5)*(N-1),0,N-1),fz=clamp((z/SIZE+.5)*(N-1),0,N-1),ix=Math.floor(fx),iz=Math.floor(fz),xx=Math.min(N-1,ix+1),zz=Math.min(N-1,iz+1),tx=fx-ix,tz=fz-iz;
const a=live.heights[index(ix,iz)],b=live.heights[index(xx,iz)],c=live.heights[index(ix,zz)],d=live.heights[index(xx,zz)];
return(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz;
}
function snapshot(){undo.push(JSON.stringify(live));undoSerials.push(nextUndoSerial());if(undo.length>20){undo.shift();undoSerials.shift()}persist()}
function refreshTerrain(){
const p=terrainGeo.attributes.position;
const rgb=new Float32Array(COUNT*3),color=new THREE.Color();
for(let i=0;i<COUNT;i++){
 const h=live.heights[i];p.setY(i,h);
 const green=.40+clamp(h/55,0,1)*-.25;color.setRGB(.20+green*.18,green+.20,.26+green*.08);
 rgb[i*3]=color.r;rgb[i*3+1]=color.g;rgb[i*3+2]=color.b;
}
p.needsUpdate=true;terrainGeo.setAttribute('color',new THREE.BufferAttribute(rgb,3));terrainGeo.computeVertexNormals();terrainGeo.computeBoundingSphere();terrainGeo.computeBoundingBox();holesEditor?.syncGeometry();terrainInspector?.refresh();
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
objectMeshOverlays?.dispose();
vertexEditor?.beforeDraw();
renderedNodes.clear();
for(const collection of [surface,interiors,cavePiecesLayer])while(collection.children.length){
 const g=collection.children[0];collection.remove(g);
 // GLB instances share their immutable geometry and materials with the cache.
 if(g.userData.sharedAsset){prefabLibrary?.disposeInstance(g);continue;}
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
if(n.kind==='prefab'){
 const appearance=testingScene&&n.editorIntangible?{...n,editorIntangible:false}:n;
 const object=prefabLibrary?.instance(appearance,heightAt,{applyCuts:!recoveryMode});
 if(object)cavePiecesLayer.add(object);
}
if(n.kind==='path')routeMesh(resolvePoint(n.a),resolvePoint(n.b),'path');
if(n.kind==='stairs')stairMesh(resolvePoint(n.a),resolvePoint(n.b),n.rise||8);
if(n.kind==='wall')wallMesh(resolvePoint(n.a),resolvePoint(n.b),n.height||12);
if(n.kind==='gate')gateMesh(resolvePoint(n.a),resolvePoint(n.b));
 const roots=[];
 for(let i=0;i<layers.length;i++)for(const root of layers[i].children.slice(before[i])){
  root.userData.wildtrapNodeId=n.id;
  roots.push(root);
 }
 for(const root of roots){
  root.visible=n.editorHidden!==true;
  if(n.editorIntangible&&!testingScene&&n.kind!=='prefab'){
   root.traverse(child=>{
    if(!child.isMesh)return;
    const fade=m=>{m.transparent=true;m.opacity=Math.min(.26,m.opacity??1);m.depthWrite=false;m.depthTest=true;m.side=THREE.DoubleSide;return m};
    child.renderOrder=0;
    child.material=Array.isArray(child.material)?child.material.map(fade):fade(child.material);
   });
  }
 }
 renderedNodes.set(n.id,roots);
}
surface.visible=true;terrain.visible=live.settings?.hideTerrainEditor!==true;interiors.visible=false;
terrain.material=live.settings?.terrainIntangible===true&&!testingScene?intangibleTerrainMaterial:material;
updateSelectionHighlights();updateHoverHighlight();updateStatus();
vertexEditor?.rebuild();terrainInspector?.refresh();
objectMeshOverlays?.refresh({skipId:mode==='meshEdit'?selectedId:null,testingScene});
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
 armedPrefabId=null;placementWorldY=null;
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
 $('interactionHelp').textContent='✥ '+(prefabById(id)?.name||id)+
  (isFreeCave(id)?
  ' · Alt + rueda: subir/bajar libremente · Clic: colocar atravesando terreno · Esc: cancelar':
  ' · Sigue el terreno · Clic: colocar sobre la superficie · Esc: cancelar');
 $('interactionHelp').style.display='block';cursor.visible=false;
 return true;
}
function updatePlacementAt(point){
 if(!placementGhost)return;
 if(!point){placementGhost.visible=false;return}
 if(isFreeCave(armedPrefabId)){
  if(!Number.isFinite(placementWorldY))placementWorldY=heightAt(point.x,point.z);
  placementGhost.position.set(point.x,placementWorldY,point.z);
  $('interactionHelp').textContent='Cueva libre · Y '+placementWorldY.toFixed(1)+
   ' · Alt + rueda: subir/bajar · Clic: colocar · Esc: cancelar';
 }else placementGhost.position.set(point.x,heightAt(point.x,point.z),point.z);
 placementGhost.visible=true;
}
function setHoverNode(node,event){
 const next=node?.id??null;
 if(next!==hoveredNodeId){hoveredNodeId=next;updateHoverHighlight();}
 const indicator=$('modelHoverIndicator');
 if(node&&!marqueeStart){
  const noun=node.kind==='prefab'?(prefabById(node.prefabId)?.name||'Modelo'):'Elemento';
  const free=node.kind==='prefab'&&isFreeCave(node.prefabId);
  const action=free&&event.altKey&&event.shiftKey?'height':
   node.kind==='prefab'&&event.altKey?'rotate':
   node.kind==='prefab'&&event.shiftKey?'scale':
   free?(cavePlaneModifierDown?'plane':'free'):'move';
  indicator.textContent=(action==='height'?'↕ Altura libre ':
   action==='rotate'?'⟳ Rotar ':action==='scale'?'↕ Escalar ':
   action==='plane'?'✥ Plano X/Z ':
   action==='free'?'✥ Cueva libre ':'✥ ')+noun+' · '+
   (action==='height'?'Alt + Shift + arrastrar':action==='rotate'?'Alt + arrastrar':
   action==='scale'?'Shift + arrastrar':
   action==='plane'?'Espacio + arrastrar: X/Z sin cambiar Y':
   action==='free'?'Lateral: X/Z · arriba/abajo: Y · Espacio: profundidad':'Clic y arrastrar');
  indicator.style.left=Math.min(event.clientX+18,Math.max(0,innerWidth-220))+'px';
  indicator.style.top=Math.min(event.clientY+18,Math.max(0,innerHeight-42))+'px';
  indicator.style.display='block';
  view.style.cursor=action==='height'||action==='scale'?'ns-resize':action==='rotate'?'crosshair':'grab';
 }else{
  indicator.style.display='none';view.style.cursor='crosshair';
 }
}
function updateStatus(){
 const n=live.nodes.length;
 $('status').textContent=n+' elementos · '+(live.holes||[]).length+' celdas antiguas · '+(live.cuts3d||[]).filter(x=>x.op==='cut').length+' cortes 3D · '+live.nodes.filter(x=>x.kind==='prefab').length+' modelos GLB';
 const picked=live.nodes.find(x=>x.id===selectedId);
 $('caveFreeMoveHelp').hidden=!(picked?.kind==='prefab'&&isFreeCave(picked.prefabId));
 $('selected').textContent=terrainPropertiesSelected?'Terreno de la arena':selectedIds.size>1?selectedIds.size+' elementos seleccionados':(picked?'ID '+picked.id+' · '+(picked.kind==='prefab'?prefabById(picked.prefabId)?.name||picked.prefabId:picked.kind):'Nada seleccionado');
 const cave=picked?.kind==='prefab'&&isFreeCave(picked.prefabId);
 if(picked?.kind==='prefab'){
  if(!armedPrefabId)$('prefabType').value=picked.prefabId;
  $('prefabX').value=picked.x;
  $('prefabZ').value=picked.z;
  $('prefabRotation').value=((picked.rotation||0)*180/Math.PI).toFixed(1);
  $('prefabRotationX').value=((picked.rotationX||0)*180/Math.PI).toFixed(1);
  $('prefabRotationZ').value=((picked.rotationZ||0)*180/Math.PI).toFixed(1);
  $('prefabOffsetY').disabled=!cave;
  $('prefabHeightLabel').textContent=cave?'Altura libre Y (mundo)':'Altura Y (anclada al terreno)';
  $('prefabOffsetY').value=(prefabWorldY(picked,heightAt)+(Number(picked.scaleAnchorOffsetY)||0)).toFixed(2);
  $('prefabScale').value=picked.scale||1;
 }
 const editable=picked?.kind==='prefab';
 $('transformConstraints').hidden=!editable;
 $('meshEditControls').hidden=!editable;
 $('terrainMeshControls').hidden=!terrainPropertiesSelected;
 $('objectMeshToggle').setAttribute('aria-pressed',String(picked?.editorMeshVisible===true));
 $('objectMeshToggle').textContent=picked?.editorMeshVisible?'◫ Ocultar malla del objeto':'◫ Mostrar malla del objeto';
 $('modelVertexEditToggle').setAttribute('aria-pressed',String(mode==='meshEdit'));
 $('modelVertexEditToggle').textContent=mode==='meshEdit'?'✓ Finalizar edición de vértices':'✣ Editar vértices del modelo';
 $('snapCaveToTerrain').disabled=!cave||picked?.rotationLocks?.y===true;
 if(editable){
  const layers=normalizedMeshLayers(picked.editorMeshLayers);
  for(const layer of ['Faces','Edges','Vertices','Xray'])
   $('model'+layer).checked=layers[layer.toLowerCase()];
 }
 if(editable){
  const locks=picked.rotationLocks||{};
  // The saved XYZ lock buttons apply to movement AND rotation.
  $('prefabX').disabled=locks.x===true;
  $('prefabZ').disabled=locks.z===true;
  $('prefabOffsetY').disabled=!cave||locks.y===true;
  $('prefabRotationX').disabled=locks.x===true;
  $('prefabRotation').disabled=locks.y===true;
  $('prefabRotationZ').disabled=locks.z===true;
  for(const axis of ['x','y','z']){
   const button=document.querySelector('[data-rotation-lock="'+axis+'"]');
   button.setAttribute('aria-pressed',String(locks[axis]===true));
   button.textContent=axis.toUpperCase()+(locks[axis]===true?' bloqueado':' libre');
  }
  $('anchorScaleY').checked=picked.anchorScaleY===true;
 }
 if(!editable){
  for(const id of ['prefabX','prefabZ','prefabOffsetY','prefabRotation','prefabRotationX','prefabRotationZ'])$(id).disabled=true;
 }
 vertexEditor?.updateInfo();
 $('pending').textContent=pending?'Primer punto fijado: selecciona el segundo':'';
 sceneObjectManager?.render();
}
// Persistent topology display is independent of the active editor tool.
function updateMeshInspection(){
 const editing=mode==='meshEdit'&&!testingScene&&live.nodes.some(n=>n.id===selectedId&&n.kind==='prefab');
 const showTerrain=live.settings?.terrainMeshVisible===true&&!testingScene;
 if(vertexEditor){
  if(vertexEditor.getState().active!==editing)vertexEditor.setActive(editing);
  else vertexEditor.updateInfo();
 }
 if(terrainInspector){
  if(terrainInspector.getState().active!==showTerrain)terrainInspector.setActive(showTerrain);
  else terrainInspector.refresh();
 }
 objectMeshOverlays?.refresh({skipId:editing?selectedId:null,testingScene});
 $('terrainMeshControls').hidden=!terrainPropertiesSelected;
}
$('objectMeshToggle').addEventListener('click',()=>{
 if(selectedId!==null)commitObjectMeshVisibility([selectedId],!live.nodes.find(n=>n.id===selectedId)?.editorMeshVisible);
});
$('modelVertexEditToggle').addEventListener('click',()=>{
 const node=live.nodes.find(n=>n.id===selectedId&&n.kind==='prefab');
 if(!node){toast('Selecciona un modelo GLB para editar vértices');return}
 if(mode==='holePaint'){toast('Sal del Cuchillo para editar vértices');return}
 setMode(mode==='meshEdit'?'move':'meshEdit');
});
for(const layer of ['Faces','Edges','Vertices','Xray']){
 $('model'+layer).addEventListener('change',()=>{
  const node=live.nodes.find(n=>n.id===selectedId&&n.kind==='prefab');
  if(!node)return;
  const key=layer.toLowerCase();
  const layers=normalizedMeshLayers(node.editorMeshLayers);
  if(layers[key]===$('model'+layer).checked)return;
  snapshot();node.editorMeshLayers={...layers,[key]:$('model'+layer).checked};
  draw();persist();
 });
}
function setMode(v){
 if(v!=='prefab'&&armedPrefabId)clearPlacement();
 if(v==='holePaint'){
  if(dragSession)completeModelDrag({pointerId:dragSession.pointerId});
  pointerDown=false;marqueeStart=null;
  $('selectionMarquee').style.display='none';
  selectedIds.clear();selectedId=null;
  hoveredNodeId=null;updateHoverHighlight();
  $('modelHoverIndicator').style.display='none';
  updateSelectionHighlights();
 }
 mode=v;pending=null;
 cursor.visible=v!=='holePaint'&&v!=='meshEdit'&&!placementGhost;
 updateMeshInspection();
 if(v!=='holePaint')holesEditor?.hoverAt(null);
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===v));
 $('openPrefabGallery').classList.toggle('active',v==='prefab');
 updateStatus();
}
const tools={raise:1,lower:1,flatten:1,smooth:1};
// Alt + clic derecho: horizontal cambia radio, vertical cambia intensidad.
// Captura el puntero antes de OrbitControls, selección y esculpido.
let brushGesture=null;
const radiusInput=$('brushRadius'),strengthInput=$('strength'),brushHint=$('brushGestureHint');
function updateBrushReadouts(){
 $('brushRadiusValue').textContent=Number(radiusInput.value).toFixed(1).replace(/\.0$/,'');
 $('brushStrengthValue').textContent=String(Number(strengthInput.value));
}
radiusInput.addEventListener('input',updateBrushReadouts);
strengthInput.addEventListener('input',updateBrushReadouts);
updateBrushReadouts();
function brushAdjustValue(input,value){
 const min=Number(input.min)||0,max=Number(input.max)||100,step=Number(input.step)||1;
 const next=Math.min(max,Math.max(min,Math.round((value-min)/step)*step+min));
 input.value=String(Number(next.toFixed(3)));
 input.dispatchEvent(new Event('input',{bubbles:true}));
}
function updateBrushGesture(e){
 if(!brushGesture||e.pointerId!==brushGesture.pointerId)return;
 brushAdjustValue(radiusInput,brushGesture.radius+(e.clientX-brushGesture.x)*.14);
 brushAdjustValue(strengthInput,brushGesture.strength+(brushGesture.y-e.clientY)*.13);
 cursor.scale.setScalar(Number(radiusInput.value));
 brushHint.hidden=false;brushHint.style.left=e.clientX+'px';brushHint.style.top=e.clientY+'px';
 brushHint.textContent='Radio '+$('brushRadiusValue').textContent+' · Intensidad '+$('brushStrengthValue').textContent;
}
function finishBrushGesture(e){
 if(!brushGesture||e?.pointerId!==undefined&&e.pointerId!==brushGesture.pointerId)return;
 const id=brushGesture.pointerId;
 brushGesture=null;brushHint.hidden=true;
 try{if(view.hasPointerCapture?.(id))view.releasePointerCapture(id)}catch(_){}
}
view.addEventListener('pointerdown',e=>{
 if(!e.altKey||e.button!==2||e.ctrlKey||!tools[mode]||preview.active||preview.busy)return;
 e.preventDefault();e.stopImmediatePropagation();
 brushGesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,radius:Number(radiusInput.value),strength:Number(strengthInput.value)};
 try{view.setPointerCapture(e.pointerId)}catch(_){}
 updateBrushGesture(e);
},true);
view.addEventListener('pointermove',e=>{
 if(!brushGesture||e.pointerId!==brushGesture.pointerId)return;
 e.preventDefault();e.stopImmediatePropagation();
 updateBrushGesture(e);
},true);
window.addEventListener('pointerup',finishBrushGesture,true);
window.addEventListener('pointercancel',finishBrushGesture,true);
window.addEventListener('blur',()=>finishBrushGesture());
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
if(mode==='holePaint')return holesEditor?.pick(ray)||null;
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
if(n.editorHidden||n.editorIntangible)continue;
let dd=Infinity;
if(n.x!==undefined)dd=Math.hypot(x-n.x,z-n.z);
else if(n.a&&n.b){const a=resolvePoint(n.a),b=resolvePoint(n.b),vx=b.x-a.x,vz=b.z-a.z,len=vx*vx+vz*vz;const t=len?clamp(((x-a.x)*vx+(z-a.z)*vz)/len,0,1):0;dd=Math.hypot(x-(a.x+vx*t),z-(a.z+vz*t))}
if(dd<d){d=dd;best=n}}
 if(best&&d<Math.max(16,best.kind==='prefab'?34:16)){
  if(mode==='delete'){snapshot();live.nodes=live.nodes.filter(n=>n.id!==best.id);pruneUnusedSceneGroups();selectedIds.delete(best.id);selectedId=null;draw();persist()}
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
 addNode({kind:'prefab',prefabId,x,z,rotation:0,scale:1,offsetY:0,
  ...(isFreeCave(prefabId)?{y:Number.isFinite(placementWorldY)?placementWorldY:heightAt(x,z)}:{})});
 clearPlacement();setMode('move');
 $('prefabChosen').textContent='Modelo colocado · Selecciónalo y arrástralo, o abre la galería para colocar otro';
}else if(['tree','wallspawn','spawn','exit','anchor'].includes(mode))addNode({kind:mode,x,z});
}
function resize(){
const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h,false);
if(camera.isOrthographicCamera){const aspect=w/h;camera.left=-viewSpan*aspect/2;camera.right=viewSpan*aspect/2;camera.top=viewSpan/2;camera.bottom=-viewSpan/2}
else camera.aspect=w/h;camera.updateProjectionMatrix();
}
let viewSpan=DEFAULT_3D_CAMERA.viewSpan;
function setTop(){
 camera.position.set(0,950,.01);camera.up.set(0,0,-1);
 orbit.target.set(0,0,0);camera.lookAt(0,0,0);
 orbit.enableRotate=false;orbit.update();resize();
 $('viewType').textContent='Vista cenital';
}
function setDefault3D(){
 camera.up.fromArray(DEFAULT_3D_CAMERA.up);
 camera.position.fromArray(DEFAULT_3D_CAMERA.position);
 orbit.target.fromArray(DEFAULT_3D_CAMERA.target);
 camera.lookAt(orbit.target);
 orbit.enableRotate=true;orbit.update();resize();
 $('viewType').textContent='Vista 3D';
}
// No saved view: start at the same angled 3D view as the existing Vista 3D button.
setDefault3D();
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
window.addEventListener('wildtrap:workspace-tool',event=>{
 if(event.detail?.key==='structures')prefabGallery.open();
 else prefabGallery.close();
});
if(window.__workspaceLayout?.getState().workspace==='structures')prefabGallery.open();
$('openPrefabGallery').onclick=()=>prefabGallery.open();
holesEditor=createTerrainHoles({
 scene,terrainGeo,terrain,live,heightAt,refreshTerrain,snapshot,persist,toast,$,
 terrainIsIntangible:()=>live.settings?.terrainIntangible===true,
 getModelRoots:()=>[...renderedNodes].flatMap(([id,roots])=>
  live.nodes.find(n=>n.id===id&&!n.editorHidden&&!n.editorIntangible)?
   roots.filter(root=>root.userData.sharedAsset).map(root=>({id,root})):[]),
 renderCuts:!recoveryMode,nextUndoSerial
});
terrainInspector=createTerrainMeshInspector({scene,camera,view,terrain,$,
 isSelected:()=>terrainPropertiesSelected});
window.__terrainMeshInspector=terrainInspector;
const preview=createPlaytest({scene,renderer,view,orbit,terrain,cursor,live,heightAt,$,
 resizeEditor:resize,isHoleAt:(x,y,z)=>holesEditor.isHoleAt(x,z,y),
 onStop:()=>{
  testingScene=false;draw();updateMeshInspection();
 }
});
vertexEditor=createMeshVertexEditor({
 scene,camera,view,marquee:$('selectionMarquee'),$,
 getSelectedNode:()=>live.nodes.find(n=>n.id===selectedId),
 getRoot:id=>(renderedNodes.get(id)||[]).find(root=>root.userData.sharedAsset),
 getMode:()=>mode,snapshot,draw,persist,toast
});
window.__meshEditor=vertexEditor;
objectMeshOverlays=createObjectMeshOverlays({
 getNodes:()=>live.nodes,getRoots:id=>renderedNodes.get(id)||[]
});
window.__objectMeshOverlays=objectMeshOverlays;
updateMeshInspection();
// XYZ markers are camera controls, independent of an object's XYZ locks.
const axesSvg=$('axisGizmoSvg'),axisViewButtons=[...document.querySelectorAll('[data-view-axis]')];
let axisTick=0;
function snapCameraToAxis(axis){
 if(preview.active||preview.busy)return;
 const direction={
  x:new THREE.Vector3(1,0,0),
  y:new THREE.Vector3(0,1,0),
  z:new THREE.Vector3(0,0,1)
 }[axis];
 if(!direction)return;
 const focus=orbit.target.clone();
 const selected=live.nodes.find(n=>n.id===selectedId);
 if(selected){
  const root=(renderedNodes.get(selected.id)||[]).find(n=>n.userData?.sharedAsset);
  if(root){
   root.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(root);
   if(!bounds.isEmpty())bounds.getCenter(focus);
   else focus.set(selected.x||0,prefabWorldY(selected,heightAt),selected.z||0);
  }else if(Number.isFinite(selected.x)&&Number.isFinite(selected.z)){
   focus.set(selected.x,selected.kind==='prefab'?prefabWorldY(selected,heightAt):heightAt(selected.x,selected.z),selected.z);
  }
 }
 const distance=Math.max(60,camera.position.distanceTo(orbit.target));
 camera.up.set(0,axis==='y'?0:1,axis==='y'?-1:0);
 orbit.target.copy(focus);
 camera.position.copy(focus).addScaledVector(direction,distance);
 const previousDamping=orbit.enableDamping;
 orbit.enableDamping=false;
 orbit.enableRotate=axis!=='y';
 camera.lookAt(focus);
 orbit.update();
 orbit.enableDamping=previousDamping;
 camera.updateMatrixWorld(true);
 $('viewType').textContent=axis==='y'?'Vista superior Y':axis==='x'?'Vista lateral X':'Vista frontal Z';
 refreshAxisGizmo();
}
function refreshAxisGizmo(){
 const inverse=camera.quaternion.clone().invert();
 const directionToCamera=camera.position.clone().sub(orbit.target).normalize();
 const directions=[
  {v:new THREE.Vector3(1,0,0),name:'X',color:'#ff7777'},
  {v:new THREE.Vector3(0,1,0),name:'Y',color:'#7ff4a4'},
  {v:new THREE.Vector3(0,0,1),name:'Z',color:'#78b7ff'}
 ];
 const width=axesSvg.clientWidth||112,height=axesSvg.clientHeight||110;
 const size=width<100?24:30;
 const lines=directions.map(axis=>{
  const worldAxis=axis.v.clone(),v=axis.v.applyQuaternion(inverse);
  const x=56+v.x*37,y=56-v.y*37;
  const button=axisViewButtons.find(b=>b.dataset.viewAxis===axis.name.toLowerCase());
  if(button){
   button.style.left=(x*width/112-size/2).toFixed(2)+'px';
   button.style.top=(y*height/110-size/2).toFixed(2)+'px';
   button.setAttribute('aria-pressed',String(directionToCamera.dot(worldAxis)>.9999));
  }
  return '<line x1="56" y1="56" x2="'+x.toFixed(2)+'" y2="'+y.toFixed(2)+'" stroke="'+axis.color+'" stroke-width="3.4" stroke-linecap="round"/>'+
   '<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="9" fill="'+axis.color+'"/>'+
   '<text x="'+x.toFixed(2)+'" y="'+(y+4).toFixed(2)+'" font-size="12" text-anchor="middle" fill="#132b24" font-weight="bold">'+axis.name+'</text>';
 }).join('');
 axesSvg.innerHTML='<circle cx="56" cy="56" r="3" fill="#effff6"/>'+lines;
}
for(const button of axisViewButtons)
 button.addEventListener('click',()=>snapCameraToAxis(button.dataset.viewAxis));
window.__axisView={snap:snapCameraToAxis,state:()=>({
 position:camera.position.toArray(),target:orbit.target.toArray(),up:camera.up.toArray(),
 view:$('viewType').textContent,enableRotate:orbit.enableRotate
})};
refreshAxisGizmo();
// Persist the editor camera separately from the large world JSON so a simple
// camera movement is not lost when reloading before a full autosave finishes.
let cameraReadyToSave=false,cameraSaveTimer=null,cameraDraftTimer=null;
function currentEditorCamera(){
 return normalizeEditorCameraState({
  position:camera.position.toArray(),
  target:orbit.target.toArray(),
  up:camera.up.toArray(),
  viewSpan,zoom:camera.zoom,enableRotate:orbit.enableRotate,
  label:$('viewType').textContent
 });
}
function flushCameraSave(){
 if(!cameraReadyToSave||testingScene||preview.active||preview.busy)return;
 if(cameraSaveTimer!==null){clearTimeout(cameraSaveTimer);cameraSaveTimer=null}
 const state=currentEditorCamera();
 if(!state)return;
 live.editorCamera=state;
 // A tiny, mode-scoped write happens before the debounced full scene write.
 try{localStorage.setItem(cameraKey,JSON.stringify(state))}
 catch(_){/* The full draft/export remains a fallback when storage is full. */}
 // Camera-only full-draft writes use their OWN timer and never call
 // persist(), which would postpone an unrelated terrain/object edit.
 if(cameraDraftTimer!==null)clearTimeout(cameraDraftTimer);
 cameraDraftTimer=setTimeout(()=>{
  cameraDraftTimer=null;
  try{localStorage.setItem(draftKey,JSON.stringify(live))}catch(_){
   // The tiny camera key was already committed above.
  }
 },680);
}
function scheduleCameraSave(){
 if(!cameraReadyToSave||testingScene||preview.active||preview.busy)return;
 if(cameraSaveTimer!==null)clearTimeout(cameraSaveTimer);
 cameraSaveTimer=setTimeout(flushCameraSave,520);
}
function restoreEditorCamera(raw,{remember=false}={}){
 const state=normalizeEditorCameraState(raw);
 if(!state)return false;
 const wasReady=cameraReadyToSave;
 cameraReadyToSave=false;
 const previousDamping=orbit.enableDamping;
 orbit.enableDamping=false;
 camera.position.fromArray(state.position);
 camera.up.fromArray(state.up);
 orbit.target.fromArray(state.target);
 camera.zoom=state.zoom;
 orbit.enableRotate=state.enableRotate;
 viewSpan=state.viewSpan;
 camera.lookAt(orbit.target);
 resize();
 orbit.update();
 orbit.enableDamping=previousDamping;
 $('viewType').textContent=state.label;
 camera.updateMatrixWorld(true);
 cameraReadyToSave=wasReady;
 if(remember&&wasReady)flushCameraSave();
 return true;
}
function updateCameraLabel(){
 const label=$('viewType').textContent;
 const axis=label==='Vista lateral X'?'x':label==='Vista superior Y'?'y':
  label==='Vista frontal Z'?'z':null;
 if(axis){
  const direction=camera.position.clone().sub(orbit.target).normalize();
  const axisVector=axis==='x'?new THREE.Vector3(1,0,0):
   axis==='y'?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
  if(direction.dot(axisVector)<.9995)$('viewType').textContent='Vista 3D';
 }
}
orbit.addEventListener('change',()=>{
 if(!cameraReadyToSave||testingScene||preview.active||preview.busy)return;
 updateCameraLabel();
 scheduleCameraSave();
});
// Pagehide and tab switching commit the last camera even after a short gesture.
window.addEventListener('pagehide',()=>{
 if(cameraReadyToSave)flushCameraSave();
 // On a rapid reload, commit a pending terrain/object edit synchronously too.
 if(saveTimer!==null||cameraDraftTimer!==null){
  if(saveTimer!==null)clearTimeout(saveTimer);
  if(cameraDraftTimer!==null)clearTimeout(cameraDraftTimer);
  saveTimer=null;cameraDraftTimer=null;
  try{localStorage.setItem(draftKey,JSON.stringify(live))}catch(_){}
 }
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&cameraReadyToSave)flushCameraSave();
});
window.__editorCamera={
 getState:currentEditorCamera,
 restore:state=>restoreEditorCamera(state,{remember:true}),
 flush:flushCameraSave
};
$('test').onclick=()=>{
 testingScene=true;vertexEditor.setActive(false);terrainInspector.setActive(false);draw();
 void preview.start().then(()=>{
  if(!preview.active){testingScene=false;draw();updateMeshInspection();}
 });
};
$('createHole').onclick=()=>{holesEditor.apply(true);draw()};
$('restoreHole').onclick=()=>{holesEditor.apply(false);draw()};
$('clearHoleSelection').onclick=()=>holesEditor.clearSelection();
$('undoHolePoint').onclick=()=>holesEditor.removeLastPoint();
$('closeHoleContour').onclick=()=>holesEditor.closePolygon();
$('stopTest').onclick=()=>preview.stop();
$('localFarolera').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)preview.fromFile(file);e.target.value=''});
function setNodeSelection(ids){
 terrainPropertiesSelected=false;
 selectedIds.clear();
 for(const id of ids)if(live.nodes.some(n=>n.id===id))selectedIds.add(id);
 selectedId=[...selectedIds].at(-1)??null;
 if(mode==='meshEdit'&&!live.nodes.some(n=>n.id===selectedId&&n.kind==='prefab'))setMode('move');
 updateSelectionHighlights();updateStatus();updateMeshInspection();
 if(mode==='meshEdit')vertexEditor?.rebuild();
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
   if(node&&!node.editorHidden&&!node.editorIntangible)return node;
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
   if(node&&!node.editorHidden&&!node.editorIntangible)return node;
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
  if(live.nodes.find(n=>n.id===id)?.editorHidden||live.nodes.find(n=>n.id===id)?.editorIntangible)continue;
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
// Vertex picking owns the left button while Ver malla is active.
view.addEventListener('pointerdown',e=>{
 if(preview.active||preview.busy||e.button!==0)return;
 if(mode==='meshEdit')vertexEditor?.pointerdown(e);
 else if(terrainPropertiesSelected&&live.settings?.terrainMeshVisible&&mode!=='holePaint'){
  if(terrainInspector?.inspect(e)){e.preventDefault();e.stopImmediatePropagation()}
 }
},true);
view.addEventListener('pointermove',e=>{
 if(mode==='meshEdit')vertexEditor?.pointermove(e);
},true);
window.addEventListener('pointerup',e=>{
 if(mode==='meshEdit')vertexEditor?.pointerup(e);
},true);
let previousOrbitEnabled=true;
view.addEventListener('pointerdown',e=>{
 if(preview.active||preview.busy||mode==='holePaint'||mode==='meshEdit'||!e.ctrlKey||(e.button!==0&&e.button!==2))return;
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
view.addEventListener('contextmenu',e=>{if(e.ctrlKey||marqueeStart||brushGesture||e.altKey&&tools[mode])e.preventDefault()});
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
 const freeCave=node.kind==='prefab'&&isFreeCave(node.prefabId);
 // A free-cave drag does not intersect terrain on pointerdown OR pointermove.
 const ground=freeCave?null:(convertCoords(e)||{x:node.x||0,z:node.z||0});
 const screenRight=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
 const screenUp=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
 const bounds=view.getBoundingClientRect();
 const horizontalUnits=camera.isOrthographicCamera?
  Math.max(.04,(camera.right-camera.left)/Math.max(.01,camera.zoom)/Math.max(1,bounds.width)):
  Math.max(.04,2*camera.position.distanceTo(orbit.target)*
   Math.tan(THREE.MathUtils.degToRad(camera.fov||50)/2)*camera.aspect/Math.max(1,bounds.width));
 dragSession={
  pointerId:e.pointerId,
  startX:e.clientX,startY:e.clientY,
  ground:ground?{x:ground.x,z:ground.z}:null,
  screenRight:{x:screenRight.x,z:screenRight.z},
  screenUp:{x:screenUp.x,z:screenUp.z},
  horizontalUnits,verticalUnits:Math.max(.05,Math.min(.8,horizontalUnits*.45)),
  action:e.altKey&&e.shiftKey&&freeCave?'height':
   e.altKey&&node.kind==='prefab'?'rotate':
   e.shiftKey&&node.kind==='prefab'?'scale':
   freeCave?(cavePlaneModifierDown?'plane':'free'):'move',
  nodes:[...selectedIds].map(id=>live.nodes.find(n=>n.id===id)).filter(Boolean).map(n=>{
   const original=structuredClone(n);
   if(n.kind==='prefab'&&isFreeCave(n.prefabId))original.y=prefabWorldY(n,heightAt);
   const root=(renderedNodes.get(n.id)||[])[0];
   const box=root?new THREE.Box3().setFromObject(root):null;
   return {id:n.id,original,bottomY:box&&!box.isEmpty()?box.min.y:null};
  }),
  changed:false
 };
 try{view.setPointerCapture(e.pointerId)}catch(_){}
 view.style.cursor=dragSession.action==='height'||dragSession.action==='scale'?'ns-resize':dragSession.action==='rotate'?'crosshair':'grabbing';
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
   root.position.set(n.x,prefabWorldY(n,heightAt)+(Number(n.scaleAnchorOffsetY)||0),n.z);
   root.rotation.set(n.rotationX||0,n.rotation||0,n.rotationZ||0,'YXZ');
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
 if(session.action==='height'){
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id);
   if(n?.kind==='prefab'&&isFreeCave(n.prefabId)&&n.rotationLocks?.y!==true)
    n.y=altitudeFromVerticalDrag(item.original.y,session.startY,e.clientY);
  }
 }else if(session.action==='scale'){
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id);
   if(n?.kind==='prefab')n.scale=scaleFromVerticalDrag(item.original.scale||1,session.startY,e.clientY);
  }
 }else if(session.action==='rotate'){
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id);
   if(n?.kind!=='prefab')continue;
   const rotation=constrainedRotation(
    {x:item.original.rotationX||0,y:item.original.rotation||0,z:item.original.rotationZ||0},
    e.clientX-session.startX,session.startY-e.clientY,n.rotationLocks||{});
   n.rotation=rotation.y;n.rotationX=rotation.x;n.rotationZ=rotation.z;
  }
 }else if(session.action==='free'||session.action==='plane'){
  // Move cave in absolute world space; no terrain collider or ray projection.
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id),orig=item.original;
   if(!n)continue;
   const cave=n.kind==='prefab'&&isFreeCave(n.prefabId);
   const baseY=cave?orig.y:heightAt(orig.x||0,orig.z||0);
   const translated=freeCaveFromScreenDrag({...orig,y:baseY},
    session.startX,session.startY,e.clientX,e.clientY,
    session.screenRight,session.screenUp,
    session.horizontalUnits,session.verticalUnits,SIZE,
    session.action==='plane');
   if(!translated)continue;
   const constrained=constrainTranslationAxes(orig,translated,n.rotationLocks);
   n.x=constrained.x;n.z=constrained.z;
   if(cave)n.y=constrained.y;
  }
 }else{
  const p=convertCoords(e);
  if(!p)return;
  const dx=p.x-session.ground.x,dz=p.z-session.ground.z;
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id),orig=item.original;
   if(!n)continue;
   const translated=translateNodeOnTerrain(orig,dx,dz,SIZE),locks=n.rotationLocks||{};
   if(Number.isFinite(translated.x)&&locks.x!==true)n.x=translated.x;
   if(Number.isFinite(translated.z)&&locks.z!==true)n.z=translated.z;
   // Migrar una cueva antigua a Y absoluta en el primer arrastre;
   // nunca dejar que otra pendiente la vuelva a pegar al terreno.
   if(n.kind==='prefab'&&isFreeCave(n.prefabId))n.y=orig.y;
  }
 }
 updateMovedPrefabs();
 if(session.action==='free'||session.action==='plane'){
  const moved=live.nodes.find(n=>n.id===session.nodes[0]?.id);
  if(moved?.kind==='prefab')
   $('coords').textContent='X '+moved.x.toFixed(1)+' · Z '+moved.z.toFixed(1)+
    ' · altura Y '+prefabWorldY(moved,heightAt).toFixed(1);
 }
 if(session.action==='scale'){
  for(const item of session.nodes){
   const n=live.nodes.find(x=>x.id===item.id);
   if(n?.kind!=='prefab'||n.anchorScaleY!==true||!Number.isFinite(item.bottomY))continue;
   const root=(renderedNodes.get(n.id)||[]).find(x=>x.userData.sharedAsset);
   if(!root)continue;
   const box=new THREE.Box3().setFromObject(root);
   if(box.isEmpty())continue;
   const delta=item.bottomY-box.min.y;
   if(Math.abs(delta)>.000001){
    n.scaleAnchorOffsetY=(Number(n.scaleAnchorOffsetY)||0)+delta;
    root.position.y+=delta;root.updateMatrixWorld(true);
   }
  }
  updateSelectionHighlights();
 }
 view.style.cursor=session.action==='height'||session.action==='scale'?'ns-resize':session.action==='rotate'?'crosshair':'grabbing';
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
 if(preview.active||preview.busy||marqueeStart||prefabGallery.isBlocking()||mode==='meshEdit'||e.ctrlKey||e.button!==0)return;
 if(mode==='holePaint'){
  // Each click adds one corner; dragging does not create triangles.
  const hit=convertCoords(e);
  if(!hit)return;
  e.preventDefault();
  pointerDown=false;
  holesEditor.addPoint(hit,[e.clientX,e.clientY]);
  return;
 }
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
 if(tools[mode]){
  snapshot();brush(p.x,p.z);changed=true;
 }else if(mode==='move'){
  setNodeSelection([]);setHoverNode(null,e);
 }else act(p);
});
view.addEventListener('pointermove',e=>{
 if(preview.active||preview.busy||prefabGallery.isBlocking()||marqueeStart||mode==='meshEdit')return;
 if(dragSession){moveModelDrag(e);return}
 const holeMode=mode==='holePaint';
 // No GLB selection or hover in cutting mode: only the cutter raycast runs.
 if(holeMode){
  if(hoveredNodeId!==null){hoveredNodeId=null;updateHoverHighlight();}
  $('modelHoverIndicator').style.display='none';
  view.style.cursor='crosshair';
 }else{
  const hovered=pickedNodeAt(e);
  setHoverNode(hovered,e);
 }
 const p=convertCoords(e);
 if(!p){if(holeMode)holesEditor.hoverAt(null);updatePlacementAt(null);return}
 $('coords').textContent='X '+p.x.toFixed(1)+' · Z '+p.z.toFixed(1)+' · altura '+heightAt(p.x,p.z).toFixed(1);
 if(armedPrefabId&&mode==='prefab'){updatePlacementAt(p);return}
 if(holeMode){
  cursor.visible=false; // No circular brush cursor.
  holesEditor.hoverAt(p,[e.clientX,e.clientY]);
  return;
 }
 cursor.position.set(p.x,p.y+.3,p.z);
 cursor.rotation.set(-Math.PI/2,0,0);
 cursor.scale.setScalar(tools[mode]?Number($('brushRadius').value):4);
 if(pointerDown&&tools[mode])brush(p.x,p.z);
});
view.addEventListener('pointerleave',e=>{
 if(!dragSession){setHoverNode(null,e);updatePlacementAt(null);holesEditor?.hoverAt(null)}
});
window.addEventListener('pointerup',e=>{
 completeModelDrag(e);
 pointerDown=false;holesEditor.endStroke();moveBases=null;dragId=null;
});
view.addEventListener('wheel',e=>{
 if(isFreeCave(armedPrefabId)&&mode==='prefab'&&e.altKey){
  e.preventDefault();
  const p=convertCoords(e);
  if(!Number.isFinite(placementWorldY)){
   if(!p)return;
   placementWorldY=heightAt(p.x,p.z);
  }
  const unitsPerDelta=e.deltaMode===1?1.5:e.deltaMode===2?12:.10;
  placementWorldY-=e.deltaY*unitsPerDelta;
  if(p)updatePlacementAt(p);
  return;
 }
 if(!camera.isOrthographicCamera)return;
 e.preventDefault();viewSpan=clamp(viewSpan*Math.exp(e.deltaY*.001),80,1400);resize();scheduleCameraSave()
},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.tool)));
$('top').onclick=()=>{setTop();scheduleCameraSave()};
$('angle').onclick=()=>{setDefault3D();scheduleCameraSave()};
$('reset').onclick=()=>{if(!confirm('¿Vaciar el editor y el terreno?'))return;snapshot();live.heights.fill(0);live.nodes=[];live.objectGroups=[];live.holes=[];live.cuts3d=[];live.nextId=1;selectedIds.clear();selectedId=null;holesEditor.clearSelection();refreshTerrain();draw();persist()};
$('undo').onclick=()=>{
 // Deshace la última acción entre los vértices pendientes y el historial
 // persistente, incluso si el usuario cambió de herramienta.
 if(holesEditor?.pendingUndoSerial()>(undoSerials.at(-1)||0)){
  holesEditor.undoPending();return;
 }
 const data=undo.pop();if(!data)return;
 undoSerials.pop();
 // During mesh editing, preserve the selected object and its vertex workspace
 // while reverting only the latest geometry/lock change.
 const meshSelection=mode==='meshEdit'?[...selectedIds]:[];
 const v=JSON.parse(data);Object.assign(live,v);
 if(!Array.isArray(live.holes))live.holes=[];
 if(!Array.isArray(v.cuts3d))live.cuts3d=[];
 live.objectGroups=cleanObjectGroups(v.objectGroups);
 selectedIds.clear();
 for(const id of meshSelection)if(live.nodes.some(n=>n.id===id))selectedIds.add(id);
 selectedId=[...selectedIds].at(-1)??null;
 if(holesEditor.pendingUndoSerial()<0)holesEditor.clearSelection();
 refreshTerrain();draw();persist();
};
$('prefabType').addEventListener('change',()=>{if(mode==='prefab')updateStatus()});
for(const btn of document.querySelectorAll('[data-rotation-lock]')){
 btn.addEventListener('click',()=>{
  const n=live.nodes.find(x=>x.id===selectedId&&x.kind==='prefab');
  if(!n)return;
  const axis=btn.dataset.rotationLock;
  snapshot();n.rotationLocks={...n.rotationLocks,[axis]:n.rotationLocks?.[axis]!==true};
  updateStatus();persist();
 });
}
$('snapCaveToTerrain').addEventListener('click',()=>{
 const node=live.nodes.find(n=>n.id===selectedId&&n.kind==='prefab'&&isFreeCave(n.prefabId));
 if(!node){toast('Selecciona una cueva para igualar su altura al terreno');return}
 if(node.rotationLocks?.y===true){toast('Desbloquea Y para ajustar la altura de la cueva');return}
 const targetY=heightAt(node.x,node.z)-(Number(node.scaleAnchorOffsetY)||0);
 if(Math.abs(prefabWorldY(node,heightAt)-targetY)<.00001){toast('La cueva ya está a la altura del terreno');return}
 snapshot();
 node.y=targetY;node.offsetY=0;
 draw();persist();
 toast('Altura igualada al terreno. Puedes mover la cueva libremente después.');
});
$('anchorScaleY').addEventListener('change',e=>{
 const n=live.nodes.find(x=>x.id===selectedId&&x.kind==='prefab');if(!n)return;
 snapshot();n.anchorScaleY=e.target.checked;updateStatus();persist();
});
$('applyPrefab').onclick=()=>{
 const targets=[...selectedIds].map(id=>live.nodes.find(n=>n.id===id)).filter(n=>n?.kind==='prefab');
 if(!targets.length){toast('Selecciona un modelo GLB con Ctrl + clic');return}
 const oldBottoms=new Map();
 for(const n of targets){
  if(n.anchorScaleY!==true)continue;
  const root=(renderedNodes.get(n.id)||[]).find(x=>x.userData.sharedAsset);
  if(root){const b=new THREE.Box3().setFromObject(root);if(!b.isEmpty())oldBottoms.set(n.id,b.min.y)}
 }
 snapshot();
 const primary=targets.find(n=>n.id===selectedId)||targets[0];
 const dx=(Number($('prefabX').value)||0)-primary.x;
 const dz=(Number($('prefabZ').value)||0)-primary.z;
 const rot=(Number($('prefabRotation').value)||0)*Math.PI/180;
 const rotX=(Number($('prefabRotationX').value)||0)*Math.PI/180;
 const rotZ=(Number($('prefabRotationZ').value)||0)*Math.PI/180;
 const rollDelta=rotZ-(primary.rotationZ||0);
 const rotationDelta=rot-(primary.rotation||0);
 const tiltDelta=rotX-(primary.rotationX||0);
 const inputY=Number($('prefabOffsetY').value);
 const heightDelta=isFreeCave(primary.prefabId)&&Number.isFinite(inputY)?
  inputY-(prefabWorldY(primary,heightAt)+(Number(primary.scaleAnchorOffsetY)||0)):0;
 const newScale=clamp(Number($('prefabScale').value)||1,.05,15);
 const scaleRatio=newScale/(primary.scale||1);
 for(const n of targets){
  // Hold a cave's absolute elevation even when the X/Z move crosses a slope.
  const worldY=isFreeCave(n.prefabId)?prefabWorldY(n,heightAt):null;
  const locks=n.rotationLocks||{};
  if(locks.x!==true)n.x=clamp(n.x+dx,-SIZE/2,SIZE/2);
  if(locks.z!==true)n.z=clamp(n.z+dz,-SIZE/2,SIZE/2);
  if(locks.y!==true)n.rotation=(n.rotation||0)+rotationDelta;
  if(locks.x!==true)n.rotationX=(n.rotationX||0)+tiltDelta;
  if(locks.z!==true)n.rotationZ=(n.rotationZ||0)+rollDelta;
  if(isFreeCave(n.prefabId)){
   if(locks.y!==true)n.y=worldY+heightDelta;
  }else delete n.y; // A locked Y must NEVER erase a free cave's absolute height.
  n.offsetY=0;
  n.scale=clamp((n.scale||1)*scaleRatio,.05,15);
 }
 draw();
 for(const n of targets){
  if(!oldBottoms.has(n.id))continue;
  const root=(renderedNodes.get(n.id)||[]).find(x=>x.userData.sharedAsset);
  if(!root)continue;
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty())continue;
  const delta=oldBottoms.get(n.id)-box.min.y;
  if(Math.abs(delta)>.000001)n.scaleAnchorOffsetY=(Number(n.scaleAnchorOffsetY)||0)+delta;
 }
 if(oldBottoms.size)draw();
 persist();toast(targets.length+' modelo(s) actualizado(s)');
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
$('removeRecoveryCuts').onclick=()=>{
 if(!recoveryMode)return;
 if(!confirm('¿Quitar los recortes SOLO de la copia de recuperación? El borrador original no se modifica.'))return;
 snapshot();
 live.cuts3d=[];
 for(const node of live.nodes)if(node.cuts3d)node.cuts3d=[];
 holesEditor.clearSelection();refreshTerrain();draw();persist();
 toast('Recortes retirados de la copia. Exporta JSON para recuperar el escenario.');
};
$('remove').onclick=()=>{if(!selectedIds.size)return;snapshot();live.nodes=live.nodes.filter(n=>!selectedIds.has(n.id));pruneUnusedSceneGroups();selectedIds.clear();selectedId=null;draw();persist()};
$('export').onclick=()=>{live.editorCamera=currentEditorCamera();download('wildtrap-escenario.json',new Blob([JSON.stringify(live)],{type:'application/json'}))};
$('importJSON').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const x=JSON.parse(await file.text());if(x.size!==SIZE||x.resolution!==N||!Array.isArray(x.heights)||x.heights.length!==COUNT||!Array.isArray(x.nodes))throw Error('Formato o tamaño incompatible');snapshot();Object.assign(live,x);live.holes=Array.isArray(x.holes)?x.holes:[];live.cuts3d=Array.isArray(x.cuts3d)?x.cuts3d:[];live.objectGroups=cleanObjectGroups(x.objectGroups);live.settings={heightMax:120,...(x.settings&&typeof x.settings==='object'?x.settings:{})};selectedIds.clear();selectedId=null;holesEditor.clearSelection();
updateMaxHeightControl();refreshTerrain();draw();
if(!restoreEditorCamera(x.editorCamera,{remember:true}))flushCameraSave();
persist();toast('Proyecto cargado')}catch(err){toast('No se pudo cargar: '+err.message)}e.target.value=''});
function download(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function toast(msg){$('toast').textContent=msg;setTimeout(()=>{if($('toast').textContent===msg)$('toast').textContent=''},4500)}
window.addEventListener('keydown',e=>{if(preview.active||preview.busy)return;if(e.target.matches('input,textarea'))return;
if(e.key==='Escape'){
 if(mode==='holePaint'){holesEditor.clearSelection();e.preventDefault();return;}
 pending=null;setNodeSelection([]);setMode('move');
}
if(mode==='holePaint'&&(e.key==='Backspace'||e.key==='Delete')){
 e.preventDefault();holesEditor.removeLastPoint();return;
}
if(e.key==='Delete'&&mode!=='meshEdit')$('remove').click();
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
  live.objectGroups=[];
  live.settings={heightMax:120,...(data.settings&&typeof data.settings==='object'?data.settings:{})};
  live.version=3;
  selectedIds.clear();selectedId=null;
  holesEditor.clearSelection();updateMaxHeightControl();
  live.editorCamera=currentEditorCamera();
  refreshTerrain();draw();persist();
  toast('Terreno base original recuperado · 630 × 630');
 }catch(error){toast('No se pudo abrir terreno base: '+error.message)}
}
$('restoreBase').onclick=()=>restoreSavedBase(true);
let recoveredDraft=false;
try{
 const saved=localStorage.getItem(draftKey)||
  (recoveryMode?localStorage.getItem('wildtrap-editor-draft-v1'):null);
 if(saved){
  const d=JSON.parse(saved);
  if(d.size===SIZE&&d.resolution===N&&d.heights?.length===COUNT&&Array.isArray(d.nodes)){
   Object.assign(live,d);live.holes=Array.isArray(d.holes)?d.holes:[];live.cuts3d=Array.isArray(d.cuts3d)?d.cuts3d:[];live.objectGroups=cleanObjectGroups(d.objectGroups);
   live.settings={heightMax:120,...(d.settings&&typeof d.settings==='object'?d.settings:{})};
   recoveredDraft=true;
   toast('Proyecto recuperado del guardado automático; puedes usar Cargar terreno base');
  }
 }
}catch(e){toast('No se pudo recuperar el proyecto local')}
// Prefer the small camera record (flushed on pagehide) over an older camera
// included in the world draft; invalid legacy records fall back to 3D.
let lastCamera=null;
try{lastCamera=JSON.parse(localStorage.getItem(cameraKey)||'null')}catch(_){}
const cameraRestored=restoreEditorCamera(lastCamera)||restoreEditorCamera(live.editorCamera);
if(!cameraRestored)$('viewType').textContent='Vista 3D';
cameraReadyToSave=true;
live.editorCamera=currentEditorCamera();
// Completar primero un frame: datos grandes del proyecto no deben impedir
// que desaparezca la pantalla de inicio. La recuperación ocurre después.
async function loadPublishedWorld(){
 try{
  const response=await fetch('./assets/terrain/wildtrap-world.json',{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const world=await response.json();
  if(world.size!==SIZE||world.resolution!==N||world.heights?.length!==COUNT||!Array.isArray(world.nodes))throw Error('Escenario publicado incompatible');
  Object.assign(live,world);
  live.holes=Array.isArray(world.holes)?world.holes:[];
  live.cuts3d=Array.isArray(world.cuts3d)?world.cuts3d:[];
  live.objectGroups=cleanObjectGroups(world.objectGroups);
  live.settings={heightMax:120,...(world.settings&&typeof world.settings==='object'?world.settings:{})};
  selectedIds.clear();selectedId=null;
  // Do not reset the user's last camera merely because the published map loaded.
  if(!restoreEditorCamera(world.editorCamera,{remember:true}))
   live.editorCamera=currentEditorCamera();
  updateMaxHeightControl();refreshTerrain();draw();persist();
  toast('Escenario oficial cargado desde el repositorio');
 }catch(err){console.warn('No se pudo cargar mapa oficial',err);void restoreSavedBase(false)}
}
$('loadPublished').onclick=()=>{if(confirm('¿Abrir el mapa publicado en GitHub? El proyecto local será reemplazado. Exporta JSON antes si necesitas conservarlo.')){snapshot();void loadPublishedWorld()}};
function animate(){requestAnimationFrame(animate);if(!preview.active)orbit.update();if(++axisTick%5===0)refreshAxisGizmo();renderer.render(scene,preview.frame()||camera)}
animate();
window.__editorReady?.();
if(safeMode)toast('Modo seguro: el borrador habitual queda intacto. Tus cambios se guardan aparte.');
if(recoveryMode){
 const warning=$('recoveryPanel');
 if(warning)warning.hidden=false;
 toast('Recuperación: recortes suspendidos, borrador original protegido.');
}
// Deferir la carga del escenario deja que Chrome presente la interfaz.
// El código preserva el borrador del usuario y no borra el almacenamiento local.
setTimeout(()=>{
 try{
  updateMaxHeightControl();refreshTerrain();draw();setMode('raise');
  if(!recoveredDraft)void loadPublishedWorld();
 }catch(error){
  console.error('Error al recuperar escenario WILDTRAP:',error);
  $('toast').textContent='Error recuperando el escenario: '+error.message+
   '. Abre el modo seguro para usar el editor sin alterar tu borrador.';
 }
},40);
