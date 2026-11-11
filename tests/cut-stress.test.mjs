import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildAdaptiveTerrain} from '../adaptive-terrain-cuts.mjs';
import {buildAdaptiveModel} from '../adaptive-model-cuts.mjs';

function mesh(n=49,size=160){
 const positions=[],uvs=[],normals=[],colors=[],indices=[];
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  positions.push((x/(n-1)-.5)*size,28,(z/(n-1)-.5)*size);
  uvs.push(x/(n-1),z/(n-1));normals.push(0,1,0);colors.push(.4,.5,.3);
 }
 for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){
  const i=z*n+x;
  indices.push(i,i+n,i+1,i+1,i+n,i+n+1);
 }
 return {positions,uvs,normals,colors,indices};
}
function strokes(count=110){
 return Array.from({length:count},(_,i)=>({
  center:[Math.sin(i*.83)*5,28,Math.cos(i*.51)*5],
  normal:[0,1,0],radius:3+(i%3)*.2,depth:2,
  shape:'circle',dir:'north',op:i%21===20?'restore':'cut'
 }));
}
test('muchos trazos solapados no congelan la reconstrucción del terreno',()=>{
 const base=mesh(57,180),stamps=strokes(90);
 const started=performance.now();
 const result=buildAdaptiveTerrain(base,[],stamps,180,57);
 const ms=performance.now()-started;
 assert.ok(result);
 assert.ok(Number.isFinite(result.stats.finalTriangles));
 assert.ok(result.indices.length<600000,'el número de índices debe permanecer acotado');
 assert.ok(ms<18000,'tiempo excesivo de reconstrucción del terreno: '+ms.toFixed(0)+' ms');
});
test('varios trazos de un GLB no multiplican triángulos sin límite',()=>{
 const base=mesh(32,64);
 const input={attributes:{
  position:{array:base.positions,itemSize:3},normal:{array:base.normals,itemSize:3},
  uv:{array:base.uvs,itemSize:2}
 },indices:base.indices,groups:[]};
 const started=performance.now();
 const result=buildAdaptiveModel(input,strokes(65));
 const ms=performance.now()-started;
 assert.ok(result);
 assert.ok(result.indices.length<420000);
 assert.ok(ms<18000,'tiempo excesivo de reconstrucción GLB: '+ms.toFixed(0)+' ms');
});
