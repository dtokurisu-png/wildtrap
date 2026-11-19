import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 HANDPAINT_SOURCE,HANDPAINT_GPU_SOURCE,HANDPAINT_OPACITY,HANDPAINT_GPU_MAX_SIZE,
 HANDPAINT_EDGE_FADE,HANDPAINT_SLOPE_START,HANDPAINT_SLOPE_END,
 darkOnlyRGB,handpaintEdgeFade,handpaintSlopeFade
} from '../terrain-handpaint-settings.mjs';
const source=readFileSync(new URL('../terrain-handpaint-overlay.mjs',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.equal(HANDPAINT_SOURCE,'./assets/terrain/texturas/terreno_handpaint_10K.png');
assert.equal(HANDPAINT_GPU_SOURCE,'./assets/terrain/texturas/terreno_handpaint_4K.webp');
assert.equal(HANDPAINT_OPACITY,0.65,'35% transparency = 65% opacity');
assert.equal(HANDPAINT_GPU_MAX_SIZE,4096);
assert.equal(HANDPAINT_EDGE_FADE,0.06);
assert.equal(HANDPAINT_SLOPE_START,0.70);
assert.equal(HANDPAINT_SLOPE_END,0.86);
const base=[0.2,0.6,0.9];
assert.deepEqual(darkOnlyRGB(base,[1,1,1]),base,'Pure whites MUST be completely invisible');
darkOnlyRGB(base,[0,0,0]).forEach((channel,i)=>{
 assert.ok(Math.abs(channel-base[i]*0.35)<1e-12,'Black pigment must darken by 65%');
});
const gray=darkOnlyRGB(base,[0.5,0.5,0.5]);
gray.forEach((channel,i)=>assert.ok(channel<base[i]&&channel>base[i]*0.35));
for(const edge of [[0,.5],[1,.5],[.5,0],[.5,1],[0,0],[1,1]]){
 assert.equal(handpaintEdgeFade(...edge),0,'Every art border should fade to transparency');
}
assert.equal(handpaintEdgeFade(.5,.5),1);
assert.ok(handpaintEdgeFade(.02,.5)>0&&handpaintEdgeFade(.02,.5)<1);
assert.equal(handpaintSlopeFade(0),0,'Vertical cliff must not receive paint');
assert.equal(handpaintSlopeFade(.6),0,'Very steep slope must not receive paint');
assert.equal(handpaintSlopeFade(1),1,'Walkable ground must receive paint');
assert.ok(handpaintSlopeFade(.77)>0&&handpaintSlopeFade(.77)<1);
assert.match(source,/dFdx\(vWorldPos\)/,'Calculate real face normal without relying on missing cliff normals');
assert.match(source,/dFdy\(vWorldPos\)/);
assert.match(source,/float flatMask=smoothstep/,'Cliff exclusion exists');
assert.match(source,/float edgeFade=smoothstep/,'All-border gradient exists');
assert.match(source,/vec3 darkened=sceneSRGB\*paintSRGB/,'White-neutral multiply compositing exists');
assert.match(source,/depthEpsilon=mix\(0\.00035,0\.00005/,'Grazing angle depth tolerance exists');
assert.match(source,/visibleDepth\+depthEpsilon<gl_FragCoord\.z/);
assert.doesNotMatch(source,/vec3 hardLight\(/,'No symmetric white-brightening blend in shader');
assert.doesNotMatch(source,/#include <colorspace_pars_fragment>/,'No duplicate Three.js GLSL functions');
assert.match(source,/paintTexture\.wrapS=paintTexture\.wrapT=THREE\.ClampToEdgeWrapping/);
assert.match(renderer,/handpaintOverlay\.render\(renderCamera\)/,'Editor and play both use overlay');
assert.match(renderer,/light\.shadow\.autoUpdate=false/,'World shadow map cached');
assert.match(renderer,/characterSun\.shadow\.autoUpdate=false/,'Explorer shadow throttle preserved');
console.log('PASS: black-only art, completely neutral whites, four-edge fade, cliff exclusion, grazing camera tolerance');
