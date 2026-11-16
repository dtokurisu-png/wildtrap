import assert from 'node:assert/strict';
import {straightenCliffSeams} from '../editor-cliff-seams.mjs';
import {readFileSync} from 'node:fs';
const triangulatedSlope=[
 [[0,0,0],[4,10,0],[0,0,4]],
 [[4,10,0],[4,10,4],[0,0,4]]
];
const copy=JSON.stringify(triangulatedSlope);
const {triangles,seams}=straightenCliffSeams(triangulatedSlope);
assert.ok(triangles.length>=4,'Clipped quad should be rebuilt from triangulated faces');
assert.ok(seams,'Both horizontal seam levels should be defined');
assert.ok(seams.bottom>0&&seams.top<10,'Upper and lower triangular ends are trimmed');
const vertices=triangles.flat();
assert.ok(vertices.every(p=>p[1]>=seams.bottom-1e-6&&p[1]<=seams.top+1e-6),'No point passes top or foot seam');
assert.ok(vertices.filter(p=>Math.abs(p[1]-seams.top)<1e-6).length>=2,'Top is represented by a straight horizontal edge');
assert.ok(vertices.filter(p=>Math.abs(p[1]-seams.bottom)<1e-6).length>=2,'Foot is represented by a straight horizontal edge');
assert.equal(JSON.stringify(triangulatedSlope),copy,'Source terrain and collider remain unmodified');
const flat=straightenCliffSeams([[[0,2,0],[1,2,0],[0,2,1]]]);
assert.equal(flat.seams,null,'Flat areas should not be clipped as a cliff');
assert.equal(flat.triangles.length,1,'Small-height faces remain intact');
const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
assert.match(renderer,/zone\.isCliff\?straightenCliffSeams\(triangles\)/,'Seams apply only to cliff-marked zones');
assert.match(renderer,/buildRefinedCliffGeometry\(aligned\.triangles/,'Subdivision uses the aligned wall triangles');
assert.match(renderer,/isHoleAt\(center\[0\],center\[1\],center\[2\]\)/,'Holes remain excluded before seam construction');
console.log('PASS: Cliff top and foot have straight horizontal seams; source terrain remains unchanged');
