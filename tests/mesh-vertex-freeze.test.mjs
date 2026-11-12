import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedVertexAnchors,normalAnchorRootPoint,cleanSculptStamps,sculptRootPoints}
 from '../mesh-vertex-freeze.mjs';
import {readFileSync} from 'node:fs';
test('bloqueo normal mantiene un vértice fuera de la escala uniforme del modelo',()=>{
 const anchor={root:[5,10,-6],world:[105,42,-6],scale:1};
 assert.deepEqual(normalAnchorRootPoint(anchor,2),[2.5,5,-3]);
 assert.deepEqual(normalAnchorRootPoint(anchor,.5),[10,20,-12]);
 // world = rootPosition + currentScale * compensated root local
 assert.deepEqual(normalAnchorRootPoint(anchor,2).map(x=>x*2),anchor.root);
});
test('anclas normales y totales se guardan por índice, incluso la coordenada cero',()=>{
 const anchors=normalizedVertexAnchors({'0':{'0':{root:[0,0,0],world:[14,5,-2],scale:1.5},
  '3':{root:[9,2,-6],world:[3,7,8],scale:1.5}}});
 assert.deepEqual(anchors['0']['0'].world,[14,5,-2]);
 assert.deepEqual(anchors['0']['3'].root,[9,2,-6]);
 assert.equal(normalizedVertexAnchors({'0':{'0':{root:[NaN,0,0],world:[1,2,3],scale:1}}})['0'],undefined);
});
test('esculpir Subir/Bajar/Nivelar/Suavizar no toca vértices bloqueados',()=>{
 const pts=[[0,0,0],[1,0,0],[2,0,0],[1,2,0],[0,4,0]];
 for(const mode of ['raise','lower','flatten','smooth']){
  const stamps=[{mode,center:[1,0,0],normal:[0,1,0],radius:10,strength:12,
   locked:{'0':[0]}}];
  const result=sculptRootPoints(pts,stamps,[],'0');
  assert.deepEqual(result[0],pts[0],mode+' alteró el vértice bloqueado');
  if(mode!=='smooth')assert.notDeepEqual(result[1],pts[1],mode+' no modificó zona libre');
 }
});
test('bloqueos capturados por pincelada no deshacen escultura previa',()=>{
 const pts=[[0,0,0],[1,0,0],[2,0,0]];
 const all=[{mode:'raise',center:[0,0,0],normal:[0,1,0],radius:10,strength:8,
  locked:{}},{mode:'lower',center:[0,0,0],normal:[0,1,0],radius:10,strength:8,
  locked:{'0':[0]}}];
 const res=sculptRootPoints(pts,all,[],'0');
 assert.ok(res[0][1]>.1,'El bloqueo posterior hizo desaparecer un esculpido anterior');
 assert.ok(res[1][1]<res[0][1],'Otro vértice debería recibir ambas pinceladas');
 assert.deepEqual(cleanSculptStamps(all)[1].locked['0'],[0]);
});
test('los modelos GLB compensan vértices anclados antes de aplicar los recortes',()=>{
 const src=readFileSync(new URL('../prefab-library.mjs',import.meta.url),'utf8');
 assert.ok(src.indexOf('const sculptStamps=cleanSculptStamps')<
  src.indexOf('const vertexAnchors=normalizedVertexAnchors'));
 assert.ok(src.indexOf('const vertexAnchors=normalizedVertexAnchors')<
  src.indexOf('const rootCuts='));
 assert.ok(src.includes('node.vertexTotalLock===true'));
 const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
 assert.ok(editor.includes("rebuildAnchoredGeometry"),'Shift+drag debe reconstituir la geometría bloqueada');
 assert.ok(editor.includes('pickModelSculptSurface'),'Debe existir selección de cara real del modelo');
});
