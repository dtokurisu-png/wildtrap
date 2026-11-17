import * as THREE from 'three';

// Viewer for the ACTUAL triangulated arena, not the uncut base heightfield.
// The visible geometry changes after each cut; all overlays are rebuilt only
// when terrain.geometry changes. Nothing here changes the saved scenario.
export function createTerrainMeshInspector({scene,camera,view,terrain,$,isSelected=()=>false}){
 const overlay=new THREE.Group();
 overlay.name='WILDTRAP Terrain mesh X-ray inspection';
 overlay.userData.editorOnly=true;
 scene.add(overlay);
 const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();
 let active=false,source=null,visuals=[],faceVisuals=[],statistics={};
 const controls=$('terrainMeshControls');
 if(!controls)throw Error('Falta el panel de la malla del terreno');
 const setInfo=(message)=>{$('terrainFaceInfo').textContent=message};
 const own=(object,geometry=null,material=null,target=visuals)=>{
  object.userData.editorOnly=true;
  object.raycast=()=>{}; // never consume the cutter's raycasting
  overlay.add(object);target.push({object,geometry,material});
  return object;
 };
 function release(items){
  for(const entry of items){
   entry.object.parent?.remove(entry.object);
   entry.geometry?.dispose();
   entry.material?.dispose();
  }
  items.length=0;
 }
 function display(){
  controls.hidden=!isSelected();
  overlay.visible=active&&terrain.visible;
  if(!active)return;
  const xray=$('terrainXray').checked;
  for(const {object} of visuals){
   const kind=object.userData.terrainLayer;
   object.visible=kind==='faces'?$('terrainFaces').checked:
    (kind==='edges'||kind==='cliffEdges')?$('terrainEdges').checked:
    kind==='vertices'?$('terrainVertices').checked:true;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   for(const material of materials)if(material){
    material.depthTest=!xray;material.depthWrite=false;material.needsUpdate=true;
   }
  }
 }
 function refresh(force=false){
  display();
  if(!active){release(faceVisuals);release(visuals);source=null;return}
  if(!terrain.visible){
   setInfo('El terreno está oculto. Activa el ojo de Escenario · Terreno para inspeccionarlo.');
   return;
  }
  const geometry=terrain.geometry;
  if(!force&&source===geometry)return;
  release(faceVisuals);release(visuals);
  source=geometry;
  const position=geometry.getAttribute('position');
  const indices=geometry.index?.array;
  if(!position||!indices||!indices.length){
   statistics={triangles:0,vertices:0,activeVertices:0};
   $('terrainMeshStats').textContent='La arena no tiene caras visibles';
   setInfo('No hay triángulos visibles que inspeccionar.');
   return;
  }
  const used=new Set(indices);
  const total=used.size;
  const sampleStep=Math.max(1,Math.ceil(total/26000));
  const dots=[];
  let count=0;
  for(const id of used){
   if(count++%sampleStep)continue;
   dots.push(position.getX(id),position.getY(id),position.getZ(id));
  }
  const faces=own(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
   color:0x7ceecb,transparent:true,opacity:.14,side:THREE.DoubleSide,
   depthWrite:false,depthTest:false
  })),null,null);
  // Shared BufferGeometry is NEVER owned or disposed by this overlay.
  faces.userData.terrainLayer='faces';
  faces.renderOrder=8;
  // Record ownership of MATERIAL only (geometry belongs to editor).
  visuals.at(-1).material=faces.material;
  const wireGeometry=new THREE.WireframeGeometry(geometry);
  const wireMaterial=new THREE.LineBasicMaterial({
   color:0x27ffe1,transparent:true,opacity:.73,depthTest:false,depthWrite:false
  });
  const edges=own(new THREE.LineSegments(wireGeometry,wireMaterial),wireGeometry,wireMaterial);
  edges.userData.terrainLayer='edges';edges.renderOrder=10;edges.frustumCulled=false;
  const dotGeometry=new THREE.BufferGeometry();
  dotGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));
  const dotMaterial=new THREE.PointsMaterial({color:0xffcf66,size:3.5,sizeAttenuation:false,
   depthTest:false,depthWrite:false});
  const points=own(new THREE.Points(dotGeometry,dotMaterial),dotGeometry,dotMaterial);
  points.userData.terrainLayer='vertices';points.renderOrder=11;points.frustumCulled=false;
  // The user's original grid stays unchanged: the actual generated cliff
  // subdivisions live in a SEPARATE mesh. Display those triangles alongside
  // the original mesh, otherwise the inspector misleadingly looks unchanged.
  const cliffRoot=getCliffOverlay();
  let cliffFaces=0,cliffSource=0,cliffMeshes=0;
  for(const mesh of cliffRoot?.children||[]){
   if(!mesh.isMesh||!mesh.geometry?.getAttribute('position'))continue;
   const tri=mesh.geometry.index?
    mesh.geometry.index.count/3:mesh.geometry.getAttribute('position').count/3;
   cliffFaces+=tri;
   cliffSource+=Number(mesh.userData.sourceTriangles)||0;
   cliffMeshes++;
   const lines=new THREE.WireframeGeometry(mesh.geometry);
   const mat=new THREE.LineBasicMaterial({
    color:0xffba66,transparent:true,opacity:.75,depthTest:false,depthWrite:false
   });
   const viewLines=own(new THREE.LineSegments(lines,mat),lines,mat);
   viewLines.userData.terrainLayer='cliffEdges';
   viewLines.renderOrder=12;viewLines.frustumCulled=false;
  }
  statistics={triangles:indices.length/3,vertices:position.count,activeVertices:total,
   drawnVertices:dots.length/3};

  $('terrainMeshStats').textContent=
   statistics.triangles.toLocaleString('es')+' caras triangulares · '+
   total.toLocaleString('es')+' vértices activos · '+
   (dots.length/3).toLocaleString('es')+' dibujados · '+
   Math.max(0,position.count-total).toLocaleString('es')+' vértices sin caras'+
   (cliffSource?' · ACANTILADOS '+cliffSource.toLocaleString('es')+' → '+
    cliffFaces.toLocaleString('es')+' triángulos (x'+(cliffFaces/cliffSource).toFixed(1)+')':'');
  setInfo('Vista de la geometría original del terreno.');
  display();
 }
 function highlightFace(hit){
  release(faceVisuals);
  
  const geo=hit.object.geometry,pos=geo.getAttribute('position'),indices=geo.index?.array;
  const offset=hit.faceIndex*3;
  if(offset<0||offset+2>=(indices?.length||pos.count))return;
  const ids=indices?[indices[offset],indices[offset+1],indices[offset+2]]:
   [offset,offset+1,offset+2];
  const normal=hit.face.normal.clone().normalize();
  const corners=ids.map(id=>new THREE.Vector3(
   pos.getX(id),pos.getY(id),pos.getZ(id)).addScaledVector(normal,.06));
  const fillGeo=new THREE.BufferGeometry();
  fillGeo.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(p=>p.toArray()),3));
  const fillMat=new THREE.MeshBasicMaterial({color:0xffd277,transparent:true,opacity:.48,
   side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  const face=own(new THREE.Mesh(fillGeo,fillMat),fillGeo,fillMat,faceVisuals);face.renderOrder=15;
  const linesGeo=new THREE.BufferGeometry();
  linesGeo.setAttribute('position',new THREE.Float32BufferAttribute([
   ...corners[0].toArray(),...corners[1].toArray(),
   ...corners[1].toArray(),...corners[2].toArray(),
   ...corners[2].toArray(),...corners[0].toArray()],3));
  const linesMat=new THREE.LineBasicMaterial({color:0xffa732,
   depthTest:false,depthWrite:false});
  const lines=own(new THREE.LineSegments(linesGeo,linesMat),linesGeo,linesMat,faceVisuals);
  lines.renderOrder=16;
  const p=hit.point;
  setInfo('Malla de terreno · cara #'+hit.faceIndex+' · triángulo XYZ '+ids.join(', ')+' · X '+p.x.toFixed(2)+' / Y '+p.y.toFixed(2)+' / Z '+p.z.toFixed(2));
 }
 function inspect(event){
  if(!active||!terrain.visible||event.button!==0)return false;
  const bounds=view.getBoundingClientRect();
  ndc.set((event.clientX-bounds.left)/bounds.width*2-1,
   -(event.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(ndc,camera);
  terrain.updateMatrixWorld(true);
  const hit=raycaster.intersectObject(terrain,false)[0];
  if(hit)highlightFace(hit);
  else{
   release(faceVisuals);
   setInfo('No hay caras de terreno aquí. Gira la cámara para inspeccionar la superficie.');
  }
  return true;
 }
 function setActive(next){
  active=Boolean(next);
  if(!active){release(faceVisuals);release(visuals);source=null}
  refresh();
 }
 for(const id of ['terrainFaces','terrainEdges','terrainVertices','terrainXray'])
  $(id).addEventListener('change',display);
 display();
 return {setActive,refresh,inspect,getState:()=>({active,...statistics,
  visible:overlay.visible,drawn:visuals.length}),
  dispose:()=>{setActive(false);scene.remove(overlay)}};
}
