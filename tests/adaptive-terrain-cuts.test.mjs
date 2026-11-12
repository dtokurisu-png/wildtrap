import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCutStamp,pointInStamp,isTerrainCutAt,buildAdaptiveTerrain} from '../adaptive-terrain-cuts.mjs';

function cliff(){
 // Two triangles, sloping sharply from Y=0 to Y=60 over ten ground units.
 const positions=[-5,0,-5,5,0,-5,-5,60,5,5,60,5];
 const normal=[0,10,-60],len=Math.hypot(...normal),n=normal.map(v=>v/len);
 return {positions,colors:Array(12).fill(.5),uvs:[0,0,1,0,0,1,1,1],normals:[...n,...n,...n,...n],indices:[0,2,1,1,2,3]};
}
const stamp=(x=0,y=30,z=0,radius=2,op='cut')=>
 ({op,center:[x,y,z],normal:[0,10,-60],radius,depth:2,shape:'circle',dir:'north'});
function area(data){
 const p=data.positions,k=data.indices;let result=0;
 for(let i=0;i<k.length;i+=3){
  const a=k[i]*3,b=k[i+1]*3,c=k[i+2]*3;
  const ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]];
  const ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
  result+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])*.5;
 }
 return result;
}
test('sin cortes: mantiene la malla original y la cuadrícula 129 × 129',()=>{
 assert.equal(buildAdaptiveTerrain(cliff(),[],[],10,2),null);
});
test('selección tridimensional: no ocupa toda la columna vertical',()=>{
 const op=prepareCutStamp(stamp());
 assert.ok(pointInStamp([0,30,0],op));
 assert.ok(!pointInStamp([0,0,0],op));
 assert.ok(!pointInStamp([0,60,0],op));
 assert.ok(!pointInStamp([0,30,7],op));
 assert.ok(isTerrainCutAt(0,30,0,new Set(),[op],10,2));
 assert.ok(!isTerrainCutAt(0,0,0,new Set(),[op],10,2));
});
test('corte de acantilado crea vértices SOLO en la zona tocada',()=>{
 const base=cliff(),cut=buildAdaptiveTerrain(base,[],[stamp()],10,2);
 assert.ok(cut.stats.newVertices>0,'Debe generar aristas nuevas');
 assert.ok(cut.indices.length>0,'No debe destruir la pared completa');
 assert.ok(cut.stats.clippedTriangles>0);
 assert.ok(area(cut)<area(base)-4);
 assert.ok(area(cut)>area(base)*.80,'No debe eliminar toda la pared');
 assert.deepEqual(base.positions,cliff().positions,'No cambia los vértices originales');
 assert.equal(cut.positions.length/3*2,cut.uvs.length);
 assert.equal(cut.positions.length,cut.normals.length);
 assert.equal(cut.positions.length,cut.colors.length);
 assert.ok(cut.indices.every(i=>i>=0&&i<cut.positions.length/3));
});
test('restaurar parcialmente reabre SOLO el área seleccionada en la geometría',()=>{
 const base=cliff(),first=stamp(),restore=stamp(0,30,0,.85,'restore');
 const cut=buildAdaptiveTerrain(base,[],[first],10,2);
 const result=buildAdaptiveTerrain(base,[],[first,restore],10,2);
 assert.ok(area(result)>area(cut)+1,'La restauración local debe recuperar superficie');
 assert.ok(area(result)<area(base)-1,'Debe mantener un anillo de abertura');
 assert.equal(isTerrainCutAt(0,30,0,new Set(),[prepareCutStamp(first),prepareCutStamp(restore)],10,2),false);
 assert.equal(isTerrainCutAt(1.5,30,.25,new Set(),[prepareCutStamp(first),prepareCutStamp(restore)],10,2),true);
});
test('restaurar el contorno completo recupera el área original',()=>{
 const base=cliff(),first=stamp(),restore={...stamp(),op:'restore'};
 const result=buildAdaptiveTerrain(base,[],[first,restore],10,2);
 assert.ok(Math.abs(area(result)-area(base))<.001);
});
test('compatibilidad con agujeros viejos de celda completa',()=>{
 const base=cliff(),empty=buildAdaptiveTerrain(base,[0],[],10,2);
 assert.equal(empty.indices.length,0);
 const partlyRestored=buildAdaptiveTerrain(base,[0],[stamp(0,30,0,2,'restore')],10,2);
 assert.ok(partlyRestored.indices.length>0);
 assert.ok(area(partlyRestored)<area(base));
});
test('desplazamiento XYZ, rotación normal y profundidad evitan cortes lejanos',()=>{
 const op=prepareCutStamp({...stamp(),depth:.5});
 assert.ok(pointInStamp([0,30,0],op));
 assert.ok(!pointInStamp([0,30,3],op));
 assert.ok(!pointInStamp([0,38,0],op));
});
test('semicírculos y rectángulos generan un contorno orientado',()=>{
 const s=prepareCutStamp({...stamp(),shape:'semicircle',dir:'east'});
 const rect=prepareCutStamp({...stamp(),shape:'rectangle'});
 // The cliff's outward normal is -Z, so its screen-right tangent is -X.
 assert.ok(pointInStamp([-1,30,0],s));
 assert.ok(!pointInStamp([1,30,0],s));
 assert.ok(pointInStamp([1.5,30,0],rect));
 assert.ok(!pointInStamp([2.5,30,0],rect));
});
test('cortes serializados en el JSON conservan exactamente los vértices',()=>{
 const saved=JSON.stringify({version:3,holes:[],cuts3d:[stamp()]});
 const a=buildAdaptiveTerrain(cliff(),[],JSON.parse(saved).cuts3d,10,2);
 const b=buildAdaptiveTerrain(cliff(),[],[stamp()],10,2);
 assert.deepEqual(a.positions,b.positions);
 assert.deepEqual(a.indices,b.indices);
});


