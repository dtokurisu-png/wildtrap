import assert from 'node:assert/strict';
import {defaultBiomeGenerator,generateBiomeAssignments,buildZoneAdjacency,nextBiomeSeed} from '../biome-generator.mjs';

const zone=(id,x)=>({id,points:[{x,z:0},{x:x+10,z:0},{x:x+10,z:10},{x,z:10}]});
const zones=[zone('a',0),zone('b',10),zone('c',20)];
const rules=defaultBiomeGenerator();
rules.seed=147;
const one=generateBiomeAssignments(zones,rules);
assert.equal(one.ok,true);
assert.deepEqual(one,generateBiomeAssignments(zones,rules),'La misma semilla debe reproducirse.');
assert.deepEqual(buildZoneAdjacency(zones),[[1],[0,2],[1]]);
rules.enabled=['desert','forest'];
rules.forbiddenPairs=['desert:forest'];
const compatible=generateBiomeAssignments(zones,rules);
assert.equal(compatible.ok,true);
assert.ok(compatible.assignments.every(a=>a.biomeId===compatible.assignments[0].biomeId),
 'La prohibición de fronteras desierto/bosque debe respetarse.');
const locked=zones.map((z,i)=>({...z,biomeId:i===0?'forest':null,biomeLocked:i===0}));
const kept=generateBiomeAssignments(locked,rules);
assert.equal(kept.ok,true);
assert.equal(kept.assignments[0].biomeId,'forest');
const impossible=zones.map((z,i)=>({...z,biomeId:i===0?'forest':i===1?'desert':null,biomeLocked:i<2}));
const previous=JSON.stringify(impossible);
assert.equal(generateBiomeAssignments(impossible,rules).ok,false);
assert.equal(JSON.stringify(impossible),previous,'El generador nunca debe modificar el origen tras fallar.');
assert.equal(nextBiomeSeed(2147483646),1);
console.log('PASS: biomas por semilla, adyacencias, compatibilidad, bloqueos y fallos seguros');
