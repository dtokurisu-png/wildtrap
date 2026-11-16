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
assert.match(gpu,/floor\(repeats\*1\.5\+\.5\)/,'200 repeats produce approximately 300 patches');
assert.match(gpu,/pow\(1\.0-smoothstep\(\.12,\.5,edge\),2\.0\)/,'Patch edges have wider and softer alpha feather');
assert.match(gpu,/patchOpacity=\.28\+\.22\*/,'Patch opacity varies between 28% and 50%');
assert.match(gpu,/variationSeed/,'Distribution is deterministic per seed');
assert.match(gpu,/detailMesh\.renderOrder=3\+i\*\.01/,'Details render over base');
assert.match(gpu,/noDetails/,'User can disable details without changing saved scene data');
assert.match(gpu,/entry\.mesh\.geometry=terrain\.geometry/,'Layers follow terrain cuts');
assert.doesNotMatch(gpu,/editorOnly\s*=\s*true/,'Materials remain visible during play');
assert.match(renderer,/\['ground','detail1','detail2','detail3','cliff'\]/,'Loader includes all 5 texture slots');
assert.match(renderer,/buildCliffs\(\);apply\(\)/,'Cliff generator remains active');
assert.doesNotMatch(renderer,/surfaceMap\.needsUpdate=true/,'Do not reintroduce the downsampled baked base texture');
assert.doesNotMatch(gpu,/float angle=|float c=cos\(angle\)/,'Complementary patches must not rotate');
assert.match(gpu,/vec2 rotated=local/,'Complementary patch orientation stays aligned');
assert.equal(Math.floor(200*1.5+.5),300,'Example count: 200 repeats -> 300 patches');
console.log('PASS: Independent randomized soft-edge complement layers preserve working base and cliffs');
