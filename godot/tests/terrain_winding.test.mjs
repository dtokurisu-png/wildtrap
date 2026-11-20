// Geometry regression test: Godot ArrayMesh uses CLOCKWISE as its front face.
// Three.js uses the opposite winding. A flat top that appears from BELOW is a
// migration error even though headless import and scene boot will both pass.
import {readFileSync} from 'node:fs';
const buf=readFileSync(new URL('../data/terrain.wtmesh',import.meta.url));
if(buf.toString('ascii',0,4)!=='WTG2'||buf.readUInt32LE(4)!==1)
 throw Error('Wrong native terrain header');
const vertices=buf.readUInt32LE(8),indices=buf.readUInt32LE(12),stride=44,offset=16;
if(buf.length!==offset+vertices*stride+indices*4||indices%3!==0)
 throw Error('Wrong native terrain buffer length');
const xyz=i=>[0,1,2].map(k=>buf.readFloatLE(offset+i*stride+k*4));
const normal=i=>[3,4,5].map(k=>buf.readFloatLE(offset+i*stride+k*4));
const start=offset+vertices*stride;
let checked=0,correct=0,wrong=0,invalid=0;
for(let i=0;i<indices;i+=3){
 const a=buf.readUInt32LE(start+i*4),
 b=buf.readUInt32LE(start+(i+1)*4),c=buf.readUInt32LE(start+(i+2)*4);
 if(a>=vertices||b>=vertices||c>=vertices)throw Error('Out-of-range vertex index');
 const p=xyz(a),q=xyz(b),r=xyz(c);
 const u=q.map((v,k)=>v-p[k]),v=r.map((s,k)=>s-p[k]);
 const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const len=Math.hypot(...cross);
 if(len<1e-8){invalid++;continue}
 // For the normal of an upward-facing front polygon, the conventional
 // cross product of Godot's CLOCKWISE indices points downward.
 const geomY=cross[1]/len;
 if(geomY<-.85){correct++;checked++}
 else if(geomY>.85){wrong++;checked++}
}
// Some steep or folded source surfaces legitimately face away from +Y.
// The dominant ground must nevertheless be FRONT-facing above in Godot.
if(checked<10000||correct/Math.max(1,checked)<.95)
 throw Error('WildTrap upper terrain faces are reversed in Godot: '+JSON.stringify({checked,correct,wrong,invalid}));
const n=normal(0),up=Math.hypot(...n);
if(!n.every(Number.isFinite)||Math.abs(up-1)>.2||n[1]<0)
 throw Error('Imported source vertex normals must still point up: '+n.join(','));
console.log('WILDTRAP_GODOT_WINDING_OK',JSON.stringify({checked,correct,wrong,invalid,vertexNormal:n}));
