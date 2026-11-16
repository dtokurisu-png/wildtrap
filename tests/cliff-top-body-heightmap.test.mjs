import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sampleCliffHeight,buildCliffTopBodyBuffers,PLAINS_CLIFF_DEFAULTS} from '../editor-cliff-top-body.mjs';
import {PLAINS_CLIFF_MAPS} from '../editor-texture-catalog.mjs';

const make=(v,w=4,h=4)=>({width:w,height:h,data:Uint8ClampedArray.from(
 Array.from({length:w*h},()=>[v,v,v,255]).flat())});
const white=make(255),black=make(0);
assert.ok(sampleCliffHeight(white,.25,.25)>.99);
assert.equal(sampleCliffHeight(black,.25,.25),0);
const variant={width:2,height:2,data:new Uint8ClampedArray([
 255,255,255,255, 0,0,0,255,
 0,0,0,255, 255,255,255,255
])};
assert.ok(sampleCliffHeight(variant,0,1)>1-1e-10);
assert.ok(sampleCliffHeight(variant,1,0)>1-1e-10);
assert.ok(sampleCliffHeight(variant,1,1,{repeat:true})>1-1e-10,
 'Repeating body wraps back to the top-left pixel');
assert.equal(sampleCliffHeight(variant,1,1,{repeat:false}),0,
 'Top UV is clamped, never repeated');

const positions=[],normals=[];
const edge=4,cols=11,rows=15;
function v(x,y){positions.push(x*edge,y*2.5,0);normals.push(0,0,1)}
for(let z=0;z<rows-1;z++)for(let x=0;x<cols-1;x++){
 v(x,z);v(x+1,z);v(x,z+1);
 v(x+1,z);v(x+1,z+1);v(x,z+1);
}
const baseline={positions:new Float32Array(positions),normals:new Float32Array(normals)};
const frozen=baseline.positions.slice();
const settings={topHeight:white,bodyHeight:white,strength:2,topFraction:.23,bodyTileHeight:8};
const res=buildCliffTopBodyBuffers(baseline,settings);
assert.ok(res.top&&res.body,'Top and Body must produce two distinct meshes');
assert.ok(res.stats.topTriangles>0&&res.stats.bodyTriangles>0);
assert.ok(res.stats.moved>0,'Real XYZ positions must be displaced');
assert.ok(res.stats.maxOffset>1.5&&res.stats.maxOffset<=2+1e-6);
assert.deepEqual(baseline.positions,frozen,'Do not modify source terrain geometry');
const topUV=res.top.uvs,bodyUV=res.body.uvs;
assert.ok(Math.min(...topUV)>=0&&Math.max(...topUV)<=1,'Top color and heightmap never repeat');
assert.ok(Math.max(...bodyUV)>1,'Body UV must repeat when cliff is taller than one body tile');
const all=[...res.top.positions,...res.body.positions];
assert.ok(all.some((v,i)=>i%3===2&&v>.25),'Heightmap actually displaces the wall on normal Z');
assert.ok(all.every(Number.isFinite),'All coordinates must remain finite');
function minDiff(mesh,p){
 let best=Infinity;
 for(let i=0;i<mesh.positions.length;i+=3){
  const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
  if(Math.hypot(x-p[0],y-p[1])<1e-5)best=Math.min(best,Math.abs(z-p[2]));
 }
 return best;
}
assert.equal(Math.min(minDiff(res.top,[0,35,0]),minDiff(res.body,[0,35,0])),0,
 'Outer top seam is fixed');
assert.equal(Math.min(minDiff(res.top,[40,0,0]),minDiff(res.body,[40,0,0])),0,
 'Outer bottom seam is fixed');
const protectedSegment=[[12,15,0],[28,15,0]];
const seamed=buildCliffTopBodyBuffers(baseline,{
 ...settings,seamPaths:[protectedSegment]
});
const loose=buildCliffTopBodyBuffers(baseline,settings);
assert.ok(seamed.stats.moved>0,'Other interior areas still deform');
function minNearZ(result,x,y){
 const arr=[result.top,result.body],zs=[];
 for(const part of arr)if(part)for(let i=0;i<part.positions.length;i+=3)
  if(Math.abs(part.positions[i]-x)<1e-4&&Math.abs(part.positions[i+1]-y)<1e-4)
   zs.push(part.positions[i+2]);
 return zs.length?Math.min(...zs):NaN;
}
assert.equal(minNearZ(seamed,20,15),0,'Explicit protected seam points cannot be displaced');
assert.ok(minNearZ(loose,20,15)>0,'Without protected seam, same vertex gains geometry');
const none=buildCliffTopBodyBuffers({positions:new Float32Array([0,0,0,1,0,0,0,0,1]),
 normals:new Float32Array([0,1,0,0,1,0,0,1,0])},{topHeight:white,bodyHeight:white});
assert.equal(none.top,null,'Flat surfaces should not be carved as cliffs');

for(const k of ['topColor','topHeight','bodyColor','bodyHeight'])
 assert.ok(PLAINS_CLIFF_MAPS[k]?.endsWith('.png'),'Missing repo image '+k);
const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
assert.match(renderer,/buildCliffTopBodyBuffers\(geometry/);
assert.match(renderer,/PlainsCliff_/);
assert.match(renderer,/collisionRoot:\(\)=>cliffLayer/);
assert.match(renderer,/tex\.wrapS=tex\.wrapT=repeat\?THREE\.RepeatWrapping:THREE\.ClampToEdgeWrapping/);
const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.match(editor,/collisionRoots:\(\)=>\[surface,cavePiecesLayer,interiors,terrainPainter\?\.collisionRoot\(\)\]/);
console.log('PASS: Top one-shot UVs, Body tile UVs, true height displacement, source mesh untouched, user seams fixed and collision root connected');
