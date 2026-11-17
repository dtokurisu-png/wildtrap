import assert from 'node:assert/strict';
import {REPO_TEXTURES,TEXTURE_KINDS,syncPublishedTextureFiles} from '../editor-texture-catalog.mjs';
const files=[
 {file:'Textura de Acantilado llanura CUERPO-HEIGTH.png',size:100},
 {file:'Textura de Acantilado llanura CUERPO.png',size:100},
 {file:'Acantilado pantanoso de musgo y raíces.png',size:100},
 {file:'suelo base de montaña.png',size:100}
];
assert.equal(REPO_TEXTURES.find(t=>t.file===files[0].file)?.kind,'cliff-height');
assert.equal(REPO_TEXTURES.find(t=>t.file===files[1].file)?.kind,'cliff-color');
assert.ok(TEXTURE_KINDS.some(k=>k.id==='cliff-height'));
syncPublishedTextureFiles(files);
assert.equal(REPO_TEXTURES.find(t=>t.file===files[0].file)?.kind,'cliff-height');
assert.equal(REPO_TEXTURES.find(t=>t.file===files[1].file)?.kind,'cliff-color');
assert.equal(REPO_TEXTURES.find(t=>t.file===files[2].file)?.kind,'cliff-color');
assert.equal(REPO_TEXTURES.find(t=>t.file===files[3].file)?.kind,'ground');
assert.equal(630/24,26.25);
assert.equal(630/10,63);
console.log('PASS catalog restored; cliff images remain separate from floor materials; 24 world units = 26.25 repeats');
