import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdaptiveModel} from '../adaptive-model-cuts.mjs';
import {prepareCutStamp,pointInStamp} from '../adaptive-terrain-cuts.mjs';

function plane(indexed=true){
 const p=[-5,-5,0,5,-5,0,-5,5,0,5,5,0];
 const positions=indexed?p:[...p.slice(0,3),...p.slice(6,9),...p.slice(3,6),...p.slice(3,6),...p.slice(6,9),...p.slice(9,12)];
 const uv=indexed?[0,0,1,0,0,1,1,1]:[0,0,0,1,1,0,1,0,0,1,1,1];
 const count=positions.length/3;
 return {attributes:{
  position:{array:positions,itemSize:3},
  normal:{array:Array.from({length:count},()=>[0,0,1]).flat(),itemSize:3},
  uv:{array:uv,itemSize:2},
  color:{array:Array.from({length:count},()=>[.3,.6,.9]).flat(),itemSize:3}},
  indices:indexed?[0,2,1,1,2,3]:null,
  groups:indexed?[{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1}]:[]};
}
const stamp=(radius=2,op='cut')=>({center:[0,0,0],normal:[0,0,1],radius,depth:1,shape:'circle',dir:'north',op});
function surfaceArea(geom){
 const ps=geom.attributes.position.array,indices=geom.indices;let sum=0;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const ab=[ps[b]-ps[a],ps[b+1]-ps[a+1],ps[b+2]-ps[a+2]];
  const ac=[ps[c]-ps[a],ps[c+1]-ps[a+1],ps[c+2]-ps[a+2]];
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  sum+=Math.hypot(...cross)*.5;
 }
 return sum;
}
test('sin trazos, conserva el GLB original',()=>{
 assert.equal(buildAdaptiveModel(plane(),[]),null);
});
test('corta un agujero parcial, mantiene caras exteriores y crea vértices de borde',()=>{
 const base=plane(),data=buildAdaptiveModel(base,[stamp()]);
 assert.ok(data);
 assert.ok(surfaceArea(data)<100-10);
 assert.ok(surfaceArea(data)>80);
 assert.ok(data.stats.generatedVertices>0);
 assert.equal(base.indices.length,6,'malla original intacta');
 assert.deepEqual(data.attributes.position.array.slice(0,base.attributes.position.array.length),base.attributes.position.array);
});
test('preserva UV, normales, colores, índices y grupos de materiales',()=>{
 const cut=buildAdaptiveModel(plane(),[stamp()]);
 const vertexCount=cut.attributes.position.array.length/3;
 for(const [name,a] of Object.entries(cut.attributes)){
  assert.equal(a.array.length,vertexCount*a.itemSize,name);
 }
 assert.ok(cut.indices.every(i=>i>=0&&i<vertexCount));
 assert.ok(cut.groups.some(g=>g.materialIndex===0));
 assert.ok(cut.groups.some(g=>g.materialIndex===1));
 assert.equal(cut.groups.reduce((total,g)=>total+g.count,0),cut.indices.length);
});
test('puede restaurar una región pequeña sin cerrar toda la abertura',()=>{
 const original=plane(),cut=buildAdaptiveModel(original,[stamp()]);
 const restored=buildAdaptiveModel(original,[stamp(),stamp(.8,'restore')]);
 assert.ok(surfaceArea(restored)>surfaceArea(cut)+1);
 assert.ok(surfaceArea(restored)<100-1);
 const inner=prepareCutStamp(stamp(.8,'restore'));
 assert.ok(pointInStamp([0,0,0],inner));
});
test('restaurar el área completa recupera la superficie de la malla',()=>{
 const result=buildAdaptiveModel(plane(),[stamp(),stamp(2,'restore')]);
 assert.ok(Math.abs(surfaceArea(result)-100)<.001);
});
test('funciona en geometrías GLB no indexadas',()=>{
 const result=buildAdaptiveModel(plane(false),[stamp()]);
 assert.ok(result.indices.length>6);
 assert.ok(result.stats.generatedVertices>0);
 assert.ok(surfaceArea(result)>80&&surfaceArea(result)<100);
});
test('el cortador recibe coordenadas del modelo local, independiente de su posición',()=>{
 const translated=point=>[point[0]+30,point[1]+20,point[2]];
 const cut={...stamp(),center:[30,20,0]};
 const result=buildAdaptiveModel(plane(),[cut],translated);
 assert.ok(result);
 assert.ok(result.stats.generatedVertices>0);
 assert.ok(result.attributes.position.array.some(n=>Math.abs(n)>1));
 assert.equal(buildAdaptiveModel(plane(),[stamp()],translated),null);
});
test('sin intersección espacial, no reconstruye mallas lejanas',()=>{
 const stampFar={...stamp(),center:[900,0,0]};
 assert.equal(buildAdaptiveModel(plane(),[stampFar]),null);
});
