import assert from 'node:assert/strict';
import {addTerrainSeam,seamVertexIds,seamAnchors,restoreTerrainSeams,updateManualTerrainSeamAnchors,removeTerrainSeam,buildTerrainVertexGraph,shortestTerrainVertexPath} from '../terrain-seams.mjs';
import {readFileSync} from 'node:fs';

const n=11,size=100,cell=size/(n-1),count=n*n;
const pos=Array.from({length:count},(_,i)=>[
 (i%n)*cell-size/2, Math.floor(i/n)<=5?30:0, Math.floor(i/n)*cell-size/2]);
const tri=[];
for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){
 const a=z*n+x,b=a+1,c=a+n,d=c+1;
 tri.push(a,c,b,b,c,d);
}
const geometry={attributes:{position:{
 count,getX:i=>pos[i][0],getY:i=>pos[i][1],getZ:i=>pos[i][2]
}},index:{array:tri}};
const graph=buildTerrainVertexGraph(geometry);
const route=shortestTerrainVertexPath(geometry,graph,5*n+2,5*n+8);
assert.equal(route[0],5*n+2);
assert.equal(route.at(-1),5*n+8);
assert.ok(route.length>=7&&route.length<12,'Ctrl+click selects intermediate edge vertices');
for(let i=1;i<route.length;i++)
 assert.ok(graph[route[i-1]].includes(route[i]),'Route must follow a real triangle edge');
assert.deepEqual(shortestTerrainVertexPath(geometry,graph,42,42),[42]);

const live={heights:pos.map(p=>p[1]),terrainVertexOffsets:{},terrainSeams:[]};
const seam=addTerrainSeam(live,route,id=>pos[id],route);
assert.equal(seam.vertices.length,route.length);
assert.equal(seam.path.length,route.length);
const locked=seamVertexIds(live);
assert.equal(locked.size,route.length);
const anchor=route[3],p=pos[anchor];
live.heights[anchor]=999;
live.terrainVertexOffsets[anchor]=[25,-15];
assert.equal(restoreTerrainSeams(live,{size,resolution:n}),1,'Automatic operation is rolled back');
assert.equal(live.heights[anchor],p[1]);
assert.ok(!live.terrainVertexOffsets[anchor]);

const moved=new Map([[anchor,[p[0]+3,44,p[2]-7]]]);
assert.equal(updateManualTerrainSeamAnchors(live,moved),1);
restoreTerrainSeams(live,{size,resolution:n});
assert.equal(live.heights[anchor],44,'Manual Y is new locked height');
assert.deepEqual(live.terrainVertexOffsets[anchor],[3,-7],'Manual XZ is new locked position');

const serialized=JSON.parse(JSON.stringify(live));
serialized.heights[anchor]=0;serialized.terrainVertexOffsets[anchor]=[0,0];
restoreTerrainSeams(serialized,{size,resolution:n});
assert.equal(serialized.heights[anchor],44,'Seam anchors survive export/import');
assert.deepEqual(serialized.terrainVertexOffsets[anchor],[3,-7]);

assert.ok(removeTerrainSeam(live,seam.id),'Seams can be removed individually');
assert.equal(seamVertexIds(live).size,0,'Removal unlocks without moving geometry');
assert.equal(live.heights[anchor],44,'Removing seam does not modify mesh');

const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const vertex=readFileSync(new URL('../terrain-vertex-editor.mjs',import.meta.url),'utf8');
const holes=readFileSync(new URL('../terrain-holes.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(editor,/restoreTerrainSeams\(live,\{size:SIZE,resolution:N\}\)/,'Every terrain refresh protects seam XYZ');
assert.match(editor,/if\(fixedSeamVertices\.has\(k\)\)continue/,'Sculpt brushes skip seam vertices');
assert.match(vertex,/extendPath\(index\);updateSelection\(\)/,'Ctrl-click selects a shortest path');
assert.match(vertex,/updateManualTerrainSeamAnchors\(live,movedSeamAnchors\)/,'Manual vertex dragging updates protection');
assert.match(holes,/cutTouchesSeam\(pending\)/,'Knife refuses cutting protected seams');
for(const id of ['terrainCreateSeam','terrainClearVertexSelection','terrainSeamCount','terrainSeamList'])
 assert.ok(html.includes('id="'+id+'"'),'Sculpt panel missing '+id);
console.log('PASS: seam path, XYZ locks, manual move, JSON persistence, cut protection, UI');
