import assert from 'node:assert/strict';
import {sculptRootPoints} from '../mesh-vertex-freeze.mjs';

const stamp={mode:'relax',center:[0,0,0],normal:[0,1,0],radius:20,strength:16,locked:{}};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
for(const [label,pair] of [
 ['Y',[[0,4,0],[0,-4,0]]],
 ['X',[[-5,0,0],[5,0,0]]],
 ['Z',[[0,0,-6],[0,0,6]]]
]){
 const updated=sculptRootPoints(pair,[stamp],[],'0',[[1],[0]]);
 assert.ok(distance(...updated)<distance(...pair),label+': connected vertices must APPROACH each other');
 assert.ok(updated[0].every(Number.isFinite)&&updated[1].every(Number.isFinite));
}
const source=[[0,0,0],[.2,.7,0],[1.9,-.6,.3],[3,0,0],[4,0,0],[30,20,5],[31,20,5]];
const graph=[[1],[0,2],[1,3],[2,4],[3],[6],[5]];
const moved=sculptRootPoints(source,[{...stamp,center:[2,0,0],radius:10}],[],'0',graph);
assert.deepEqual(moved.slice(5),source.slice(5),'Unconnected geometry outside the brush must not move');
const locked=sculptRootPoints(source,[{...stamp,center:[2,0,0],radius:10,locked:{'0':[2]}}],[],'0',graph);
assert.deepEqual(locked[2],source[2],'Locked vertices must not move');
console.log('MESH RELAXATION PASS: neighbor attraction in X/Y/Z, locks and locality');
