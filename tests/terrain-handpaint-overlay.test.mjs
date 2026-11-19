import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_CONTRAST,
 HANDPAINT_GPU_MAX_SIZE,HANDPAINT_EDGE_FADE,
 HANDPAINT_SLOPE_START,HANDPAINT_SLOPE_END,
 overlayChannel,softOverlayRGB,handpaintEdgeFade,handpaintSlopeFade
} from '../terrain-handpaint-settings.mjs';
const controller=readFileSync(new URL('../terrain-handpaint-overlay.mjs',import.meta.url),'utf8');
const gpu=readFileSync(new URL('../editor-terrain-gpu-layers.mjs',import.meta.url),'utf8');
const painter=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.equal(HANDPAINT_SOURCE,'./assets/terrain/texturas/terreno_handpaint_10K.png');
assert.equal(HANDPAINT_GPU_SOURCE,'./assets/terrain/texturas/terreno_handpaint_4K.webp');
assert.equal(HANDPAINT_OPACITY,.5,'Requested Overlay layer opacity must be exactly 50%');
assert.equal(HANDPAINT_CONTRAST,.45,'Compress source brush contrast');
assert.equal(HANDPAINT_GPU_MAX_SIZE,4096);
assert.equal(HANDPAINT_EDGE_FADE,.06);
assert.equal(HANDPAINT_SLOPE_START,.70);assert.equal(HANDPAINT_SLOPE_END,.86);
for(const c of [0,.1,.3,.5,.7,1]){
 assert.ok(Math.abs(overlayChannel(c,.5)-c)<1e-12,'Neutral gray must not alter the terrain');
}
const base=[.2,.6,.8];
assert.deepEqual(softOverlayRGB(base,[1,1,1]),base,'Art white must remain neutral');
const black=softOverlayRGB(base,[0,0,0]);
black.forEach((v,i)=>assert.ok(v<base[i]&&v>base[i]*.7,'Black should gently enhance, not turn terrain black'));
const muted=softOverlayRGB(base,[.4,.4,.4]);
muted.forEach((v,i)=>assert.ok(v<=base[i]&&v>.75*base[i]));
for(const [u,v] of [[0,.5],[1,.5],[.5,0],[.5,1],[0,0],[1,1]])
 assert.equal(handpaintEdgeFade(u,v),0,'All four edges must fade completely');
assert.equal(handpaintEdgeFade(.5,.5),1);
assert.ok(handpaintEdgeFade(.03,.5)>.4&&handpaintEdgeFade(.03,.5)<.6);
assert.equal(handpaintSlopeFade(0),0,'No painted vertical cliff');
assert.equal(handpaintSlopeFade(.6),0,'No painted very steep wall');
assert.equal(handpaintSlopeFade(1),1,'Paint visible on horizontal ground');
assert.match(gpu,/const GLOBAL_HANDPAINT_GLSL=/);
assert.match(gpu,/paintOverlayColor\(mix\(ground,wallGround,wallMix\)\)/);
assert.match(gpu,/paintOverlayColor\(premultiplied\/max\(combinedAlpha/);
assert.match(gpu,/vTerrainWorld\.x\/630\.0/);
assert.match(gpu,/vTerrainWorld\.z\/630\.0/);
assert.match(gpu,/dFdx\(vTerrainWorld\)/);
assert.match(gpu,/dFdy\(vTerrainWorld\)/);
assert.match(gpu,/flatMask=smoothstep\(0\.70,0\.86/);
assert.match(gpu,/edgeFade=smoothstep\(0\.0,0\.06/);
assert.match(gpu,/globalHandpaintOpacity:\{value:0\.50\}/);
assert.match(gpu,/globalHandpaintContrast:\{value:0\.45\}/);
assert.match(gpu,/extensions:\{derivatives:true\}/);
assert.match(painter,/getHandpaintTexture/);
assert.match(painter,/setHandpaintTexture/);
assert.match(editor,/handpaintOverlay\.subscribe\(texture=>terrainPainter\?\.setHandpaintTexture\(texture\)\)/);
assert.match(editor,/getHandpaintTexture:\(\)=>handpaintOverlay\.getTexture\(\)/);
assert.match(controller,/renderer\.render\(scene,camera\)/,'One normal scene render');
assert.doesNotMatch(controller,/new THREE\.WebGLRenderTarget|new THREE\.DepthTexture/,'No fullscreen buffers');
assert.doesNotMatch(controller,/renderer\.setRenderTarget\(/,'Never change the render target');
assert.doesNotMatch(controller,/renderer\.render\(quadScene/,'No extra fullscreen quad');
assert.match(editor,/light\.shadow\.autoUpdate=false/,'Global sunlight shadow cache preserved');
assert.match(editor,/characterSun\.shadow\.autoUpdate=false/,'Character shadow throttle preserved');
console.log('PASS: 50% Overlay, gentle color reinforcement, edge fade, no cliffs or additional render pass');
