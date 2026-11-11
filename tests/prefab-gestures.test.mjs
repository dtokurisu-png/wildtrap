import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scaleFromVerticalDrag,translateNodeOnTerrain,rotateFromPointerDrag,MIN_PREFAB_SCALE,MAX_PREFAB_SCALE} from '../prefab-gestures.mjs';

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

test('Alt + mover horizontalmente gira solamente el eje Y',()=>{
 const rot=rotateFromPointerDrag(.3,.6,100,200,200,200);
 assert.ok(rot.rotation>.3);
 assert.equal(rot.rotationX,.6);
 const left=rotateFromPointerDrag(.3,.6,100,200,0,200);
 assert.ok(left.rotation<.3);
 assert.equal(left.rotationX,.6);
});
test('Alt + mover verticalmente inclina solamente el eje X',()=>{
 const up=rotateFromPointerDrag(.3,.6,100,200,100,100);
 const down=rotateFromPointerDrag(.3,.6,100,200,100,300);
 assert.equal(up.rotation,.3);
 assert.ok(up.rotationX>.6);
 assert.equal(down.rotation,.3);
 assert.ok(down.rotationX<.6);
});
test('Alt + arrastre combinado mantiene ambas rotaciones originales como base',()=>{
 const first=rotateFromPointerDrag(1,-.5,100,100,190,60);
 const second=rotateFromPointerDrag(1,-.5,100,100,190,60);
 assert.deepEqual(first,second);
 assert.ok(first.rotation>1);
 assert.ok(first.rotationX>-.5);
 const invalid=rotateFromPointerDrag(1,-.5,100,100,Infinity,90);
 assert.deepEqual(invalid,{rotation:1,rotationX:-.5});
});
test('rotación 3D del GLB usa los ejes correctos y se conserva al editar el proyecto',()=>{
 assert.ok(library.includes("root.rotation.set(Number(node.rotationX)||0,Number(node.rotation)||0,Number(node.rotationZ)||0,'YXZ')"));
 assert.ok(editor.includes("e.altKey&&node.kind==='prefab'?'rotate'"));
 assert.ok(editor.includes("}else if(session.action==='rotate'){"));
 assert.ok(editor.includes("n.rotationX=rotation.x"),'Los ejes bloqueados se respetan al girar');
 assert.ok(editor.includes("root.rotation.set(n.rotationX||0,n.rotation||0,n.rotationZ||0,'YXZ')"));
 assert.ok(editor.includes("snapshot();session.changed=true"));
 assert.ok(editor.includes("if(old.changed)persist()"));
 assert.ok(editor.includes("tiltDelta"));
 assert.ok(html.includes('id="prefabRotationX"'));
 assert.ok(html.includes('id="prefabRotationZ"'));
 assert.ok(editor.includes('constrainedRotation('));
 assert.ok(html.includes("Alt + arrastrar"));
});
