import assert from 'node:assert/strict';
import {revisionedTextureUrl,createTextureRevisionWatcher,TEXTURE_COMMITS_API}
 from '../editor-texture-live-refresh.mjs';
import {syncPublishedTextureCatalog,syncPublishedTextureFiles,isPublishedTextureUrl,
 REPO_TEXTURES,textureUrl,TEXTURE_TREE_API} from '../editor-texture-catalog.mjs';

const source='./assets/terrain/texturas/suelo%20base%20de%20llanura_Cesped_Natural_8K_Seamless.png';
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
assert.equal(watcher.getRevision(),'editor-0.9.109');
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

// Replacing files in GitHub can also ADD or DELETE names, not just bytes.
// Never keep deleted images in the live picker or hide newly uploaded art.
const original=REPO_TEXTURES.map(x=>({file:x.file,size:x.size}));
const gone='suelo base de montaña.png';
const fresh='suelo base de prueba.png';
const listing=original.filter(x=>x.file!==gone).concat([{file:fresh,size:2965478}]);
const changes=syncPublishedTextureFiles(listing);
assert.equal(changes.added,1);
assert.ok(changes.removedNames.includes(gone));
assert.ok(REPO_TEXTURES.some(x=>x.file===fresh&&x.kind==='ground'),
 'A new ground material should appear in the repository catalog');
assert.equal(isPublishedTextureUrl(textureUrl({file:gone})),false,
 'A removed image must be flagged missing, not served from a stale cache');
assert.equal(isPublishedTextureUrl(textureUrl({file:fresh})),true);
assert.equal(isPublishedTextureUrl('data:image/png;base64,AA=='),true,
 'User-owned data URLs must never be invalidated');
const treeResult=await syncPublishedTextureCatalog(async(url,options)=>{
 assert.equal(url,TEXTURE_TREE_API);
 assert.equal(options.cache,'no-store');
 return {ok:true,json:async()=>({truncated:false,tree:[
  {type:'blob',path:'assets/terrain/texturas/'+fresh,size:2965478},
  {type:'blob',path:'src/not-an-image.txt',size:300}
 ]})};
});
assert.equal(treeResult.total,1);
assert.equal(REPO_TEXTURES[0].file,fresh);
assert.ok(!REPO_TEXTURES.some(x=>x.file===gone));

const renderer=(await import('node:fs')).readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
assert.match(renderer,/img\.src=getTextureAssetUrl\(url\)/);
assert.match(renderer,/cache\.clear\(\);loaded\.clear\(\)/);
const biome=(await import('node:fs')).readFileSync(new URL('../editor-biome-textures.mjs',import.meta.url),'utf8');
assert.match(biome,/getTextureAssetUrl\(textureUrl\(t\)\)/);
assert.match(biome,/getTextureAssetUrl\(item\.image\)/);
assert.match(biome,/previewController\?\.refreshTexture\?\.\(\)/);
const editor=(await import('node:fs')).readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.match(editor,/textureRevisionWatcher\.start\(\)/);
assert.match(editor,/terrainPainter\?\.invalidateTextureImages\(\)/);
assert.match(editor,/textureTool\?\.refreshAssets\?\.\(\)/);
console.log('PASS: PNG commit tracking, same-filename cache bust, manual reload, non-mutating resource invalidation');
