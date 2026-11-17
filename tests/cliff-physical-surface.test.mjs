import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateCliffFaceMaskIndices,maskTerrainCliffFaces}
 from '../editor-cliff-surface-replacement.mjs';

const original=Uint16Array.from([0,1,2,0,2,3,1,4,2]);
const savedOriginal=original.slice();
const masked=calculateCliffFaceMaskIndices(original,5,new Set([1,99,-1]));
assert.deepEqual([...masked.remaining],[0,1,2,1,4,2]);
assert.equal(masked.removedFaces,1);
assert.equal(masked.sourceFaces,3);
assert.deepEqual(original,savedOriginal,'Do not alter original terrain triangle topology');
assert.equal(calculateCliffFaceMaskIndices(original,5,new Set()),null);
assert.deepEqual([...calculateCliffFaceMaskIndices(null,6,new Set([0])).remaining],
 [3,4,5],'Supports cut/restored, non-indexed terrain geometry');

class MockGeometry{
 constructor(){this.attributes={};this.index=null;this.userData={};this.boundingBox=null;this.boundingSphere=null}
 setAttribute(k,v){this.attributes[k]=v;return this}
 getAttribute(k){return this.attributes[k]}
 setIndex(v){this.index=v;return this}
 computeBoundingSphere(){this.boundingSphere={test:1}}
}
const THREE={BufferGeometry:MockGeometry,Uint32BufferAttribute:class{
 constructor(array,size){this.array=array;this.itemSize=size;this.count=array.length/size}
}};
const vertices={count:5,array:Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0,0,2,0])};
const colors={count:5};
const source=new MockGeometry();
source.setAttribute('position',vertices).setAttribute('color',colors);
source.index={count:original.length,array:original};
const result=maskTerrainCliffFaces(source,new Set([1]),THREE);
assert(result&&result!==source);
assert.equal(result.attributes.position,vertices,'Reuse source sculpt XYZ attributes without changing them');
assert.equal(result.attributes.color,colors,'Keep vertex colors on unmasked terrain');
assert.deepEqual([...result.index.array],[0,1,2,1,4,2]);
assert.deepEqual(source.index.array,savedOriginal);
assert.equal(result.userData.wildtrapCliffReplacedFaces,1);
assert.equal(result.userData.wildtrapSourceFaces,3);
assert.equal(result.userData.wildtrapRemainingFaces,2);
assert.equal(result.userData.wildtrapReplacement,true);

const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
assert.match(renderer,/const originalSurface=terrain\.geometry/,
 'Generate heightmap from the actual cut terrain topology, not an uncut heightfield');
assert.match(renderer,/const removedSourceFaces=new Set\(\)/,
 'Collect faces replaced by generated real cliff mesh');
assert.match(renderer,/maskTerrainCliffFaces\(originalSurface,removedSourceFaces,THREE\)/);
assert.match(renderer,/terrain\.geometry=replaced/);
assert.match(renderer,/terrain\.geometry=sourceCutGeometry\|\|terrainGeo/,
 'Disabling materials must restore the original editable geometry');
assert.match(renderer,/depthTest:true,depthWrite:true/,
 'Cliff relief must write real depth rather than appear as a transparent decal');
const inspector=readFileSync(new URL('../terrain-mesh-inspector.mjs',import.meta.url),'utf8');
assert.match(inspector,/intersectObjects\(\[terrain,\.\.\.\(getCliffOverlay\(\)\?\.children\|\|\[\]\)\],false\)/,
 'Inspector must select physical generated cliff faces');
const editor=readFileSync(new URL('../editor.mjs',import.meta.url),'utf8');
assert.match(editor,/ray\.intersectObjects\(\[terrain,\.\.\.cliffMeshes\],false\)/,
 'Sculpt/placement raycast must include replacement cliff geometry');
console.log('PASS: physical masked source faces, refined relief replaces original surface, unchanged sculpt vertices/cuts, raycasting restored');
