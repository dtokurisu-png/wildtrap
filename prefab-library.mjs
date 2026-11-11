import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// WILDTRAP EDITOR: published 3D assets are read-only. Each placement is an
// independent transform, retained in the scenario JSON for the future game.
import {PREFABS,prefabById} from './prefab-catalog.mjs';
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
 function instance(node,heightAt){
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
  model.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
  root.add(model);
  root.position.set(node.x,heightAt(node.x,node.z)+(Number(node.offsetY)||0),node.z);
  // YXZ: horizontal yaw around world Y and vertical tilt around local X.
  root.rotation.set(Number(node.rotationX)||0,Number(node.rotation)||0,0,'YXZ');
  root.scale.setScalar(Math.max(.01,Number(node.scale)||1));
  return root;
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
    m.side=THREE.DoubleSide;
    return m;
   };
   child.material=Array.isArray(child.material)?child.material.map(faded):faded(child.material);
   child.castShadow=false;
   child.receiveShadow=false;
   child.raycast=()=>{}; // Ghost can NEVER be selected by the model raycaster.
  });
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
 return {load,preload,instance,createPreview,disposePreview,status,has:id=>cache.has(id)};
}
