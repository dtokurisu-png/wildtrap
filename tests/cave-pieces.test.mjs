import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CAVE_PIECE_TYPES,createCavePieceData,deformCavePieceData,
 verifyCavePieceData,pieceOptions
} from '../cave-pieces.mjs';

const valid=c=>{const e=verifyCavePieceData(c);assert.deepEqual(e,[],e.join(', '));};
for(const {id} of CAVE_PIECE_TYPES){
 test('topología deformable '+id,()=>{
  const g=createCavePieceData(id);
  valid(g);
  assert.ok(g.positions.length/3>=100,'Muy pocos vértices para editar');
  assert.ok(g.positions.length/3<=3500,'Excesivos vértices');
  assert.equal(g.uvs.length,g.positions.length/3*2);
  assert.ok(g.uvs.every(Number.isFinite));
  assert.ok(g.normals.every(Number.isFinite));
  assert.ok(g.groups.length>0);
  const index=Math.floor(g.positions.length/6);
  const target={x:g.positions[index*3],y:g.positions[index*3+1],z:g.positions[index*3+2]};
  const previous=g.positions.slice();
  const moved=deformCavePieceData(g,target,3,{x:.6,y:1,z:-.2});
  assert.ok(moved>0,'Los vértices no permiten deformación');
  assert.notDeepEqual(g.positions,previous);
  const restored=createCavePieceData(id,{},g.vertexEdits);
  assert.deepEqual(restored.positions,g.positions,'Se perdió el esculpido');
  assert.deepEqual(verifyCavePieceData(restored),[]);
  const independent=createCavePieceData(id);
  assert.deepEqual(independent.positions,previous,'La deformación contaminó otras instancias');
 });
}
test('módulos de interior y exterior mantienen superficies y materiales separados',()=>{
 for(const id of ['wall','vault','tunnel','ramp','chamber']){
  const g=createCavePieceData(id);
  assert.ok(g.groups.some(x=>x.materialIndex===0),'Falta material exterior '+id);
  assert.ok(g.groups.some(x=>x.materialIndex===1),'Falta material interior '+id);
 }
});
test('cambios de dimensiones no cambian la topología',()=>{
 for(const {id} of CAVE_PIECE_TYPES){
  const a=createCavePieceData(id);
  const b=createCavePieceData(id,{width:32,height:12,length:28});
  assert.equal(a.positions.length,b.positions.length,id+' vértices');
  assert.deepEqual(a.indices,b.indices,id+' conectividad');
  assert.notDeepEqual(a.positions,b.positions,id+' tamaño no aplicado');
 }
});
test('normal superior del suelo de guarida y rampa apunta hacia arriba',()=>{
 for(const id of ['floor','ramp','chamber']){
  const g=createCavePieceData(id);
  assert.ok(g.normals[1]>.3,'Orientación de suelo incorrecta: '+id);
 }
});
test('normal de interior y exterior de bóvedas apuntan en direcciones opuestas',()=>{
 for(const id of ['vault','tunnel']){
  const g=createCavePieceData(id),rows=pieceOptions(id).segmentsZ+1,cols=pieceOptions(id).segmentsArch+1;
  const centerIdx=Math.floor(rows/2)*cols+Math.floor(cols/2);
  const innerY=g.normals[centerIdx*3+1];
  const outerY=g.normals[(rows*cols+centerIdx)*3+1];
  assert.ok(innerY<-.3,'Interior del '+id+' no mira hacia abajo');
  assert.ok(outerY>.3,'Exterior del '+id+' no mira hacia arriba');
 }
});
test('cámara de jefe conserva un hueco de entrada en la pared',()=>{
 const g=createCavePieceData('chamber');
 assert.ok(g.positions.length>300);
 assert.ok(g.indices.length>1200);
});
console.log('Biblioteca de seis cuevas: topología, UV, normales, dimensiones y deformación conservada.');
