import * as THREE from 'three';

// Per-object, editor-only mesh layers. These are never part of saved GLB
// geometry and never participate in cutter picking or object raycasting.
// Each object retains its own visibility flag and face/edge/vertex settings.
export const DEFAULT_MESH_LAYERS=Object.freeze({
 faces:true,edges:true,vertices:true,xray:false
});
export function normalizedMeshLayers(value){
 const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return Object.fromEntries(Object.entries(DEFAULT_MESH_LAYERS).map(([key,def])=>
  [key,typeof input[key]==='boolean'?input[key]:def]));
}
export function createObjectMeshOverlays({getNodes,getRoots}){
 const owned=[];
 const statistics=new Map();
 let skip=null;
 function dispose(){
  for(const record of owned.reverse()){
   if(record.type==='material'){
    if(record.mesh.material===record.display)record.mesh.material=record.original;
    for(const mat of Array.isArray(record.display)?record.display:[record.display])mat?.dispose?.();
   }else{
    record.object.parent?.remove(record.object);
    record.geometry?.dispose?.();
    record.material?.dispose?.();
   }
  }
  owned.length=0;statistics.clear();
 }
 function refresh({skipId=null,testingScene=false}={}){
  if(skip===skipId&&testingScene&&owned.length===0)return;
  dispose();skip=skipId;
  if(testingScene)return;
  for(const node of getNodes()){
   if(!node.editorMeshVisible||node.editorHidden||node.id===skipId)continue;
   const layers=normalizedMeshLayers(node.editorMeshLayers);
   let triangles=0,vertices=0,meshes=0;
   for(const root of getRoots(node.id)||[]){
    if(!root?.visible)continue;
    root.traverse(mesh=>{
     if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.userData.editorOnly||
        !mesh.geometry?.getAttribute('position'))return;
     const source=mesh.geometry;
     const position=source.getAttribute('position');
     const index=source.index;
     meshes++;vertices+=position.count;triangles+=(index?.count||position.count)/3;
     const clone=old=>{
      const mat=old.clone();
      mat.transparent=true;
      mat.opacity=layers.faces?Math.min(.27,old.opacity??1):0;
      mat.depthTest=!layers.xray;mat.depthWrite=false;
      mat.side=THREE.DoubleSide;
      mat.needsUpdate=true;
      return mat;
     };
     const original=mesh.material;
     const displayed=Array.isArray(original)?original.map(clone):clone(original);
     mesh.material=displayed;
     owned.push({type:'material',mesh,original,display:displayed});
     const wireGeometry=new THREE.WireframeGeometry(source);
     const wireMaterial=new THREE.LineBasicMaterial({
      color:0x3dfbd5,transparent:true,opacity:.78,depthTest:!layers.xray,
      depthWrite:false
     });
     const wire=new THREE.LineSegments(wireGeometry,wireMaterial);
     wire.userData.editorOnly=true;wire.userData.meshLayer='edges';
     wire.renderOrder=10;wire.frustumCulled=false;
     wire.visible=layers.edges;wire.raycast=()=>{};
     mesh.add(wire);
     owned.push({type:'geometry',object:wire,geometry:wireGeometry,material:wireMaterial});
     const sampling=Math.max(1,Math.ceil(position.count/26000)),dots=[];
     for(let i=0;i<position.count;i+=sampling)
      dots.push(position.getX(i),position.getY(i),position.getZ(i));
     const pointsGeometry=new THREE.BufferGeometry();
     pointsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));
     const pointsMaterial=new THREE.PointsMaterial({
      color:0xffd17a,size:4,sizeAttenuation:false,
      depthTest:!layers.xray,depthWrite:false
     });
     const points=new THREE.Points(pointsGeometry,pointsMaterial);
     points.userData.editorOnly=true;points.userData.meshLayer='vertices';
     points.renderOrder=11;points.frustumCulled=false;
     points.visible=layers.vertices;points.raycast=()=>{};
     mesh.add(points);
     owned.push({type:'geometry',object:points,geometry:pointsGeometry,material:pointsMaterial});
    });
   }
   statistics.set(node.id,{meshes,vertices,triangles:Math.round(triangles),layers});
  }
 }
 return {refresh,dispose,getState:()=>({
  ids:[...statistics.keys()],
  perObject:[...statistics.entries()].map(([id,state])=>({id,...state})),
  renderedLayers:owned.filter(r=>r.type==='geometry').length
 })};
}
