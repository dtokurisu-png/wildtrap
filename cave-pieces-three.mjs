import * as THREE from 'three';
import {createCavePieceData,verifyCavePieceData,deformCavePieceData,pieceOptions} from './cave-pieces.mjs?v=0.9.6';

// Converts the phase-1 editable data structure into an independent scene object.
// No DoubleSide: inner and outer faces have their own triangles and UVs.
export function createCavePieceObject(node,heightAt){
 const settings=pieceOptions(node.piece,node);
 const data=createCavePieceData(node.piece,settings,node.vertexEdits||{});
 const errors=verifyCavePieceData(data);
 if(errors.length)throw Error('Malla inválida de '+node.piece+': '+errors.join('; '));
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
 geo.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));
 geo.setIndex(data.indices);
 for(const group of data.groups)geo.addGroup(group.start,group.count,group.materialIndex);
 geo.computeBoundingSphere();
 geo.computeBoundingBox();
 const outer=new THREE.MeshStandardMaterial({color:0x929894,roughness:1,metalness:0,side:THREE.FrontSide});
 const inner=new THREE.MeshStandardMaterial({color:0x7c8280,roughness:1,metalness:0,side:THREE.FrontSide});
 const mesh=new THREE.Mesh(geo,[outer,inner]);
 mesh.name='Malla deformable · '+node.piece+' · '+node.id;
 mesh.userData={cavePieceId:node.id,cavePieceType:node.piece,topologyEditable:true};
 mesh.castShadow=true;mesh.receiveShadow=true;
 const group=new THREE.Group();
 group.name='Pieza independiente #'+node.id;
 group.userData={cavePieceId:node.id};
 group.position.set(node.x,heightAt(node.x,node.z)+(node.offsetY||0),node.z);
 group.rotation.y=Number(node.rotation)||0;
 const scale=Number(node.scale)||1;
 group.scale.setScalar(scale);
 group.add(mesh);
 return group;
}
// Persistent per-vertex displacement: reconstructing the mesh preserves sculpting.
export function sculptCavePieceNode(node,localPosition,radius,delta){
 const data=createCavePieceData(node.piece,node,node.vertexEdits||{});
 const count=deformCavePieceData(data,localPosition,radius,delta);
 if(count)node.vertexEdits=data.vertexEdits;
 return count;
}
