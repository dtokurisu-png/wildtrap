import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PREFABS,isFreeCave,prefabWorldY} from '../prefab-catalog.mjs';
import {altitudeFromVerticalDrag,translateNodeOnTerrain} from '../prefab-gestures.mjs';

const editor=fs.readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
const library=fs.readFileSync(new URL('../prefab-library.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const heightAt=(x,z)=>22+x*.25-z*.15;

test('solo las tres cuevas del catálogo tienen altura libre',()=>{
 assert.equal(PREFABS.length,4);
 for(const prefab of PREFABS){
  assert.equal(isFreeCave(prefab.id),prefab.id!=='mountain',prefab.id);
 }
 assert.equal(isFreeCave('cavePiece'),false);
 assert.equal(isFreeCave('tree'),false);
 assert.equal(isFreeCave('mountain'),false);
});

test('cueva nueva mantiene Y absoluta aunque cambie el relieve bajo ella',()=>{
 const cave={prefabId:'stone-cave',x:20,z:10,y:-35};
 assert.equal(prefabWorldY(cave,heightAt),-35);
 cave.x=50;cave.z=-40;
 assert.equal(prefabWorldY(cave,heightAt),-35);
 cave.y=320;
 assert.equal(prefabWorldY(cave,heightAt),320);
});

test('cueva anterior sin Y absoluta conserva inicialmente su altura relativa',()=>{
 const old={prefabId:'rocky-cave',x:25,z:10,offsetY:-40};
 const expected=heightAt(old.x,old.z)-40;
 assert.equal(prefabWorldY(old,heightAt),expected);
 const moved={...old,...translateNodeOnTerrain(old,40,-30,630),y:expected};
 assert.equal(prefabWorldY(moved,heightAt),expected);
});

test('la montaña nunca se despega de la superficie aunque tenga Y legado',()=>{
 const m={prefabId:'mountain',x:30,z:-20,y:-500,offsetY:30};
 assert.equal(prefabWorldY(m,heightAt),heightAt(30,-20));
 m.x=-30;m.z=45;
 assert.equal(prefabWorldY(m,heightAt),heightAt(-30,45));
});

test('Alt + Shift + arrastrar cambia solo la altura Y de las cuevas',()=>{
 assert.equal(altitudeFromVerticalDrag(-30,250,150),-5);
 assert.equal(altitudeFromVerticalDrag(-30,250,350),-55);
 assert.equal(altitudeFromVerticalDrag(-30,250,250),-30);
 assert.equal(altitudeFromVerticalDrag(-30,250,NaN),-30);
});

test('los GLB usan la altura independiente y el fantasma se muestra a través del terreno',()=>{
 assert.ok(library.includes('prefabWorldY(node,heightAt)'));
 assert.ok(library.includes('if(isFreeCave(id))m.depthTest=false'));
 assert.ok(editor.includes('placementWorldY=heightAt('));
 assert.ok(editor.includes('placementGhost.position.set(point.x,placementWorldY,point.z)'));
 assert.ok(editor.includes('...(isFreeCave(prefabId)?{y:'));
 assert.ok(editor.includes("isFreeCave(armedPrefabId)&&mode==='prefab'&&e.altKey"));
});

test('el movimiento y el editor de números no vuelven a anclar las cuevas',()=>{
 assert.ok(editor.includes('root.position.set(n.x,prefabWorldY(n,heightAt),n.z)'));
 assert.ok(editor.includes('original.y=prefabWorldY(n,heightAt)'));
 assert.ok(editor.includes("n.y=altitudeFromVerticalDrag("));
 assert.ok(editor.includes('if(isFreeCave(n.prefabId))n.y=worldY+heightDelta'));
 assert.ok(editor.includes("else delete n.y"));
 assert.ok(editor.includes("$('prefabOffsetY').disabled=!cave"));
 assert.ok(editor.includes("n.offsetY=0;"));
 assert.ok(html.includes('id="prefabHeightLabel"'));
 assert.ok(html.includes('Alt + rueda'));
 assert.ok(html.includes('Alt + Shift +'));
});

test('la altura absoluta se serializa junto al modelo sin alterar el GLB de origen',()=>{
 const node={kind:'prefab',prefabId:'stylized-cave',x:12,z:8,y:-50,rotation:1,scale:2,offsetY:0};
 const clone=JSON.parse(JSON.stringify(node));
 assert.deepEqual(clone,node);
 assert.equal(prefabWorldY(clone,heightAt),-50);
 assert.ok(editor.includes('JSON.stringify(live)'));
});
