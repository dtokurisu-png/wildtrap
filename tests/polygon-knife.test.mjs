import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareCutStamp,pointInStamp,buildAdaptiveTerrain} from '../adaptive-terrain-cuts.mjs';
import {buildAdaptiveModel} from '../adaptive-model-cuts.mjs';

const square=[[-2,-2],[2,-2],[2,2],[-2,2]];
const concave=[[-2,-2],[2,-2],[2,0],[0,0],[0,2],[-2,2]];
const polygon=(points=square,op='cut',normal=[0,0,1])=>
 ({center:[0,0,0],normal,shape:'polygon',polygon:points,depth:1,op});
const mesh=()=>({
 attributes:{
  position:{itemSize:3,array:[-5,-5,0,5,-5,0,5,5,0,-5,5,0]},
  normal:{itemSize:3,array:[0,0,1,0,0,1,0,0,1,0,0,1]},
  uv:{itemSize:2,array:[0,0,1,0,1,1,0,1]}
 },
 indices:[0,1,2,0,2,3],groups:[{start:0,count:6,materialIndex:0}]
});
const field=()=>({
 positions:[-5,0,-5,5,0,-5,-5,0,5,5,0,5],
 normals:[0,1,0,0,1,0,0,1,0,0,1,0],
 colors:[.3,.6,.4,.3,.6,.4,.3,.6,.4,.3,.6,.4],
 uvs:[0,0,1,0,0,1,1,1],
 indices:[0,2,1,1,2,3]
});
function modelArea(output){
 const positions=output.attributes.position.array,ids=output.indices;
 let area=0;
 for(let i=0;i<ids.length;i+=3){
  const [a,b,c]=ids.slice(i,i+3).map(id=>[positions[id*3],positions[id*3+1]]);
  area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))*.5;
 }
 return area;
}
function terrainArea(output){
 const p=output.positions,ids=output.indices;
 let total=0;
 for(let i=0;i<ids.length;i+=3){
  const [a,b,c]=ids.slice(i,i+3).map(id=>[p[id*3],p[id*3+2]]);
  total+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))*.5;
 }
 return total;
}
test('cuatro clics producen un único polígono exacto (no cientos de pinceladas)',()=>{
 const raw=polygon(),p=prepareCutStamp(raw);
 assert.ok(p);
 assert.equal(p.polygon.length,4);
 assert.equal(p.parts,null,'El cuadrilátero convexo se recorta como un solo prisma');
 assert.equal(pointInStamp([0,0,0],p),true);
 assert.equal(pointInStamp([3,0,0],p),false);
 assert.equal(prepareCutStamp({...raw,polygon:[...square].reverse()}).polygon.length,4);
});
test('se aceptan 10 puntos, pero se rechazan cruces y vértices duplicados',()=>{
 const decagon=Array.from({length:10},(_,i)=>[2*Math.cos(i*Math.PI/5),2*Math.sin(i*Math.PI/5)]);
 assert.ok(prepareCutStamp(polygon(decagon)));
 assert.equal(prepareCutStamp(polygon([[-2,-2],[2,2],[-2,2],[2,-2]])),null);
 assert.equal(prepareCutStamp(polygon([[-2,-2],[2,-2],[2,-2],[2,2]])),null);
});
test('el contorno cóncavo deja fuera la concavidad de una L',()=>{
 const p=prepareCutStamp(polygon(concave));
 assert.ok(p.parts?.length>1);
 assert.equal(pointInStamp([-1,1,0],p),true);
 assert.equal(pointInStamp([1,-1,0],p),true);
 assert.equal(pointInStamp([1,1,0],p),false);
});
test('el agujero poligonal recorta GLB y se puede restaurar',()=>{
 const m=mesh(),cut=buildAdaptiveModel(m,[polygon(concave)]);
 assert.ok(cut);
 assert.ok(Math.abs(modelArea(cut)-88)<.02,'Solo se elimina el área de la L');
 const restored=buildAdaptiveModel(m,[polygon(concave),polygon(concave,'restore')]);
 assert.ok(Math.abs(modelArea(restored)-100)<.02,'Restauración devuelve superficie original');
 assert.ok(cut.indices.every(i=>i>=0&&i<cut.attributes.position.array.length/3));
});
test('el terreno conserva vertices originales y corta un cuadrilátero local',()=>{
 const base=field(),cut=buildAdaptiveTerrain(base,[],[polygon(square,'cut',[0,1,0])],10,2);
 assert.ok(cut&&cut.stats.newVertices>0);
 assert.ok(Math.abs(terrainArea(cut)-84)<.02);
 assert.ok(cut.indices.every(i=>i>=0&&i<cut.positions.length/3));
 const restored=buildAdaptiveTerrain(base,[],[polygon(square,'cut',[0,1,0]),polygon(square,'restore',[0,1,0])],10,2);
 assert.ok(Math.abs(terrainArea(restored)-100)<.02);
});
test('UI requiere clic, cierre y Crear agujero: el pincel no existe',()=>{
 const editor=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
 const cutter=fs.readFileSync(new URL('../terrain-holes.mjs',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(editor.includes('holesEditor.addPoint(hit,[e.clientX,e.clientY])'));
 assert.ok(editor.includes('holesEditor.hoverAt(p,[e.clientX,e.clientY])'));
 assert.ok(cutter.includes('function closePolygon()'));
 assert.ok(cutter.includes('anchors.length>=3'));
 assert.ok(cutter.includes('selected.splice(0,selected.length,stamp)'));
 assert.ok(html.includes('id="closeHoleContour"'));
 assert.ok(html.includes('id="undoHolePoint"'));
 assert.ok(!html.includes('id="holeShape"'));
 assert.ok(!cutter.includes('function paint('));
});
