import assert from 'node:assert/strict';
import {generateBiomeAssignments,defaultBiomeGenerator} from '../biome-generator.mjs';
import {ensureBiomeTextureDefaults} from '../editor-biome-textures.mjs';
import {REPO_TEXTURES,textureUrl} from '../editor-texture-catalog.mjs';

const regions=Array.from({length:5},(_,i)=>({
 id:'region-'+(i+1),name:'Zona '+(i+1),
 points:[{x:i*45,z:0},{x:i*45+30,z:0},{x:i*45+30,z:25},{x:i*45,z:25}]
}));
const result=generateBiomeAssignments(regions,defaultBiomeGenerator());
assert.equal(result.ok,true,'Five primary zones should generate');
assert.equal(new Set(result.assignments.map(a=>a.biomeId)).size,5,'Five regions should receive five different biomes');
const cliff={id:'cliff-1',isCliff:true,cliffParentId:'region-1',
 points:[{x:1,z:1},{x:8,z:1},{x:8,z:8},{x:1,z:8}]};
const primary=[...regions,cliff].filter(z=>!z.isCliff);
assert.equal(generateBiomeAssignments(primary,defaultBiomeGenerator()).assignments.length,5);
const materials=ensureBiomeTextureDefaults({});
for(const [biome,config] of Object.entries(materials)){
 assert.equal(REPO_TEXTURES.filter(t=>t.biome===biome).length,5);
 assert.equal(Object.values(config.slots).filter(s=>s.image).length,5);
 assert.ok(Object.values(config.slots).every(s=>REPO_TEXTURES.some(t=>textureUrl(t)===s.image)));
}
const custom='data:image/png;base64,AAAA';
assert.equal(ensureBiomeTextureDefaults({forest:{slots:{ground:{image:custom}}}}).forest.slots.ground.image,custom,
 'Manual texture overrides must survive procedural defaults');
console.log('ZONE / BIOME PASS: five unique regions, cliff linkage, five texture slots each, overrides protected');
