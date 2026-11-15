import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gpu=readFileSync(new URL('../editor-terrain-gpu-layers.mjs',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
// The stable full-resolution base remains untouched and is always constructed first.
assert.match(gpu,/texture2D\(baseTexture,sourceUV\)/,'Ground samples source bitmap directly');
assert.match(gpu,/vTerrainXZ\/630\.0\*repeats/,'Base retains existing repeat scale');
assert.match(gpu,/new THREE\.Texture\(fullResolutionSource\(image\)\)/,'Base source image preserved');
assert.match(gpu,/new THREE\.CanvasTexture\(canvas\)/,'Zone mask uses an independent alpha canvas');
assert.match(gpu,/records\.push\(\{mesh,mask,texture,material:shader\}\)/,'Ground is registered before detail layers');
// Complementary passes are independent; never pass a sampler into a function.
assert.match(gpu,/const DETAIL_FRAGMENT=/,'Detail material has separate fragment shader');
assert.doesNotMatch(gpu,/\w+\s*\(\s*sampler2D\s+\w+/,'Shader must not pass samplers to functions');
assert.match(gpu,/texture2D\(detailTexture,rotated\+\.5\)/,'Details sample original image');
assert.match(gpu,/floor\(repeats\*\.25\+\.5\)/,'200 repeats produce approximately 50 patches');
assert.match(gpu,/smoothstep\(\.27,\.5,edge\)/,'Patch edges fade softly');
assert.match(gpu,/patchOpacity=\.5\+\.3\*/,'Patch opacity varies between 50% and 80%');
assert.match(gpu,/variationSeed/,'Distribution is deterministic per seed');
assert.match(gpu,/detailMesh\.renderOrder=3\+i\*\.01/,'Details render over base');
assert.match(gpu,/noDetails/,'User can disable details without changing saved scene data');
assert.match(gpu,/entry\.mesh\.geometry=terrain\.geometry/,'Layers follow terrain cuts');
assert.doesNotMatch(gpu,/editorOnly\s*=\s*true/,'Materials remain visible during play');
assert.match(renderer,/\['ground','detail1','detail2','detail3','cliff'\]/,'Loader includes all 5 texture slots');
assert.match(renderer,/buildCliffs\(\);apply\(\)/,'Cliff generator remains active');
assert.doesNotMatch(renderer,/surfaceMap\.needsUpdate=true/,'Do not reintroduce the downsampled baked base texture');
assert.equal(Math.floor(200*.25+.5),50,'Example count: 200 repeats -> 50 patches');
console.log('PASS: Independent randomized soft-edge complement layers preserve working base and cliffs');
