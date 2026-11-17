import assert from 'node:assert/strict';
import {buildCliffHeightmapGeometry} from '../cliff-heightmap-geometry.mjs';
const wall={positions:Float32Array.from([
 -12,0,0, 12,0,0, -12,20,0, 12,20,0
]),indices:Uint16Array.from([0,1,2,1,3,2]),colors:new Float32Array(12).fill(.7),
 uvs:Float32Array.from([0,0,1,0,0,1,1,1])};
const sample=(u,v)=>.5+.42*Math.sin(9.7*u+3.2*v);
const options={point:{x:0,z:0},normalXZ:[0,1],radius:32,strength:4,period:24,steps:2,sample};
const result=buildCliffHeightmapGeometry(wall,options);
assert.ok(result,'A steep selected wall must create a result');
assert.ok(result.stats.subdivided>0,'Wall triangles must subdivide');
assert.ok(result.stats.moved>0,'Heightmap must physically displace vertices');
assert.ok(result.stats.triangles>2,'The output must contain new mesh triangles');
assert.equal(result.positions.length/3,result.colors.length/3);
assert.equal(result.positions.length/3,result.uvs.length/2);
assert.ok([...result.positions].every(Number.isFinite));
for(let i=0;i<wall.positions.length;i++)
 assert.equal(result.positions[i],wall.positions[i],'Original boundary/seam vertex must remain fixed');
assert.ok([...result.positions].some((v,i)=>i%3===2&&Math.abs(v)>.01),
 'The heightmap must change real wall Z coordinates, not just material pixels');
const plain={...wall,positions:Float32Array.from([-12,0,-12,12,0,-12,-12,0,12,12,0,12])};
assert.equal(buildCliffHeightmapGeometry(plain,options),null,
 'Flat soil must never be displaced as a cliff');
const far=buildCliffHeightmapGeometry(wall,{...options,point:{x:280,z:280}});
assert.equal(far,null,'An unselected remote wall must not change');
const zero=buildCliffHeightmapGeometry(wall,{...options,sample:()=>.5});
assert.ok(zero&&zero.stats.subdivided>0,'Every marked wall must subdivide, even with a perfectly flat heightmap');
assert.equal(zero.stats.moved,0,'A flat heightmap should not displace newly created vertices');
assert.deepEqual([...zero.indices],[...result.indices],'Heightmap contrast must not determine tessellation');
assert.equal(zero.stats.vertices,result.stats.vertices,'Vertex density must be independent of image intensities');
const allWhite=buildCliffHeightmapGeometry(wall,{...options,sample:()=>1});
assert.deepEqual([...allWhite.indices],[...result.indices],'Uniform bright heightmaps must produce the same mesh topology');
assert.ok(allWhite.stats.moved>0,'Bright heightmap still displaces after uniform subdivision');
let reads=0;
const counted=buildCliffHeightmapGeometry(wall,{...options,sample:(u,v)=>{reads++;return .5}});
assert.ok(counted?.stats.subdivided>0&&reads>0,'Subdivision is performed before height sampling');
const rectangular=[{x:-14,z:-4},{x:14,z:-4},{x:14,z:4},{x:-14,z:4}];
const restricted=buildCliffHeightmapGeometry(wall,{...options,zonePoints:rectangular});
assert.ok(restricted?.stats.moved>0,'A marked polygon must displace real cliff triangles');
const outside=[{x:150,z:150},{x:170,z:150},{x:170,z:170},{x:150,z:170}];
assert.equal(buildCliffHeightmapGeometry(wall,{...options,zonePoints:outside}),null,
 'Cliff map must never deform terrain outside marked zone polygons');
console.log('PASS physical heightmap: localized wall-only mesh displacement, UNIFORM tessellation independent of heightmap intensities, seam boundaries');
