import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const filename=new URL('../assets/explorador 1 wt.glb',import.meta.url);
const glb=readFileSync(filename);
assert.equal(glb.toString('utf8',0,4),'glTF','El archivo no tiene cabecera glTF');
assert.equal(glb.readUInt32LE(4),2,'Se requiere GLB 2.0');
assert.equal(glb.readUInt32LE(8),glb.length,'Longitud GLB incompatible');
const length=glb.readUInt32LE(12),type=glb.readUInt32LE(16);
assert.equal(type,0x4e4f534a,'El primer chunk debe ser JSON');
const gltf=JSON.parse(glb.toString('utf8',20,20+length));
const geometries=(gltf.meshes||[]).flatMap(mesh=>mesh.primitives||[]);
const accessors=(gltf.accessors||[]);
const meshes=geometries.filter(primitive=>Number.isInteger(primitive.attributes?.POSITION));
const count=meshes.reduce((sum,p)=>sum+(accessors[p.attributes.POSITION]?.count||0),0);
const extents=meshes.map(p=>accessors[p.attributes.POSITION]).filter(a=>a?.min&&a?.max).map(a=>a.max.map((v,i)=>v-a.min[i]));
console.log('EXPLORADOR WT GLB',{bytes:glb.length,scene:gltf.scene,
 sceneCount:gltf.scenes?.length||0,meshNodes:gltf.nodes?.filter(n=>Number.isInteger(n.mesh)).length||0,
 meshes:gltf.meshes?.length||0,primitives:geometries.length,vertices:count,
 skins:gltf.skins?.length||0,animations:gltf.animations?.length||0,
 sourceExtents:extents.slice(0,10)});
console.log('EXPLORADOR RIG',JSON.stringify({
 nodes:(gltf.nodes||[]).map((n,i)=>({i,name:n.name,mesh:n.mesh,skin:n.skin,children:n.children,translation:n.translation,rotation:n.rotation,scale:n.scale})).slice(0,40),
 scenes:gltf.scenes,
 animationNames:(gltf.animations||[]).map(a=>({name:a.name,channels:a.channels?.length,targets:[...new Set((a.channels||[]).map(c=>c.target?.node))].slice(0,8)})),
 minMax:meshes.map(p=>({min:accessors[p.attributes.POSITION]?.min,max:accessors[p.attributes.POSITION]?.max}))
},null,2));
// Infer the rig's authored forward direction from toes relative to ankles.
// This diagnoses a mistaken 180-degree visual-only correction.
const nodes=gltf.nodes||[];
const parent=new Map();
nodes.forEach((n,i)=>(n.children||[]).forEach(child=>parent.set(child,i)));
const mulQ=(a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const rotate=(q,p)=>{const [x,y,z,w]=q,tx=2*(y*p[2]-z*p[1]),ty=2*(z*p[0]-x*p[2]),tz=2*(x*p[1]-y*p[0]);return [p[0]+w*tx+(y*tz-z*ty),p[1]+w*ty+(z*tx-x*tz),p[2]+w*tz+(x*ty-y*tx)]};
const memo=new Map();
function world(i){if(memo.has(i))return memo.get(i);const n=nodes[i],p=parent.get(i),t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],v=n.scale||[1,1,1];const ans=p===undefined?{p:t,q,s:v}:(()=>{const a=world(p);return {p:a.p.map((x,j)=>x+rotate(a.q,t.map((v,k)=>v*a.s[k]))[j]),q:mulQ(a.q,q),s:v.map((v,j)=>v*a.s[j])}})();memo.set(i,ans);return ans;}
const feet=nodes.map((n,i)=>({n:n.name,i})).filter(x=>/mixamorig:(Left|Right)(Foot|ToeBase)/i.test(x.n));
console.log('EXPLORADOR FOOT FORWARD',feet.map(x=>({name:x.n,position:world(x.i).p})));
const hips=nodes.map((n,i)=>({n:n.name,i})).find(x=>/mixamorig:Hips/i.test(x.n));
console.log('EXPLORADOR HIPS',hips?{name:hips.n,position:world(hips.i).p}:null);
assert.ok(meshes.length>0,'El GLB no contiene primitivas de malla');
assert.ok(count>0,'El GLB contiene primitivas de geometría sin vértices');
assert.ok((gltf.scenes||[]).length>0,'El GLB no contiene escenas');
console.log('PASS: Explorador 1 WT contiene malla de geometría válida');
