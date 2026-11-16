import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {straightenCliffZone} from '../editor-cliff-alignment.mjs';

const n=21,size=100,cell=size/(n-1),heights=Array(n*n).fill(0);
const offsets={};
for(let z=0;z<n;z++)for(let x=0;x<n;x++){
 const pz=z*cell-size/2,px=x*cell-size/2,i=z*n+x;
 heights[i]=pz<=-20?30:pz===-15?30+(x%2?4:-4):pz===-10?(x%2?2:-2):0;
 // Sawteeth in the XZ footprint, rather than just a jagged height.
 if(px>=-30&&px<=30&&(pz===-15||pz===-10))offsets[i]=[0,x%2?1:-1];
}
const zone={isCliff:true,points:[
 {x:-35,z:-15},{x:35,z:-15},{x:35,z:15},{x:-35,z:15}
]};
const live={heights,terrainVertexOffsets:offsets};
const topIndices=Array.from({length:11},(_,j)=>(7*n)+(5+j));
const bottomIndices=Array.from({length:11},(_,j)=>(8*n)+(5+j));
const spread=(values)=>Math.max(...values)-Math.min(...values);
const topBefore=spread(topIndices.map(i=>heights[i]));
const bottomBefore=spread(bottomIndices.map(i=>heights[i]));
const outside=heights[1*n+10];
const result=straightenCliffZone(live,zone,{size,resolution:n});
assert.ok(result.changed>0,'The marked cliff is aligned automatically');
assert.ok(result.upper>0,'Upper rim vertices are aligned');
assert.ok(result.lower>0,'Lower foot vertices are aligned');
const topAfter=spread(topIndices.map(i=>heights[i]));
const bottomAfter=spread(bottomIndices.map(i=>heights[i]));
assert.ok(topAfter<topBefore,'Upper rail becomes less jagged in height');
assert.ok(bottomAfter<bottomBefore,'Lower rail becomes less jagged in height');
assert.equal(heights[1*n+10],outside,'Outside geometry stays unchanged');
const beforeFlat=[...heights];
assert.equal(straightenCliffZone(live,{...zone,isCliff:false},{size,resolution:n}).changed,0,'Unmarked zone is ignored');
assert.deepEqual(heights,beforeFlat,'Unmarked zone never modifies heights');

const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const zones=readFileSync(new URL('../editor-zones.mjs',import.meta.url),'utf8');
assert.match(editor,/function alignMarkedCliffZones/,'Main editor has automatic cliff alignment');
assert.match(editor,/onChange:\(\)=>\{alignMarkedCliffZones\(\)/,'Zone changes trigger cliff alignment');
assert.match(editor,/zone\.cliffAlignmentSignature/,'Alignment is stored to prevent repeated destructive passes');
assert.match(zones,/delete zone\.cliffAlignmentSignature/,'Re-marking re-aligns the cliff');
console.log('PASS: cliff zones align upper/lower real mesh rails, with persistent XYZ offsets and isolated terrain edits');
