import * as THREE from 'three';
import {prepareCutStamp,isTerrainCutAt,buildAdaptiveTerrain} from './adaptive-terrain-cuts.mjs?v=0.9.5';

// Selection happens against the uncut mesh: we can also restore a hole by
// painting where the surface USED TO BE. The sculptor remains heightmap-based.
export function createTerrainHoles({scene,terrainGeo,terrain,live,heightAt,refreshTerrain,snapshot,persist,toast,$,getModelRoots=()=>[],renderCuts=true}){
 const originalMesh=new THREE.Mesh(terrainGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 originalMesh.name='Base heightmap for accurate 3D raycast';
 originalMesh.updateMatrixWorld(true); // Not added to scene or visible in renderer.
 const selected=[];
 let previous=null,prepared=[],legacy=new Set(),generated=null;
 const overlay=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({
  color:0xffc477,side:THREE.DoubleSide,transparent:true,opacity:.37,
  depthWrite:false,depthTest:false
 }));
 overlay.name='3D cut selection (not whole heightmap cells)';
 overlay.userData.editorOnly=true;overlay.renderOrder=16;overlay.frustumCulled=false;
 scene.add(overlay);
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
  record(ray.intersectObject(originalMesh,false)[0]);
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
     ' · vértices nuevos '+result.stats.newVertices;
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
 function renderSelection(){
  const vertices=[];
  for(const input of selected){
   const s=prepareCutStamp(input.worldPreview||input);
   if(!s)continue;
   const c=vec(s.center),u=vec(s.u),v=vec(s.v),n=vec(s.normal);
   c.addScaledVector(n,.22);
   for(let i=0;i<s.polygon.length;i++){
    const a=s.polygon[i],b=s.polygon[(i+1)%s.polygon.length];
    const pa=c.clone().addScaledVector(u,a[0]).addScaledVector(v,a[1]);
    const pb=c.clone().addScaledVector(u,b[0]).addScaledVector(v,b[1]);
    vertices.push(...c.toArray(),...pa.toArray(),...pb.toArray());
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const old=overlay.geometry;
  overlay.geometry=geometry;old.dispose();
  overlay.visible=selected.length>0;
  $('holeSelectionCount').textContent=selected.length+' trazos 3D seleccionados';
 }
 function paint(hit,remove=false){
  if(!hit||!Array.isArray(hit.normal))return;
  const position=[hit.x,hit.y,hit.z];
  const modelNodeId=Number.isInteger(hit.modelNodeId)?hit.modelNodeId:null;
  const radius=clamp(Number($('brushRadius').value)||4,.4,65);
  if(remove){
   const n=selected.length;
   for(let i=selected.length-1;i>=0;i--){
    const entry=selected[i],p=(entry.worldPreview||entry).center;
    if((entry.modelNodeId??null)===modelNodeId&&Math.hypot(position[0]-p[0],position[1]-p[1],position[2]-p[2])<=radius)selected.splice(i,1);
   }
   previous=null;
   if(n!==selected.length)renderSelection();
   return;
  }
  const depth=clamp(Number($('holeDepth')?.value)||2,.25,20);
  const shape=$('holeShape').value,dir=$('holeDirection').value;
  const minGap=Math.max(.6,radius*.33);
  const last=previous?.modelNodeId===modelNodeId?previous:null;
  const distance=last?Math.hypot(...position.map((x,i)=>x-last.center[i])):Infinity;
  if(last&&distance<minGap)return;
  // Interpolate fast mouse strokes, no gaps between neighbouring brushes.
  const steps=last?Math.max(1,Math.ceil(distance/minGap)):1;
  const count=Math.min(steps,Math.max(0,180-selected.length));
  for(let i=1;i<=count;i++){
   // Never stretch individual brush stamps across a fast mouse movement.
   // When selection is full, leave the remaining distance for a new pass.
   const t=i/steps;
   const center=last?last.center.map((x,k)=>x+(position[k]-x)*t):position.slice();
   const normal=last?last.normal.map((x,k)=>x+(hit.normal[k]-x)*t):hit.normal.slice();
   const worldPreview={center,normal,radius,depth,shape,dir};
   let s=worldPreview;
   if(modelNodeId!==null){
    const root=getModelRoots().find(item=>item.id===modelNodeId)?.root;
    if(!root)continue;
    root.updateMatrixWorld(true);
    const centerVec=vec(center);
    const localPoint=root.worldToLocal(centerVec.clone());
    const localNext=root.worldToLocal(centerVec.clone().add(vec(normal)));
    const localNormal=localNext.sub(localPoint).normalize();
    const rootScale=root.getWorldScale(new THREE.Vector3());
    const factor=Math.max(.01,Math.abs(rootScale.x));
    s={center:localPoint.toArray(),normal:localNormal.toArray(),
     radius:radius/factor,depth:depth/factor,shape,dir,modelNodeId,worldPreview};
   }
   if(prepareCutStamp(s))selected.push(s);
  }
  if(count<steps)toast('Selección completa: aplica el corte y continúa con otra pasada');
  const tail=selected[selected.length-1];
  const world=tail?.worldPreview||tail;
  previous=tail&&((tail.modelNodeId??null)===modelNodeId)?
   {center:world.center.slice(),normal:world.normal.slice(),modelNodeId}:last;
  if(count)renderSelection();
 }
 function clearSelection(){selected.length=0;previous=null;renderSelection()}
 function endStroke(){previous=null}
 function apply(cut){
  if(!renderCuts){toast('Recortes suspendidos en recuperación: primero guarda una copia del escenario.');return}
  if(!selected.length){toast('Primero pinta una zona directamente sobre una superficie 3D');return}
  const perModel=new Map();
  let terrainCount=0;
  for(const stamp of selected){
   if(Number.isInteger(stamp.modelNodeId)){
    const node=live.nodes.find(n=>n.id===stamp.modelNodeId&&n.kind==='prefab');
    if(!node)continue;
    perModel.set(node.id,(perModel.get(node.id)||0)+1);
   }else terrainCount++;
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
   ' trazo(s)'+(modelChanged?' · mallas GLB actualizadas':''));
 }
 function count(){return legacy.size+prepared.length+live.nodes.reduce((sum,node)=>sum+(node.cuts3d?.length||0),0)}
 return {pick,paint,endStroke,clearSelection,apply,syncGeometry,isHoleAt,count,overlay};
}
