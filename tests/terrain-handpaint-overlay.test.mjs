import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE,hardLightChannel,hardLightRGB}
 from '../terrain-handpaint-settings.mjs';
const moduleCode=readFileSync(new URL('../terrain-handpaint-overlay.mjs',import.meta.url),'utf8');
const rendererCode=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.equal(HANDPAINT_SOURCE,'./assets/terrain/texturas/terreno_handpaint_10K.png');
assert.equal(HANDPAINT_GPU_SOURCE,'./assets/terrain/texturas/terreno_handpaint_4K.webp');
assert.equal(HANDPAINT_OPACITY,0.65,'35% transparency must equal 65% opacity');
assert.equal(HANDPAINT_GPU_MAX_SIZE,4096,'Do not upload 10K raw texture to VRAM');
for(let x=0;x<=1;x+=0.1){
 assert.ok(Math.abs(hardLightChannel(x,0.5)-x)<1e-10,'Neutral grey remains neutral');
 assert.equal(hardLightChannel(x,0),0);
 assert.equal(hardLightChannel(x,1),1);
}
hardLightRGB([.2,.6,.9],[.5,.5,.5]).forEach((v,i)=>{
 assert.ok(Math.abs(v-[.2,.6,.9][i])<1e-12,'Neutral gray retains original RGB');
});
const green=hardLightRGB([.2,.5,.8],[.9,.1,.6]);
assert.ok(green[0]>.2&&green[1]<.5&&green[2]>.8);
assert.match(moduleCode,/abs\(gl_FragCoord\.z-visibleDepth\)>0\.00006/,'No paint over closer GLB meshes');
assert.match(moduleCode,/world\.x\/\$\{WORLD_SIZE\.toFixed\(1\)\}/,'World X used in the UV mapping');
assert.match(moduleCode,/world\.z\/\$\{WORLD_SIZE\.toFixed\(1\)\}/,'World Z used in the UV mapping');
assert.match(moduleCode,/renderer\.render\(scene,camera\); \/\/ One scene render/,'Do not render the world twice');
assert.match(moduleCode,/paintTexture\.wrapS=paintTexture\.wrapT=THREE\.ClampToEdgeWrapping/,'The image is NOT tiled');
assert.match(rendererCode,/handpaintOverlay\.render\(renderCamera\)/,'The overlay must run in editor and play');
assert.match(rendererCode,/light\.shadow\.autoUpdate=false/,'Global sun shadow caching preserved');
assert.match(rendererCode,/characterSun\.shadow\.autoUpdate=false/,'Player shadow throttling preserved');
console.log('PASS: Hard Light math, 35% transparency, non-tiled XZ projection, occlusion, shadow performance intact');
