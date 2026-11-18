import assert from 'node:assert/strict';
import {cliffShadowFaceIndices} from '../terrain-shadow-geometry.mjs';
const positions=new Float32Array([
  0,0,0, 1,0,0, 0,0,1, // flat ground: must NEVER cast a self-shadow
  0,0,0, 0,3,0, 0,0,1, // vertical cliff: must cast
  1,0,0, 1,3,0, 1,0,1  // vertical cliff: must cast
]);
assert.deepEqual(cliffShadowFaceIndices(positions),[3,4,5,6,7,8]);
assert.deepEqual(cliffShadowFaceIndices(positions,new Uint16Array([0,1,2,3,4,5])),[3,4,5]);
assert.deepEqual(cliffShadowFaceIndices(positions,new Uint16Array([5,4,3])),[5,4,3]);
assert.deepEqual(cliffShadowFaceIndices(new Float32Array([0,0,0,0,0,0,0,0,0])),[]);
assert.deepEqual(cliffShadowFaceIndices(new Float32Array([0,0,0,1,0,0,0,0,1])),[]);
assert.throws(()=>cliffShadowFaceIndices(new Float32Array([0,0])),/Invalid XYZ/);
console.log('PASS: cliff casters preserve walls without floor self-shadow acne');
