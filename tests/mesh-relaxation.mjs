import assert from 'node:assert/strict';
import {sculptRootPoints} from '../mesh-vertex-freeze.mjs';

const source=[[0,0,0],[.2,.7,0],[1.9,-.6,.3],[3,0,0],[4,0,0],[30,20,5],[31,20,5]];
const graph=[[1],[0,2],[1,3],[2,4],[3],[6],[5]];
const stamp={mode:'relax',center:[2,0,0],normal:[0,1,0],radius:10,strength:20,locked:{}};
const distances=p=>[0,1,2,3].map(i=>Math.hypot(...p[i].map((x,k)=>x-p[i+1][k])));
const spread=a=>Math.max(...a)-Math.min(...a);
let updated=source.map(p=>p.slice());
for(let i=0;i<10;i++)updated=sculptRootPoints(updated,[stamp],[],'0',graph);
assert.ok(spread(distances(updated))<spread(distances(source))*.3,'Edges should become more uniform');
assert.deepEqual(updated.slice(5),source.slice(5),'Unconnected geometry outside the brush must not move');
assert.ok(Math.hypot(...updated[0].map((v,k)=>v-updated[4][k]))>2.5,
 'The whole chain must not collapse to a single centroid');
const withLock={...stamp,locked:{'0':[2]}};
const protectedMesh=sculptRootPoints(source,[withLock],[],'0',graph);
assert.deepEqual(protectedMesh[2],source[2],'Locked vertices may not move');
const displaced={...stamp,center:[2,1,1]};
const next=sculptRootPoints(source,[displaced],[],'0',graph);
assert.ok(next.every(p=>p.every(Number.isFinite)),'Brush changes must remain finite');
console.log('MESH RELAXATION PASS: neighbor edges, locks, locality, no centroid collapse');
