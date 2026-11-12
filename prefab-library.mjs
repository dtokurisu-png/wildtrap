import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildAdaptiveModel} from './adaptive-model-cuts.mjs?v=0.9.8';
import {applyVertexOperations,cleanVertexOperations} from './mesh-deform.mjs?v=0.9.12';
import {normalizedVertexAnchors,normalAnchorRootPoint,cleanSculptStamps,sculptRootPoints} from './mesh-vertex-freeze.mjs?v=0.9.19';

// WILDTRAP EDITOR: published 3D assets are read-only. Each placement is an
// independent transform, retained in the scenario JSON for the future game.
import {PREFABS,prefabById,isFreeCave,prefabWorldY} from './prefab-catalog.mjs?v=0.9.7';
export {PREFABS,prefabById};
export function createPrefabLibrary(onChange=()=>{}){
 const loader=new GLTFLoader();
 const cache=new Map(),errors=new Map(),pending=new Map();
 function load(id){
  if(cache.has(id))return Promise.resolve(cache.get(id));
  if(pending.has(id))return pending.get(id);
  const entry=prefabById(id);
  if(!entry)return Promise.reject(Error('Modelo no registrado: '+id));
  const url='./assets/terrain/'+encodeURIComponent(entry.file);
  const promise=loader.loadAsync(url).then(gltf=>{
   if(!gltf.scene)throw Error('El GLB no tiene escena');
   cache.set(id,gltf.scene);
   errors.delete(id);
   onChange();return gltf.scene;
  }).catch(err=>{errors.set(id,String(err.message||err));onChange();return null})
    .finally(()=>pending.delete(id));
  pending.set(id,promise);return promise;
 }
 function instance(node,heightAt,{applyCuts=true}={}){
  const entry=prefabById(node.prefabId);
  if(!entry)return null;
  const source=cache.get(entry.id);
  if(!source){if(!pending.has(entry.id)&&!errors.has(entry.id))void load(entry.id);return null;}
  const root=new THREE.Group();
  root.name='GLB '+entry.name+' #'+node.id;
  root.userData={wildtrapNodeId:node.id,prefabId:node.prefabId,sharedAsset:true};
  const model=source.clone(true);model.name=entry.name;
  const native=new THREE.Box3().setFromObject(model);
  const dimensions=native.getSize(new THREE.Vector3());
  const longest=Math.max(dimensions.x,dimensions.y,dimensions.z);
  const unitScale=longest>.00001?entry.span/longest:1;
  model.scale.multiplyScalar(unitScale);
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const ctr=box.getCenter(new THREE.Vector3());
  model.position.x-=ctr.x;model.position.y-=box.min.y;model.position.z-=ctr.z;
  let meshIndex=0;
  model.traverse(child=>{
   if(child.isMesh){
    child.castShadow=true;child.receiveShadow=true;
    if(!child.isSkinnedMesh)child.userData.wildtrapMeshKey=String(meshIndex++);
   }
  });
  root.add(model);
  root.position.set(node.x,prefabWorldY(node,heightAt)+(Number(node.scaleAnchorOffsetY)||0),node.z);
  // YXZ: horizontal yaw around world Y and vertical tilt around local X.
  root.rotation.set(Number(node.rotationX)||0,Number(node.rotation)||0,Number(node.rotationZ)||0,'YXZ');
  root.scale.setScalar(Math.max(.01,Number(node.scale)||1));
  // Every placed model owns only its deformed buffers, never the GLB cache.
  // Apply vertex changes BEFORE polygon cuts; both are replayed after reload.
  const operations=cleanVertexOperations(node.meshScaleOps);
  if(operations.length){
   root.updateMatrixWorld(true);
   const inverseRoot=root.matrixWorld.clone().invert();
   root.traverse(child=>{
    if(!child.isMesh||child.isSkinnedMesh||child.userData.wildtrapMeshKey===undefined)return;
    const meshToRoot=inverseRoot.clone().multiply(child.matrixWorld);
    const rootToMesh=meshToRoot.clone().invert();
    const point=new THREE.Vector3();
    const converted=applyVertexOperations(child.geometry,operations,child.userData.wildtrapMeshKey,
     coords=>point.set(...coords).applyMatrix4(meshToRoot).toArray(),
     coords=>point.set(...coords).applyMatrix4(rootToMesh).toArray());
    if(converted){
     child.geometry=converted;
     child.userData.wildtrapGeneratedDeformGeometry=converted;
    }
   });
  }
  // Sculpt stamps are replayed over this INSTANCE only, in mesh-root
  // coordinates. Locked vertex indices are captured at the stroke time,
  // so a later lock does not undo previously sculpted geometry.
  const sculptStamps=cleanSculptStamps(node.meshSculptOps);
  if(sculptStamps.length){
   root.updateMatrixWorld(true);
   const inverseRoot=root.matrixWorld.clone().invert();
   root.traverse(child=>{
    if(!child.isMesh||child.isSkinnedMesh||child.userData.wildtrapMeshKey===undefined)return;
    const key=child.userData.wildtrapMeshKey,original=child.geometry;
    const attr=original.getAttribute('position');if(!attr)return;
    const meshToRoot=inverseRoot.clone().multiply(child.matrixWorld);
    const rootToMesh=meshToRoot.clone().invert();
    const temp=new THREE.Vector3();
    const points=Array.from({length:attr.count},(_,i)=>
     temp.set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(meshToRoot).toArray());
    const shaped=sculptRootPoints(points,sculptStamps,[],key);
    const converted=original.clone(),out=converted.getAttribute('position');
    for(let i=0;i<shaped.length;i++){
     temp.set(...shaped[i]).applyMatrix4(rootToMesh);
     out.setXYZ(i,temp.x,temp.y,temp.z);
    }
    out.needsUpdate=true;converted.computeVertexNormals();
    converted.computeBoundingSphere();converted.computeBoundingBox();
    child.geometry=converted;
    child.userData.wildtrapGeneratedSculptGeometry=converted;
   });
  }
  // Final vertex constraints counteract transforms on the model root.
  // Normal locks resist scaling but follow whole-object translation/rotation.
  // Total locks are WORLD-space anchors and also resist translation/rotation.
  // Apply before cuts so the cutter sees the actual constrained geometry.
  const vertexAnchors=normalizedVertexAnchors(node.vertexLockAnchors);
  if(Object.keys(vertexAnchors).length){
   root.updateMatrixWorld(true);
   const inverseRoot=root.matrixWorld.clone().invert();
   const currentScale=Math.max(.01,Number(node.scale)||1);
   root.traverse(child=>{
    if(!child.isMesh||child.isSkinnedMesh)return;
    const entries=vertexAnchors[child.userData.wildtrapMeshKey];
    if(!entries)return;
    const original=child.geometry,attr=original.getAttribute('position');
    if(!attr)return;
    const meshToRoot=inverseRoot.clone().multiply(child.matrixWorld);
    const rootToMesh=meshToRoot.clone().invert();
    const worldToMesh=child.matrixWorld.clone().invert();
    const converted=original.clone(),out=converted.getAttribute('position');
    const vec=new THREE.Vector3();let adjusted=0;
    for(const [indexText,anchor] of Object.entries(entries)){
     const index=Number(indexText);
     if(!Number.isInteger(index)||index<0||index>=out.count)continue;
     const local= node.vertexTotalLock===true?
      vec.fromArray(anchor.world).applyMatrix4(worldToMesh):
      vec.fromArray(normalAnchorRootPoint(anchor,currentScale)).applyMatrix4(rootToMesh);
     out.setXYZ(index,local.x,local.y,local.z);adjusted++;
    }
    if(adjusted){
     out.needsUpdate=true;converted.computeVertexNormals();
     converted.computeBoundingSphere();converted.computeBoundingBox();
     child.geometry=converted;
     child.userData.wildtrapGeneratedAnchorGeometry=converted;
    }else converted.dispose();
   });
  }
  // Cut against the current deformed geometry while retaining the uncut
  // instance buffer for picking through an existing opening.
  const rootCuts=applyCuts&&Array.isArray(node.cuts3d)?node.cuts3d:[];
  if(rootCuts.length){
   root.updateMatrixWorld(true);
   const inverseRoot=root.matrixWorld.clone().invert();
   root.traverse(child=>{
    if(!child.isMesh||child.isSkinnedMesh)return;
    const sourceGeometry=child.geometry;
    child.userData.wildtrapSourceGeometry=sourceGeometry;
    const meshToRoot=inverseRoot.clone().multiply(child.matrixWorld);
    const attrs={};
    for(const [name,attr] of Object.entries(sourceGeometry.attributes)){
     if(attr.itemSize<1||attr.itemSize>4)continue;
     const arr=[];
     for(let i=0;i<attr.count;i++){
      for(let j=0;j<attr.itemSize;j++){
       const getter=['getX','getY','getZ','getW'][j];
       arr.push(attr[getter](i));
      }
     }
     attrs[name]={array:arr,itemSize:attr.itemSize,normalized:false};
    }
    const input={
     attributes:attrs,
     indices:sourceGeometry.index?.array?Array.from(sourceGeometry.index.array):null,
     groups:sourceGeometry.groups.map(g=>({...g}))
    };
    const result=buildAdaptiveModel(input,rootCuts,point=>
     new THREE.Vector3(...point).applyMatrix4(meshToRoot).toArray());
    if(!result)return;
    const geometry=new THREE.BufferGeometry();
    for(const [name,attr] of Object.entries(result.attributes)){
     geometry.setAttribute(name,new THREE.Float32BufferAttribute(attr.array,attr.itemSize));
    }
    geometry.setIndex(result.indices);
    for(const group of result.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.computeBoundingSphere();geometry.computeBoundingBox();
    child.geometry=geometry;
    child.userData.wildtrapGeneratedCutGeometry=geometry;
   });
  }
  if(node.editorIntangible===true){
   // Per-placement materials are cloned: never fade the shared GLB assets.
   root.traverse(child=>{
    if(!child.isMesh)return;
    const faded=source=>{
     const mat=source.clone();
     mat.transparent=true;mat.opacity=Math.min(.26,(source.opacity??1)*.26);
     mat.depthWrite=false;mat.depthTest=true;mat.side=THREE.DoubleSide;
     return mat;
    };
    child.material=Array.isArray(child.material)?child.material.map(faded):faded(child.material);
    child.renderOrder=0; // Depth tested: hidden sections stay behind opaque terrain or other models.
    child.userData.wildtrapGeneratedMaterials=
     Array.isArray(child.material)?child.material:[child.material];
   });
  }
  return root;
 }
 function disposeInstance(root){
  if(!root)return;
  root.traverse(child=>{
   const generated=child.userData?.wildtrapGeneratedCutGeometry;
   if(generated){generated.dispose();delete child.userData.wildtrapGeneratedCutGeometry;}
   const deformed=child.userData?.wildtrapGeneratedDeformGeometry;
   if(deformed){deformed.dispose();delete child.userData.wildtrapGeneratedDeformGeometry;}
   for(const [key,field] of [
    ['wildtrapGeneratedSculptGeometry','Sculpt'],
    ['wildtrapGeneratedAnchorGeometry','Anchor']
   ]){
    const generated=child.userData?.[key];
    if(generated){generated.dispose();delete child.userData[key]}
   }
   for(const mat of child.userData?.wildtrapGeneratedMaterials||[])mat?.dispose?.();
   delete child.userData.wildtrapGeneratedMaterials;
  });
 }
 function createPreview(id){
  const model=instance({id:0,prefabId:id,x:0,z:0,offsetY:0,rotation:0,scale:1},()=>0);
  if(!model)return null;
  model.name='WILDTRAP GLB placement preview · '+id;
  model.userData.editorOnly=true;
  model.userData.previewOnly=true;
  // Only cloned materials are modified. The original GLB and its materials stay intact.
  model.traverse(child=>{
   if(!child.isMesh)return;
   const faded=material=>{
    const m=material.clone();
    m.transparent=true;
    m.opacity=Math.max(.08,Math.min(.55,(material.opacity??1)*.48));
    m.depthWrite=false;
    // Preview caves even when partly inside the terrain; the placed model
    // retains its normal depth-testing and intersection behaviour.
    if(isFreeCave(id))m.depthTest=false;
    m.side=THREE.DoubleSide;
    return m;
   };
   child.material=Array.isArray(child.material)?child.material.map(faded):faded(child.material);
   child.castShadow=false;
   child.receiveShadow=false;
   child.raycast=()=>{}; // Ghost can NEVER be selected by the model raycaster.
  });
  if(isFreeCave(id))model.renderOrder=25;
  model.visible=false;
  return model;
 }
 function disposePreview(model){
  if(!model)return;
  model.parent?.remove(model);
  model.traverse(child=>{
   if(!child.isMesh)return;
   const materials=Array.isArray(child.material)?child.material:[child.material];
   for(const material of materials)material?.dispose?.();
   // DO NOT dispose geometries or textures: they belong to the shared GLB cache.
  });
 }
 function preload(){return Promise.all(PREFABS.map(p=>load(p.id)));}
 function status(){return PREFABS.map(p=>({
  id:p.id,name:p.name,state:cache.has(p.id)?'listo':errors.has(p.id)?'error':'cargando',
  error:errors.get(p.id)||''
 }));}
 return {load,preload,instance,disposeInstance,createPreview,disposePreview,status,has:id=>cache.has(id)};
}
