import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainCliffShadowIndices} from '../terrain-shadow-geometry.mjs';
const positions=new Float32Array([
 0,0,0, 1,0,0, 0,0,1,
 0,0,0, 0,3,0, 0,0,1,
 1,0,0, 1,3,0, 1,0,1
]);
test('keeps cliff faces but not flat walkable floor',()=>{
 assert.deepEqual(terrainCliffShadowIndices(positions),[3,4,5,6,7,8]);
});
test('works with indexed triangles',()=>{
 assert.deepEqual(terrainCliffShadowIndices(positions,new Uint16Array([0,1,2,3,4,5])),[3,4,5]);
});
test('avoids degenerate triangles',()=>{
 assert.deepEqual(terrainCliffShadowIndices(new Float32Array([0,0,0,0,0,0,0,0,0])),[]);
});
test('wall remains a shadow caster with reverse winding',()=>{
 assert.deepEqual(terrainCliffShadowIndices(positions,new Uint16Array([5,4,3])),[5,4,3]);
});
