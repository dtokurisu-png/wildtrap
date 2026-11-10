import assert from 'node:assert/strict';
import {generateWorld,validateWorld,clearCorridor,SECTORS,SPAWN,BIOMES,heightAt} from './world.mjs';
let variants=new Set();
for(let i=0;i<1000;i++){
const seed='seed-'+i,a=generateWorld(seed),b=generateWorld(seed);
assert.deepEqual(a,b,'Semilla no reproducible '+seed);
assert.deepEqual(validateWorld(a),[],'Mundo inválido '+seed);
assert.equal(a.size,420);
assert.deepEqual(a.spawn,SPAWN);
assert.equal(a.nests.length,5);
assert.equal(a.caves.length,5);
assert.equal(a.caves.filter(c=>c.active).length,1);
assert.equal(a.beacons.length,2);
assert.equal(a.objectives.length,3);
assert.equal(a.objectives[0].id,'egg');
assert.deepEqual(Object.values(a.biomeBySector).sort(),BIOMES.map(x=>x.id).sort());
for(const p of [...a.nests,...a.trees,...a.resources])assert(clearCorridor(p.x,p.z),seed+': obstáculo en ruta');
for(const sector of SECTORS)assert(Number.isFinite(heightAt(a,sector.x,sector.z)));
variants.add(Object.values(a.biomeBySector).join(','));
}
assert(variants.size>20,'La variación de biomas es insuficiente');
console.log('OK: 1000 semillas, cinco biomas, relieve y accesos, cinco cuevas, una extracción, rutas libres; variantes='+variants.size);
