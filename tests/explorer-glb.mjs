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
assert.ok(meshes.length>0,'El GLB no contiene primitivas de malla');
assert.ok(count>0,'El GLB contiene primitivas de geometría sin vértices');
assert.ok((gltf.scenes||[]).length>0,'El GLB no contiene escenas');
console.log('PASS: Explorador 1 WT contiene malla de geometría válida');
