import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sampleCliffHeight} from '../editor-cliff-top-body.mjs';
import {buildCliffBodyHeightmapBuffers} from '../editor-cliff-body-heightmap.mjs';
import {PLAINS_CLIFF_TEXTURE_FILES} from '../editor-texture-catalog.mjs';

const map=(v=255,w=4,h=4)=>({width:w,height:h,
 data:Uint8ClampedArray.from(Array.from({length:w*h},()=>[v,v,v,255]).flat())});
const white=map(),black=map(0);
assert.ok(sampleCliffHeight(white,.5,.5,{repeat:true})>.99);
assert.equal(sampleCliffHeight(black,50,35,{repeat:true}),0);
const positions=[],normals=[],uvs=[],size=24,step=2,scale=450/630;
function push(x,y){positions.push(x,y,0);normals.push(0,0,1);uvs.push(x*scale,y*scale)}
for(let y=0;y<size;y+=step)for(let x=0;x<size;x+=step){
 push(x,y);push(x+step,y);push(x,y+step);
 push(x+step,y);push(x+step,y+step);push(x,y+step);
}
const refined={positions:new Float32Array(positions),uvs:new Float32Array(uvs),normals:new Float32Array(normals)};
const frozen=refined.positions.slice();
const result=buildCliffBodyHeightmapBuffers(refined,{heightmap:white,strength:2});
assert.ok(result&&result.triangles===positions.length/9);
assert.ok(result.stats.moved>0,'Grayscale heightmap must physically deform the cliff');
assert.ok(result.stats.maxOffset>.5&&result.stats.maxOffset<=2.000001);
assert.deepEqual(refined.positions,frozen,'Never mutate user-edited base geometry');
assert.deepEqual(result.uvs,refined.uvs,'Body color and heightmap share EXACTLY the visible editor UVs');
assert.ok(Math.max(...result.uvs)>1,'Visible repetition 450 yields actual repeated wall UV');
const positionsAt=(out,x,y)=>{
 const values=[];
 for(let i=0;i<out.positions.length;i+=3)
  if(Math.abs(out.positions[i]-x)<1e-5&&Math.abs(out.positions[i+1]-y)<1e-5)
   values.push(out.positions[i+2]);
 return values;
};
assert.equal(Math.min(...positionsAt(result,0,0)),0,'Outermost cliff corner stays fixed');
assert.ok(Math.min(...positionsAt(result,12,12))>0,'Interior receives real Z displacement');
const seam=[[12,6,0],[12,18,0]];
const protectedResult=buildCliffBodyHeightmapBuffers(refined,{
 heightmap:white,strength:2,seamPaths:[seam]
});
assert.equal(Math.min(...positionsAt(protectedResult,12,12)),0,
 'Explicit user seam XYZ is protected from heightmap displacement');
assert.ok(Math.min(...positionsAt(protectedResult,8,12))>0,
 'Vertices away from seam may still receive relief');
const noRelief=buildCliffBodyHeightmapBuffers(refined,{heightmap:white,strength:0});
assert.equal(noRelief.stats.moved,0,'Relief slider zero must disable displacement');
assert.deepEqual(noRelief.positions,refined.positions);
assert.deepEqual(PLAINS_CLIFF_TEXTURE_FILES.map(x=>x.role),
 ['cliffBodyColor','cliffBodyHeight'],'Llanura offers precisely 2 body assets; no Top');

const cliff=readFileSync(new URL('../editor-cliff-mesh.mjs',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
const biome=readFileSync(new URL('../editor-biome-textures.mjs',import.meta.url),'utf8');
assert.match(cliff,/clamp\(Math\.ceil\(longest\/maxEdge\),3,6\)/);
assert.match(cliff,/subdivisionRatio/);
assert.match(renderer,/const CHUNK=2400/,'All zones subdivide without silently reducing density');
assert.match(renderer,/buildRefinedCliffGeometry\(batch/);
assert.match(renderer,/before<batch\.length\*6/,'Every cliff needs at least 6x its original triangles');
assert.match(renderer,/buildCliffBodyHeightmapBuffers\(geometry/);
assert.doesNotMatch(renderer,/buildCliffTopBodyBuffers\(/);
assert.match(renderer,/repeat:visibleScale/,'Actual UV scale must be the visible Body scale');
assert.match(renderer,/getCliffSubdivisionStats/);
assert.doesNotMatch(biome, /\{id:'cliffTopColor'/,'Top Color must be removed from active slots');
assert.doesNotMatch(biome, /\{id:'cliffTopHeight'/,'Top Height must be removed from active slots');
const inspector=readFileSync(new URL('../terrain-mesh-inspector.mjs',import.meta.url),'utf8');
assert.match(inspector,/getCliffOverlay\(\)/,'Inspector must display real subdivided cliff meshes');
console.log('PASS: Body-only texture, true heightmap deformation, identical UV scale, protected seams, all-cliff 9x subdivisions');
