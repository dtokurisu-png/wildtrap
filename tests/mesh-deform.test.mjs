import test from 'node:test';
import assert from 'node:assert/strict';
import {pointAfterScale,normalizedLocks,cleanVertexOperations,constrainedRotation} from '../mesh-deform.mjs';
import {objectTree} from '../scene-object-catalog.mjs';
test('La base propia de un modelo es el pivote del escalado Y, no el nivel global 0',()=>{
 assert.deepEqual(pointAfterScale([3,37,4],'y',2,[3,37,4]),[3,37,4]);
 assert.deepEqual(pointAfterScale([3,47,4],'y',2,[3,37,4]),[3,57,4]);
 assert.deepEqual(pointAfterScale([3,47,4],'x',2,[3,37,4]),[3,47,4]);
 assert.deepEqual(pointAfterScale([5,47,8],'xyz',.5,[3,37,4]),[4,42,6]);
});
test('Las restricciones de rotación bloquean ejes exactos y permiten Z independiente',()=>{
 const initial={x:.3,y:.6,z:.1};
 let result=constrainedRotation(initial,90,50,{x:true,z:true});
 assert.equal(result.x,initial.x);assert.equal(result.z,initial.z);
 assert.ok(result.y>initial.y);
 result=constrainedRotation(initial,90,50,{y:true,z:true});
 assert.equal(result.y,initial.y);assert.equal(result.z,initial.z);
 assert.ok(result.x>initial.x);
 result=constrainedRotation(initial,90,50,{x:true,y:true});
 assert.equal(result.x,initial.x);assert.equal(result.y,initial.y);
 assert.ok(result.z>initial.z);
 result=constrainedRotation(initial,90,50,{x:true,y:true,z:true});
 assert.deepEqual(result,initial);
});
test('Las listas de vértices bloqueados se normalizan sin referencias compartidas',()=>{
 const original={'0':[6,4,6,1,-1,1.3],'bad!':[1],'1':[]};
 const cleaned=normalizedLocks(original);
 assert.deepEqual(cleaned,{'0':[1,4,6]});
 assert.notEqual(cleaned['0'],original['0']);
 const ops=cleanVertexOperations([{axis:'y',factor:1.5,pivot:[0,37,0],locked:cleaned},
  {axis:'y',factor:0,pivot:[0,0,0]}]);
 assert.equal(ops.length,1);
 assert.deepEqual(ops[0].locked['0'],[1,4,6]);
});
test('Intangible y oculto son estados independientes en el gestor, sin spawns',()=>{
 const nodes=[{id:1,kind:'prefab',prefabId:'rocky-cave',editorIntangible:true},
  {id:2,kind:'prefab',prefabId:'stone-cave',editorHidden:true},
  {id:3,kind:'spawn'}];
 const tree=objectTree(nodes);
 assert.equal(tree.length,1);
 assert.deepEqual(tree[0].objects.map(x=>[x.id,x.hidden,x.intangible]),[[1,false,true],[2,true,false]]);
});
