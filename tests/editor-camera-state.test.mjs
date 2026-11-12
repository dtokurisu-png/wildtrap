import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_3D_CAMERA,normalizeEditorCameraState} from '../editor-camera-state.mjs';
test('sin guardado el editor debe arrancar en vista tridimensional inclinada',()=>{
 assert.deepEqual(DEFAULT_3D_CAMERA.position,[300,330,350]);
 assert.deepEqual(DEFAULT_3D_CAMERA.target,[0,0,0]);
 assert.equal(DEFAULT_3D_CAMERA.label,'Vista 3D');
 assert.equal(DEFAULT_3D_CAMERA.enableRotate,true);
 const source=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('setDefault3D();'));
 assert.ok(source.includes('restoreEditorCamera(lastCamera)||restoreEditorCamera(live.editorCamera)'));
});
test('se conservan cámara, centro, inclinación, nivel de zoom y vista Y',()=>{
 const state={position:[132,400,-281],target:[38,29,-18],up:[0,1,0],
  zoom:1.45,viewSpan:380,enableRotate:true,label:'Vista 3D'};
 assert.deepEqual(normalizeEditorCameraState(state),{version:1,...state});
 const top={...state,position:[38,880,-18],up:[0,0,-1],
  enableRotate:false,label:'Vista superior Y'};
 assert.deepEqual(normalizeEditorCameraState(top),{version:1,...top});
});
test('vistas antiguas o corruptas no invalidan el arranque',()=>{
 for(const invalid of [null,{},[],{position:[1,2,3]},{
  position:[NaN,2,3],target:[0,0,0],up:[0,1,0],viewSpan:720,
  zoom:1,enableRotate:true
 },{
  position:[1,2,3],target:[1,2,3],up:[0,1,0],viewSpan:720,
  zoom:1,enableRotate:true
 }])assert.equal(normalizeEditorCameraState(invalid),null);
});
test('separar cámara de los proyectos normales, safe y recuperación',()=>{
 const source=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("const cameraKey=draftKey+'-camera-v1'"));
 assert.ok(source.includes("localStorage.setItem(cameraKey,JSON.stringify(state))"));
 assert.ok(source.includes("window.addEventListener('pagehide'"));
 assert.ok(source.includes("orbit.addEventListener('change'"));
 assert.ok(source.includes("live.editorCamera=currentEditorCamera()"));
 assert.ok(source.includes("restoreEditorCamera(x.editorCamera,{remember:true})"));
});
