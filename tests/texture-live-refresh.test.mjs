import assert from 'node:assert/strict';
import {revisionedTextureUrl,createTextureRevisionWatcher,TEXTURE_COMMITS_API}
 from '../editor-texture-live-refresh.mjs';

const source='./assets/terrain/texturas/Textura%20de%20Acantilado%20llanura%20%20CUERPO.png';
assert.equal(revisionedTextureUrl(source,'git-a1'),source+'?wt_texture_revision=git-a1');
assert.equal(revisionedTextureUrl(source+'?keep=1','git-b2'),
 source+'?keep=1&wt_texture_revision=git-b2');
const embedded='data:image/png;base64,AA==';
assert.equal(revisionedTextureUrl(embedded,'git-1'),embedded);
assert.equal(revisionedTextureUrl('https://example.com/a.png','git-1'),
 'https://example.com/a.png');
assert.equal(revisionedTextureUrl(source,''),source);
assert.ok(TEXTURE_COMMITS_API.includes('assets%2Fterrain%2Ftexturas'));

let commit='a'.repeat(40),online=true,requests=0,updates=[],messages=[];
const watcher=createTextureRevisionWatcher({
 request:async(url,options)=>{
  requests++;
  assert.equal(url,TEXTURE_COMMITS_API);
  assert.equal(options.cache,'no-store');
  if(!online)throw Error('offline');
  return {ok:true,json:async()=>[{sha:commit}]};
 },
 onRevision:rev=>updates.push(rev),
 onStatus:msg=>messages.push(msg),
 host:null,page:null
});
assert.equal(watcher.getRevision(),'editor-0.9.107');
assert.equal(await watcher.check(true),true);
assert.equal(watcher.getRevision(),'git-'+commit.slice(0,16));
assert.equal(updates.length,1);
assert.equal(await watcher.check(true),false);
assert.equal(updates.length,1,'Unchanged commit must NOT reload all textures');
commit='b'.repeat(40);
assert.equal(await watcher.check(true),true);
assert.equal(updates.length,2,'New PNG commit invalidates the resource revision');
const manual=watcher.refreshNow();
assert.ok(manual.startsWith('manual-'));
assert.equal(updates.length,3,'Manual reload is effective without a new Git commit');
assert.ok(messages.some(m=>m.includes('recargadas')));
online=false;
assert.equal(await watcher.check(true),false,'Offline checks fail nonfatally');
assert.equal(updates.length,3,'Offline failure must preserve last working texture');
watcher.dispose();

const renderer=(await import('node:fs')).readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
assert.match(renderer,/img\.src=getTextureAssetUrl\(url\)/);
assert.match(renderer,/imageCache\.clear\(\);\s*heightCache\.clear\(\);\s*loaded\.clear\(\)/);
const biome=(await import('node:fs')).readFileSync(new URL('../editor-biome-textures.mjs',import.meta.url),'utf8');
assert.match(biome,/getTextureAssetUrl\(textureUrl\(t\)\)/);
assert.match(biome,/getTextureAssetUrl\(item\.image\|\|textureUrl\(file\)\)/);
assert.match(biome,/previewController\?\.refreshTexture\?\.\(\)/);
const editor=(await import('node:fs')).readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.match(editor,/textureRevisionWatcher\.start\(\)/);
assert.match(editor,/terrainPainter\?\.invalidateTextureImages\(\)/);
assert.match(editor,/textureTool\?\.refreshAssets\?\.\(\)/);
console.log('PASS: PNG commit tracking, same-filename cache bust, manual reload, non-mutating resource invalidation');
