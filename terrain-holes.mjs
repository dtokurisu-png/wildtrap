import * as THREE from 'three';
import {prepareCutStamp,isTerrainCutAt,buildAdaptiveTerrain} from './adaptive-terrain-cuts.mjs?v=0.9.13';

// The knife uses clicks, not a brush. Original surfaces remain raycastable
// even after cutting, so a closed polygon can restore an older hole.
export function createTerrainHoles({scene,terrainGeo,terrain,live,heightAt,refreshTerrain,snapshot,persist,toast,$,getModelRoots=()=>[],terrainIsIntangible=()=>false,renderCuts=true,nextUndoSerial=()=>0}){
 const originalMesh=new THREE.Mesh(terrainGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 originalMesh.name='Base heightmap for accurate 3D raycast';
 originalMesh.updateMatrixWorld(true); // Not added to scene or visible in renderer.
 const selected=[]; // Exactly one prepared polygon per operation.
 const anchors=[]; // Clicked world-space corners; no mouse interpolation.
 const pendingHistory=[]; // Undo history lives only until a cut is committed/cancelled.
 function rememberPending(){
  pendingHistory.push({
   serial:nextUndoSerial(),
   anchors:anchors.map(a=>({...a,position:a.position.slice(),normal:a.normal.slice(),screen:a.screen?.slice()||null})),
   closed,
   selected:structuredClone(selected)
  });
  if(pendingHistory.length>64)pendingHistory.shift();
 }
 function pendingUndoSerial(){return pendingHistory.at(-1)?.serial??-1;}
 function undoPending(){
  const previous=pendingHistory.pop();
  if(!previous)return false;
  anchors.splice(0,anchors.length,...previous.anchors);
  selected.splice(0,selected.length,...previous.selected);
  closed=previous.closed;hover=null;renderSelection();
  return true;
 }
 let closed=false,hover=null,prepared=[],legacy=new Set(),generated=null;
 const overlay=new THREE.Group();
 overlay.name='Polygon knife · vertices and edges';
 overlay.userData.editorOnly=true;overlay.renderOrder=16;overlay.frustumCulled=false;
 const edges=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
  color:0xffc477,transparent:true,opacity:1,depthTest:false,depthWrite:false
 }));
 const corners=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({
  color:0xfff4ad,size:9,sizeAttenuation:false,depthTest:false,depthWrite:false
 }));
 const fill=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({
  color:0xffc477,transparent:true,opacity:.24,depthTest:false,depthWrite:false,
  side:THREE.DoubleSide
 }));
 edges.renderOrder=18;corners.renderOrder=19;fill.renderOrder=17;
 overlay.add(fill,edges,corners);scene.add(overlay);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const vec=(a)=>new THREE.Vector3(...a);
 function pick(ray){
  // Compare the ORIGINAL terrain and ORIGINAL GLB surfaces by real camera depth.
  // Once a hole is cut, the invisible source faces remain available to restore it.
  let nearest=null;
  const record=(h,modelNodeId=null)=>{
   if(!h?.face||nearest&&nearest.distance<=h.distance)return;
   const normal=h.face.normal.clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
   if(ray.ray.direction.dot(normal)>0)normal.negate();
   nearest={distance:h.distance,x:h.point.x,y:h.point.y,z:h.point.z,
    normal:normal.toArray(),modelNodeId};
  };
  originalMesh.updateMatrixWorld(true);
  if(terrain.visible&&!terrainIsIntangible())record(ray.intersectObject(originalMesh,false)[0]);
  const materialSides=new Map();
  for(const entry of getModelRoots()){
   const root=entry.root;
   if(!root||!root.visible)continue;
   root.updateMatrixWorld(true);
   root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isSkinnedMesh||!mesh.visible)return;
    const displayGeometry=mesh.geometry;
    const sourceGeometry=mesh.userData.wildtrapSourceGeometry||displayGeometry;
    mesh.geometry=sourceGeometry;
    try{
     for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(material&&!materialSides.has(material))materialSides.set(material,material.side);
      if(material)material.side=THREE.DoubleSide;
     }
     record(ray.intersectObject(mesh,false)[0],entry.id);
    }finally{
     mesh.geometry=displayGeometry;
    }
   });
  }
  for(const [material,side] of materialSides)material.side=side;
  if(!nearest)return null;
  const {distance,...hit}=nearest;
  return hit;
 }
 function syncGeometry(){
  if(!renderCuts){
   // Recovery view: keep every cut in live JSON, but do not tessellate it.
   legacy=new Set();prepared=[];
   if(generated){generated.dispose();generated=null}
   terrain.geometry=terrainGeo;
   $('holeMeshStats').textContent='RECUPERACIÓN: recortes conservados en datos, renderizado suspendido';
   $('holeCounter').textContent=(live.cuts3d?.length||0)+' cortes terreno guardados · '+
    live.nodes.reduce((n,node)=>n+(node.cuts3d?.length||0),0)+' cortes GLB guardados';
   renderSelection();return;
  }
  const n=live.resolution;
  legacy=new Set((live.holes||[]).filter(x=>Number.isInteger(x)&&x>=0&&x<(n-1)*(n-1)));
  prepared=(Array.isArray(live.cuts3d)?live.cuts3d:[]).map(prepareCutStamp).filter(Boolean);
  const attrs=terrainGeo.attributes;
  const result=buildAdaptiveTerrain({
    positions:attrs.position.array,colors:attrs.color.array,
    normals:attrs.normal.array,uvs:attrs.uv.array,indices:terrainGeo.index.array
  },[...legacy],live.cuts3d||[],live.size,n);
  let replacement=terrainGeo;
  if(result){
   replacement=new THREE.BufferGeometry();
   replacement.setAttribute('position',new THREE.Float32BufferAttribute(result.positions,3));
   replacement.setAttribute('normal',new THREE.Float32BufferAttribute(result.normals,3));
   replacement.setAttribute('uv',new THREE.Float32BufferAttribute(result.uvs,2));
   replacement.setAttribute('color',new THREE.Float32BufferAttribute(result.colors,3));
   replacement.setIndex(result.indices);
   replacement.computeBoundingSphere();
   replacement.computeBoundingBox();
   if($('holeMeshStats'))$('holeMeshStats').textContent=
     'Triángulos originales '+result.stats.originalTriangles+
     ' · actuales '+result.stats.finalTriangles+
     ' · vértices nuevos '+result.stats.newVertices+
    (result.stats.incomplete?' · ⚠ LÍMITE: algunas caras no se han cortado ('+
      result.stats.limitedFragments+' grupos de fragmentos)':'');
  }else if($('holeMeshStats'))$('holeMeshStats').textContent='Malla base sin recortes adicionales';
  const old=generated;
  terrain.geometry=replacement;
  generated=result?replacement:null;
  if(old&&old!==replacement)old.dispose();
  $('holeCounter').textContent=(legacy.size)+' celdas antiguas · '+prepared.filter(s=>s.op==='cut').length+' cortes 3D · '+prepared.filter(s=>s.op==='restore').length+' restauraciones · '+live.nodes.reduce((sum,node)=>sum+(node.cuts3d?.length||0),0)+' trazos GLB';
  renderSelection();
 }
 function isHoleAt(x,z,y=heightAt(x,z)){
  return isTerrainCutAt(x,y,z,legacy,prepared,live.size,live.resolution);
 }

 // Same tangent basis as the geometry engine. The click positions are kept intact
 // in the preview; their projected 2D outline defines a precise prism in the mesh.
 function basisFromPositions(points,normals){
  const expected=new THREE.Vector3();
  for(const n of normals)expected.add(n);
  if(expected.lengthSq()<1e-9)expected.set(0,1,0);
  expected.normalize();
  const normal=new THREE.Vector3();
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length];
   normal.x+=(a.y-b.y)*(a.z+b.z);
   normal.y+=(a.z-b.z)*(a.x+b.x);
   normal.z+=(a.x-b.x)*(a.y+b.y);
  }
  if(normal.lengthSq()<1e-9)normal.copy(expected);
  normal.normalize();
  if(normal.dot(expected)<0)normal.negate();
  const u=Math.abs(normal.y)>.95?new THREE.Vector3(1,0,0):
   new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal).normalize();
  const v=new THREE.Vector3().crossVectors(normal,u).normalize();
  return {normal,u,v};
 }
 function shapeFor(points,normals){
  const {normal,u,v}=basisFromPositions(points,normals);
  const center=points[0];
  const polygon=points.map(p=>{
   const relative=p.clone().sub(center);
   return [relative.dot(u),relative.dot(v)];
  });
  return {center:center.toArray(),normal:normal.toArray(),shape:'polygon',
   polygon,depth:clamp(Number($('holeDepth')?.value)||2,.25,20)};
 }
 function selectedStamp(){
  if(anchors.length<3)return null;
  const points=anchors.map(p=>vec(p.position));
  const normals=anchors.map(p=>vec(p.normal));
  const worldPreview=shapeFor(points,normals);
  if(!prepareCutStamp(worldPreview))return null;
  const modelNodeId=anchors[0].modelNodeId;
  if(modelNodeId===null)return {...worldPreview,worldPreview};
  const root=getModelRoots().find(entry=>entry.id===modelNodeId)?.root;
  if(!root)return null;
  root.updateMatrixWorld(true);
  const localPoints=points.map(p=>root.worldToLocal(p.clone()));
  const localNormals=points.map((p,i)=>root.worldToLocal(p.clone().add(normals[i]))
   .sub(root.worldToLocal(p.clone())).normalize());
  const local=shapeFor(localPoints,localNormals);
  const scale=root.getWorldScale(new THREE.Vector3());
  const factor=Math.max(.01,Math.min(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)));
  local.depth=clamp(worldPreview.depth/factor,.25,20);
  if(!prepareCutStamp(local))return null;
  return {...local,modelNodeId,worldPreview};
 }
 function setGeometry(mesh,vertices){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const old=mesh.geometry;mesh.geometry=geometry;old.dispose();
 }
 function renderSelection(){
  const lines=[],dots=[],triangles=[];
  const first=anchors[0];
  const offsetPoint=p=>vec(p.position).addScaledVector(vec(p.normal),.15).toArray();
  const pushSegment=(a,b)=>lines.push(...a,...b);
  for(const a of anchors)dots.push(...offsetPoint(a));
  for(let i=1;i<anchors.length;i++)pushSegment(offsetPoint(anchors[i-1]),offsetPoint(anchors[i]));
  if(closed&&anchors.length>=3)pushSegment(offsetPoint(anchors.at(-1)),offsetPoint(first));
  if(!closed&&anchors.length&&hover&&hover.modelNodeId===first.modelNodeId){
   let target=hover;
   // Preview closing edge when near the initial corner.
   if(hover.screen&&first.screen&&anchors.length>=3&&
    Math.hypot(hover.screen[0]-first.screen[0],hover.screen[1]-first.screen[1])<14)target=first;
   pushSegment(offsetPoint(anchors.at(-1)),offsetPoint(target));
  }
  if(closed&&selected[0]){
   const s=prepareCutStamp(selected[0].worldPreview||selected[0]);
   if(s){
    const origin=vec(s.center).addScaledVector(vec(s.normal),.10);
    const u=vec(s.u),v=vec(s.v);
    const p=s.polygon.map(p=>new THREE.Vector2(p[0],p[1]));
    const faces=THREE.ShapeUtils.triangulateShape(p,[]);
    for(const face of faces)for(const i of face){
     triangles.push(...origin.clone().addScaledVector(u,p[i].x).addScaledVector(v,p[i].y).toArray());
    }
   }
  }
  setGeometry(edges,lines);setGeometry(corners,dots);setGeometry(fill,triangles);
  fill.visible=triangles.length>0;
  overlay.visible=anchors.length>0;
  $('holeSelectionCount').textContent=closed?
   'Contorno cerrado · '+anchors.length+' vértices · listo para cortar':
   anchors.length+' vértices · '+(anchors.length?'haz clic en el primero para cerrar':'clic para iniciar el contorno');
  $('createHole').disabled=!closed;
  $('restoreHole').disabled=!closed;
  $('undoHolePoint').disabled=!anchors.length;
  $('closeHoleContour').disabled=closed||anchors.length<3;
 }
 function addPoint(hit,screen){
  if(!hit||!Array.isArray(hit.normal)||closed)return;
  const id=Number.isInteger(hit.modelNodeId)?hit.modelNodeId:null;
  if(anchors.length&&anchors[0].modelNodeId!==id){
   toast('Continúa sobre la misma malla o reinicia el contorno.');return;
  }
  if(anchors.length>=3&&screen&&anchors[0].screen&&
   Math.hypot(screen[0]-anchors[0].screen[0],screen[1]-anchors[0].screen[1])<14){
   closePolygon();return;
  }
  if(anchors.length>=48){toast('Máximo 48 puntos por contorno');return;}
  const position=[hit.x,hit.y,hit.z];
  if(anchors.length){
   const last=anchors.at(-1).position;
   if(Math.hypot(...position.map((v,i)=>v-last[i]))<.05)return;
  }
  rememberPending();
  anchors.push({position,normal:hit.normal.slice(),modelNodeId:id,screen:screen||null});
  hover=null;renderSelection();
 }
 function hoverAt(hit,screen){
  hover=hit&&Array.isArray(hit.normal)?
   {position:[hit.x,hit.y,hit.z],normal:hit.normal.slice(),
    modelNodeId:Number.isInteger(hit.modelNodeId)?hit.modelNodeId:null,screen:screen||null}:null;
  if(anchors.length&&!closed)renderSelection();
 }
 function closePolygon(){
  if(closed||anchors.length<3){toast('Coloca al menos tres puntos para cerrar el contorno');return false;}
  const stamp=selectedStamp();
  if(!stamp){toast('Contorno inválido: evita líneas cruzadas, puntos repetidos o una forma sin área');return false;}
  rememberPending();
  selected.splice(0,selected.length,stamp);
  closed=true;hover=null;renderSelection();return true;
 }
 function removeLastPoint(){
  if(!anchors.length)return;
  rememberPending();
  if(closed){closed=false;selected.length=0;}
  anchors.pop();hover=null;renderSelection();
 }
 function clearSelection(){
  anchors.length=0;selected.length=0;pendingHistory.length=0;closed=false;hover=null;renderSelection();
 }
 function endStroke(){} // Pointer release does not change a click-based knife.
 // Measure the REAL displayed triangle surface, not the uncut source
 // used by cutter picking. This prevents reporting success on an empty hole.
 function meshSurfaceArea(positions,indices){
  let total=0;
  for(let i=0;i<indices.length;i+=3){
   const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
   const x1=positions[b]-positions[a],y1=positions[b+1]-positions[a+1],z1=positions[b+2]-positions[a+2];
   const x2=positions[c]-positions[a],y2=positions[c+1]-positions[a+1],z2=positions[c+2]-positions[a+2];
   total+=.5*Math.hypot(y1*z2-z1*y2,z1*x2-x1*z2,x1*y2-y1*x2);
  }
  return total;
 }
 function validateTerrainChange(pendingStamps,cut){
  const current=terrain.geometry,attrs=terrainGeo.attributes;
  const result=buildAdaptiveTerrain({
   positions:attrs.position.array,colors:attrs.color.array,
   normals:attrs.normal.array,uvs:attrs.uv.array,indices:terrainGeo.index.array
  },[...legacy],[...(live.cuts3d||[]),...pendingStamps],live.size,live.resolution);
  if(!result){toast('El recorte no encontró ninguna cara del terreno.');return false}
  if(result.stats.incomplete){
   toast('Corte cancelado: la geometría superó el límite de fragmentos. No se guardó un agujero incompleto.');
   return false;
  }
  const before=meshSurfaceArea(current.attributes.position.array,current.index.array);
  const after=meshSurfaceArea(result.positions,result.indices);
  const change=(cut?before-after:after-before);
  if(change<.0001){
   toast(cut?'No se recortó ninguna cara nueva: la zona ya está vacía o el prisma no atraviesa la pared. Prueba mayor profundidad o revisa la malla.':
    'No se restauró ninguna cara: la región ya estaba completa o el contorno no alcanza el terreno.');
   return false;
  }
  return true;
 }
 function apply(cut){
  if(!renderCuts){toast('Recortes suspendidos en recuperación: primero guarda una copia del escenario.');return}
  if(!closed||selected.length!==1){toast('Primero cierra el contorno del cuchillo');return}
  const perModel=new Map();
  let terrainCount=0;
  for(const stamp of selected){
   if(Number.isInteger(stamp.modelNodeId)){
    const node=live.nodes.find(n=>n.id===stamp.modelNodeId&&n.kind==='prefab');
    if(!node)continue;
    perModel.set(node.id,(perModel.get(node.id)||0)+1);
   }else terrainCount++;
  }
  if(terrainCount){
   const pending=selected.filter(stamp=>!Number.isInteger(stamp.modelNodeId)).map(stamp=>{
    const {modelNodeId,worldPreview,...data}=stamp;
    return {...data,op:cut?'cut':'restore'};
   });
   if(!validateTerrainChange(pending,cut))return;
  }
  if((live.cuts3d?.length||0)+terrainCount>700||
   [...perModel].some(([id,n])=>n+(live.nodes.find(node=>node.id===id)?.cuts3d?.length||0)>80)){
   toast('Límite: 700 cortes de terreno o 80 trazos por modelo. Aplica cortes más grandes.');
   return;
  }
  snapshot();
  if(!Array.isArray(live.cuts3d))live.cuts3d=[];
  let terrainChanged=false,modelChanged=false,applied=0;
  for(const s of selected){
   const {modelNodeId,worldPreview,...cutData}=s;
   cutData.op=cut?'cut':'restore';
   if(Number.isInteger(modelNodeId)){
    const node=live.nodes.find(n=>n.id===modelNodeId&&n.kind==='prefab');
    if(!node)continue;
    if(!Array.isArray(node.cuts3d))node.cuts3d=[];
    node.cuts3d.push(cutData);
    modelChanged=true;
   }else{
    live.cuts3d.push(cutData);
    terrainChanged=true;
   }
   applied++;
  }
  clearSelection();
  if(terrainChanged)refreshTerrain();
  persist();
  toast((cut?'Recorte':'Restauración')+' 3D aplicado: '+applied+
   ' polígono(s)'+(modelChanged?' · mallas GLB actualizadas':''));
 }
 function count(){return legacy.size+prepared.length+live.nodes.reduce((sum,node)=>sum+(node.cuts3d?.length||0),0)}
 return {pick,addPoint,hoverAt,closePolygon,removeLastPoint,endStroke,clearSelection,apply,syncGeometry,isHoleAt,count,overlay,undoPending,pendingUndoSerial};
}