test('25 recortes en la misma celda no descartan los primeros 18 ni dejan triángulos originales',()=>{
 const base=cliff();
 const stamps=Array.from({length:25},(_,i)=>stamp(i*.19,30,0,.32,'cut'));
 const early=buildAdaptiveTerrain(base,[],stamps.slice(0,18),10,2);
 const full=buildAdaptiveTerrain(base,[],stamps,10,2);
 assert.ok(full&&early);
 assert.equal(full.stats.incomplete,false);
 assert.equal(full.stats.limitedFragments,0);
 assert.ok(area(full)<area(early)-.3,
  'Los cortes posteriores al decimoctavo deben continuar eliminando superficie');
 const repeated=buildAdaptiveTerrain(base,[],[...stamps,...stamps],10,2);
 assert.equal(repeated.stats.incomplete,false);
 assert.ok(Math.abs(area(repeated)-area(full))<.0001,
  'Repetir exactamente los mismos cortes no debe volver a crear triángulos');
});
test('el límite antiguo de 5000 triángulos no reintroduce caras originales',()=>{
 const resolution=65,side=64,size=64,step=size/side;
 const positions=[],colors=[],normals=[],uvs=[],indices=[];
 for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++){
  positions.push(-size/2+i*step,0,-size/2+j*step);
  colors.push(.3,.6,.4);normals.push(0,1,0);uvs.push(i/side,j/side);
 }
 for(let j=0;j<side;j++)for(let i=0;i<side;i++){
  const a=j*resolution+i,b=a+1,c=a+resolution,d=c+1;
  indices.push(a,c,b,b,c,d);
 }
 const base={positions,colors,normals,uvs,indices};
 const broad={op:'cut',shape:'polygon',center:[0,0,0],normal:[0,1,0],
  polygon:[[-29,-29],[29,-29],[29,29],[-29,29]],depth:2};
 const result=buildAdaptiveTerrain(base,[],[broad],size,resolution);
 assert.ok(result);
 assert.ok(result.stats.clippedTriangles>5000,
  'Esta prueba debe alcanzar más de 5000 triángulos');
 assert.equal(result.stats.limitedTriangles,0);
 assert.equal(result.stats.incomplete,false);
 assert.ok(area(result)<area(base)*.25,
  'No se deben reinsertar triángulos base después del límite antiguo');
});
