import {generateWorld,validateWorld,clearCorridor} from './world.mjs';
import assert from 'node:assert/strict';
for(let i=0;i<250;i++){
 const seed='test-'+i,a=generateWorld(seed),b=generateWorld(seed);
 assert.deepEqual(a,b,'Semilla no determinista '+seed);
 assert.deepEqual(validateWorld(a),[],'Mundo inválido '+seed);
 assert.equal(a.objectives.length,3);
 assert(a.objectives.some(o=>o.id==='egg'));
 assert(a.nests.length>=3);
 assert.equal(a.beacons.length,2);
 for(const p of a.trees)assert(clearCorridor(p.x,p.z),'Decoración bloquea corredor');
}
console.log('OK: 250 semillas válidas y reproducibles');
