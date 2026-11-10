import * as THREE from 'three';
import {prepareCutStamp,isTerrainCutAt,buildAdaptiveTerrain} from './adaptive-terrain-cuts.mjs';

// Selection happens against the uncut mesh: we can also restore a hole by
// painting where the surface USED TO BE. The sculptor remains heightmap-based.
export function createTerrainHoles({scene,terrainGeo,terrain,live,heightAt,refreshTerrain,snapshot,persist,toast,$}){
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
  // Raycast against the ORIGINAL mesh, including areas already cut away.
  const hits=ray.intersectObject(originalMesh,false);
  if(!hits.length)return null;
  const h=hits[0],normal=h.face.normal.clone().normalize();
  if(ray.ray.direction.dot(normal)>0)normal.negate();
  return {x:h.point.x,y:h.point.y,z:h.point.z,normal:normal.toArray()};
 }
 function syncGeometry(){
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
  $('holeCounter').textContent=(legacy.size)+' celdas antiguas · '+prepared.filter(s=>s.op==='cut').length+' cortes 3D · '+prepared.filter(s=>s.op==='restore').length+' restauraciones';
  renderSelection();
 }
 function isHoleAt(x,z,y=heightAt(x,z)){
  return isTerrainCutAt(x,y,z,legacy,prepared,live.size,live.resolution);
 }
 function renderSelection(){
  const vertices=[];
  for(const input of selected){
   const s=prepareCutStamp(input);
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
  const radius=clamp(Number($('brushRadius').value)||4,.4,65);
  if(remove){
   const n=selected.length;
   for(let i=selected.length-1;i>=0;i--){
    const p=selected[i].center;
    if(Math.hypot(position[0]-p[0],position[1]-p[1],position[2]-p[2])<=radius)selected.splice(i,1);
   }
   previous=null;
   if(n!==selected.length)renderSelection();
   return;
  }
  const depth=clamp(Number($('holeDepth')?.value)||2,.25,20);
  const shape=$('holeShape').value,dir=$('holeDirection').value;
  const minGap=Math.max(.6,radius*.33);
  const last=previous;
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
   const s={center,normal,radius,depth,shape,dir};
   if(prepareCutStamp(s))selected.push(s);
  }
  if(count<steps)toast('Selección completa: aplica el corte y continúa con otra pasada');
  const tail=selected[selected.length-1];
  previous=tail?{center:tail.center.slice(),normal:tail.normal.slice()}:last;
  if(count)renderSelection();
 }
 function clearSelection(){selected.length=0;previous=null;renderSelection()}
 function endStroke(){previous=null}
 function apply(cut){
  if(!selected.length){toast('Primero pinta una zona directamente sobre la superficie 3D');return}
  if((live.cuts3d?.length||0)+selected.length>700){toast('Límite de 700 trazos. Exporta el proyecto y reduce cortes superpuestos.');return}
  snapshot();
  if(!Array.isArray(live.cuts3d))live.cuts3d=[];
  for(const s of selected)live.cuts3d.push({...s,op:cut?'cut':'restore'});
  const count=selected.length;
  clearSelection();
  refreshTerrain();
  persist();
  toast(cut?'Abertura 3D creada con '+count+' secciones locales':'Región de la malla restaurada con '+count+' secciones locales');
 }
 function count(){return legacy.size+prepared.length}
 return {pick,paint,endStroke,clearSelection,apply,syncGeometry,isHoleAt,count,overlay};
}
