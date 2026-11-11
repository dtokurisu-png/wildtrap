import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scaleFromVerticalDrag,translateNodeOnTerrain,MIN_PREFAB_SCALE,MAX_PREFAB_SCALE} from '../prefab-gestures.mjs';

const editor=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const library=fs.readFileSync(new URL('../prefab-library.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Shift + arrastrar hacia arriba aumenta escala y hacia abajo la reduce',()=>{
 assert.ok(scaleFromVerticalDrag(1,250,100)>1);
 assert.ok(scaleFromVerticalDrag(1,100,250)<1);
 assert.equal(scaleFromVerticalDrag(1,100,100),1);
 assert.ok(scaleFromVerticalDrag(2,100,100)<scaleFromVerticalDrag(2,100,-100));
});
test('escalado mantiene los límites y maneja valores inválidos',()=>{
 assert.equal(scaleFromVerticalDrag(1,5000,-5000),MAX_PREFAB_SCALE);
 assert.equal(scaleFromVerticalDrag(1,-5000,5000),MIN_PREFAB_SCALE);
 assert.equal(scaleFromVerticalDrag(NaN,10,10),1);
 assert.equal(scaleFromVerticalDrag(2,10,NaN),2);
});
test('el arrastre traslada modelos independientemente y dentro de los límites',()=>{
 const original={kind:'prefab',prefabId:'mountain',x:8,z:-6,offsetY:7,rotation:.3,scale:2};
 const translated=translateNodeOnTerrain(original,15,22,630);
 assert.deepEqual(translated,{x:23,z:16});
 assert.equal(original.x,8);
 assert.equal(original.z,-6);
 assert.deepEqual(translateNodeOnTerrain({...original,x:314,z:-314},20,-20,630),{x:314,z:-314});
});
test('el arrastre de caminos conserva ambos extremos',()=>{
 const data={a:{x:1,z:2},b:{x:3,z:4}};
 assert.deepEqual(translateNodeOnTerrain(data,5,-1),{a:{x:6,z:1},b:{x:8,z:3}});
});
test('la vista previa usa geometría GLB sin interceptar selección',()=>{
 assert.ok(library.includes('function createPreview(id)'));
 assert.ok(library.includes('model.userData.previewOnly=true'));
 assert.ok(library.includes('child.raycast=()=>{}'));
 assert.ok(library.includes('function disposePreview(model)'));
 assert.ok(editor.includes('updatePlacementAt(p)'));
 assert.ok(editor.includes('armPlacement(id)'));
 assert.ok(editor.includes('clearPlacement()'));
});
test('selección por raycast real, hover y drag directo',()=>{
 assert.ok(editor.includes('function pickedNodeAt(e)'));
 assert.ok(editor.includes('ray.intersectObjects('));
 assert.ok(editor.includes('function setHoverNode(node,event)'));
 assert.ok(editor.includes('hoverHighlights'));
 assert.ok(editor.includes('function beginModelDrag(e,node)'));
 assert.ok(editor.includes('function moveModelDrag(e)'));
 assert.ok(editor.includes('scaleFromVerticalDrag('));
 assert.ok(editor.includes('translateNodeOnTerrain('));
 assert.ok(editor.includes('snapshot();session.changed=true'));
 assert.ok(editor.includes('if(old.changed)persist()'));
 assert.ok(html.includes('id="modelHoverIndicator"'));
 assert.ok(html.includes('id="interactionHelp"'));
});
