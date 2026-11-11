import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PREFABS} from '../prefab-catalog.mjs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const gallery=fs.readFileSync(new URL('../prefab-gallery.mjs',import.meta.url),'utf8');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const choices=[...html.matchAll(/data-prefab-choice="([^"]+)"/g)].map(m=>m[1]);
const previewImages=[...html.matchAll(/data-prefab-preview="([^"]+)"/g)].map(m=>m[1]);
const viewButtons=[...html.matchAll(/data-preview-view="([^"]+)"/g)].map(m=>m[1]);

test('el botón abre un modal oculto con cierre accesible',()=>{
 assert.ok(html.includes('id="openPrefabGallery"'));
 assert.ok(!html.includes('data-tool="prefab"'));
 assert.ok(html.includes('id="prefabModal" hidden role="dialog" aria-modal="true"'));
 assert.ok(html.includes('id="closePrefabGallery"'));
 assert.ok(html.includes('id="prefabGalleryTitle"'));
 assert.ok(html.includes('#prefabModal[hidden]'));
 assert.ok(editor.includes("prefabGallery.open()"));
 assert.ok(gallery.includes('root.hidden=false'));
 assert.ok(gallery.includes('root.hidden=true'));
});

test('muestra exactamente los cuatro modelos originales y una imagen por modelo',()=>{
 assert.deepEqual(choices,PREFABS.map(p=>p.id));
 assert.deepEqual(previewImages,choices);
 assert.equal(choices.length,4);
 assert.equal(new Set(choices).size,4);
 assert.ok(gallery.includes('library.instance('),'La imagen debe provenir del GLB real');
 assert.ok(gallery.includes(".toDataURL('image/png')"),'La vista debe convertirse en imagen');
 assert.ok(gallery.includes("cached.set(key,url)"),'No recalcular todas las vistas en cada apertura');
});
test('permite perspectiva, frente, lado, atrás y vista superior',()=>{
 assert.deepEqual(viewButtons,['iso','front','side','back','top']);
 for(const id of viewButtons)assert.ok(gallery.includes(id+':'),'Falta configuración de '+id);
 assert.ok(gallery.includes('aria-pressed'));
 assert.ok(html.includes('alt="Vista previa 3D de'));
});

test('al elegir una tarjeta cierra el modal y activa el modo de colocación',()=>{
 assert.ok(gallery.includes('close();'));
 assert.ok(gallery.includes('onPick(id)'));
 assert.ok(editor.includes("const prefabGallery=createPrefabGallery("));
 assert.ok(editor.includes("onPick:id=>{"));
 assert.ok(editor.includes("$('prefabType').value=id;"));
 assert.ok(editor.includes("setMode('prefab')"));
 assert.ok(editor.includes("if(mode==='prefab')"));
 assert.ok(editor.includes("addNode({kind:'prefab',prefabId,x,z"));
});

test('no introduce IDs duplicados ni altera las herramientas existentes',()=>{
 assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);
 assert.ok(editor.includes("function brush(x,z)"));
 assert.ok(editor.includes("mode==='holePaint'"));
 assert.ok(editor.includes("marqueeHits("));
 assert.ok(editor.includes("createPlaytest("));
 assert.ok(editor.includes("localStorage.setItem("));
});
