import * as THREE from 'three';

// WILDTRAP: editable, reversible perforations in the original heightmap.
// A hole removes *real terrain triangles*, not just their collision flag.
export function createTerrainHoles({scene,terrainGeo,live,heightAt,refreshTerrain,snapshot,persist,toast,$}){
 const N=live.resolution,side=N-1,step=live.size/side,origin=-live.size/2;
 const original=Array.from(terrainGeo.index.array);
 const selected=new Set();
 let currentHoles=new Set();
 const overlayMaterial=new THREE.MeshBasicMaterial({
  color:0xffcf68,transparent:true,opacity:.43,depthWrite:false,
  side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2
 });
 const overlay=new THREE.Mesh(new THREE.BufferGeometry(),overlayMaterial);
 overlay.name='Selection of real terrain holes';
 overlay.userData.editorOnly=true;overlay.renderOrder=15;overlay.frustumCulled=false;
 scene.add(overlay);
 const cellIndex=(i,j)=>j*side+i;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const valid=(i,j)=>i>=0&&j>=0&&i<side&&j<side;
 const setOfHoles=()=>new Set(Array.isArray(live.holes)?live.holes.filter(n=>Number.isInteger(n)&&n>=0&&n<side*side):[]);
 function isHoleAt(x,z){
  if(x<origin||z<origin||x>=-origin||z>=-origin)return false;
  const i=clamp(Math.floor((x-origin)/step),0,side-1);
  const j=clamp(Math.floor((z-origin)/step),0,side-1);
  return currentHoles.has(cellIndex(i,j));
 }
 function syncGeometry(){
  currentHoles=setOfHoles();
  const removed=currentHoles,buffer=[];
  for(let id=0;id<side*side;id++){
   if(removed.has(id))continue;
   const begin=id*6;
   for(let k=0;k<6;k++)buffer.push(original[begin+k]);
  }
  terrainGeo.setIndex(buffer);
  terrainGeo.computeVertexNormals();
  terrainGeo.computeBoundingSphere();
  overlay.visible=selected.size>0;
  $('holeCounter').textContent=removed.size+' celdas perforadas';
 }
 function renderSelection(){
  const verts=[];
  const vertex=(i,j)=>{
   const x=origin+i*step,z=origin+j*step;
   return [x,heightAt(x,z)+.35,z];
  };
  for(const id of selected){
   const j=Math.floor(id/side),i=id%side;
   const a=vertex(i,j),b=vertex(i,j+1),c=vertex(i+1,j+1),d=vertex(i+1,j);
   verts.push(...a,...b,...d,...b,...c,...d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  overlay.geometry.dispose();overlay.geometry=geometry;
  overlay.visible=selected.size>0;
  $('holeSelectionCount').textContent=selected.size+' celdas seleccionadas';
 }
 function paint(x,z,remove=false){
  const radius=Number($('brushRadius').value);
  const shape=$('holeShape').value,dir=$('holeDirection').value;
  const ix=clamp(Math.floor((x-origin)/step),0,side-1),iz=clamp(Math.floor((z-origin)/step),0,side-1);
  const reach=Math.ceil(radius/step)+1;
  let changed=false;
  for(let j=Math.max(0,iz-reach);j<=Math.min(side-1,iz+reach);j++){
   for(let i=Math.max(0,ix-reach);i<=Math.min(side-1,ix+reach);i++){
    const dx=origin+(i+.5)*step-x,dz=origin+(j+.5)*step-z;
    const inside=(shape==='rectangle'?Math.max(Math.abs(dx),Math.abs(dz))<=radius:
      Math.hypot(dx,dz)<=radius);
    if(!inside)continue;
    if(shape==='semicircle'&&(
      (dir==='east'&&dx<0)||(dir==='west'&&dx>0)||
      (dir==='north'&&dz>0)||(dir==='south'&&dz<0)))continue;
    const id=cellIndex(i,j);
    if(remove){if(selected.delete(id))changed=true}
    else if(!selected.has(id)){selected.add(id);changed=true}
   }
  }
  if(changed)renderSelection();
 }
 function clearSelection(){selected.clear();renderSelection()}
 function apply(cut){
  if(!selected.size){toast('Primero pinta una zona del terreno');return}
  const holes=setOfHoles();
  snapshot();
  for(const id of selected){if(cut)holes.add(id);else holes.delete(id)}
  live.holes=[...holes].sort((a,b)=>a-b);
  clearSelection();refreshTerrain();persist();
  toast(cut?'Agujero real creado en la malla':'Malla restaurada en la selección');
 }
 // The editor can also restore a hole by directly painting the existing cells.
 function selectExistingAt(x,z){
  const i=clamp(Math.floor((x-origin)/step),0,side-1);
  const j=clamp(Math.floor((z-origin)/step),0,side-1);
  const id=cellIndex(i,j);
  if(currentHoles.has(id)){selected.add(id);renderSelection()}
 }
 function count(){return (live.holes||[]).length}
 return {paint,clearSelection,apply,syncGeometry,isHoleAt,selectExistingAt,count,overlay};
}
