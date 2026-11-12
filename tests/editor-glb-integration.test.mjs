import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PREFABS,prefabById} from '../prefab-catalog.mjs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const world=JSON.parse(fs.readFileSync(new URL('../assets/terrain/wildtrap-world.json',import.meta.url),'utf8'));
const controlIds=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const refs=[...code.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
const workspace=fs.readFileSync(new URL('../editor-workspace.js',import.meta.url),'utf8');
const dynamicallyCreatedIds=[...workspace.matchAll(/\.id='([^']+)'/g)].map(m=>m[1]);

test('biblioteca contiene exactamente una montaña y tres cuevas GLB existentes',()=>{
 assert.equal(PREFABS.length,4);
 for(const p of PREFABS){
  assert.equal(prefabById(p.id),p);
  assert.ok(fs.existsSync(new URL('../assets/terrain/'+p.file,import.meta.url)),p.file);
  assert.ok(fs.statSync(new URL('../assets/terrain/'+p.file,import.meta.url)).size>1024,p.file);
  assert.ok(html.includes('data-prefab-choice="'+p.id+'"'));
 }
});
test('sin control roto, botones duplicados ni paneles antiguos',()=>{
 assert.deepEqual(controlIds.filter((id,i)=>controlIds.indexOf(id)!==i),[]);
 assert.deepEqual([...new Set(refs.filter(id=>
  !controlIds.includes(id)&&!dynamicallyCreatedIds.includes(id)))],[],
  'Los controles deben existir en HTML o ser creados en el workspace al arrancar');
 assert.ok(!html.includes('Importar mapa de alturas'));
 assert.ok(!html.includes('Cueva bajo el terreno'));
 assert.ok(!html.includes('Fase 1'));
 assert.ok(!html.includes('data-tool="select"'));
 assert.ok(!html.includes('data-tool="cave"'));
 assert.ok(!html.includes('data-tool="mountain"'));
});
test('selección rápida y múltiple, herramientas del terreno y GLB',()=>{
 assert.ok(code.includes('selectedIds'));
 assert.ok(code.includes("e.ctrlKey"));
 assert.ok(code.includes('marqueeHits('));
 assert.ok(code.includes("e.button!==2"));
 assert.ok(code.includes("mode==='move'"));
 assert.ok(code.includes("mode==='holePaint'"));
 assert.ok(code.includes("function brush(x,z)"));
 assert.ok(code.includes("prefabLibrary?.instance(appearance,heightAt"),
  'El editor debe crear instancias independientes, con INT solo como apariencia del editor');
 assert.ok(html.includes('id="selectionMarquee"'));
 assert.ok(html.includes('id="applyPrefab"'));
 assert.ok(html.includes('id="duplicatePrefab"'));
});
test('mapa oficial publicado sirve como puente hacia el futuro juego',()=>{
 assert.equal(world.size,630);
 assert.equal(world.resolution,129);
 assert.equal(world.heights.length,129*129);
 assert.ok(Array.isArray(world.nodes));
 assert.deepEqual(world.worldManifest.prefabs.map(x=>x.id),PREFABS.map(p=>p.id));
 assert.ok(code.includes('wildtrap-world.json'));
 assert.ok(code.includes("localStorage.setItem("));
 assert.ok(code.includes("JSON.stringify(live)"));
});
