import assert from 'node:assert/strict';
import {registeredCliffZones} from '../cliff-zone-bindings.mjs';
const regions=[
 {id:'plain',name:'Llanura',biomeId:'plains',points:[{x:0,z:0},{x:20,z:0},{x:20,z:20},{x:0,z:20}]},
 {id:'forest',name:'Bosque',biomeId:'forest',points:[{x:40,z:0},{x:60,z:0},{x:60,z:20},{x:40,z:20}]},
 {id:'a',name:'Acantilado de llanura',isCliff:true,cliffParentId:'plain',points:[{x:2,z:2},{x:10,z:2},{x:10,z:10},{x:2,z:10}]},
 {id:'b',name:'Acantilado de bosque',isCliff:true,cliffParentId:'forest',points:[{x:42,z:2},{x:50,z:2},{x:50,z:10},{x:42,z:10}]}
];
let list=registeredCliffZones({zones:regions});
assert.equal(list.length,2,'Both existing cliff tags remain recognized');
assert.equal(list.find(x=>x.zone.id==='a').map?.id,'plains-body');
assert.equal(list.find(x=>x.zone.id==='b').map,null,'No forest heightmap yet');
assert.equal(list.find(x=>x.zone.id==='a').parent.id,'plain');
assert.deepEqual(registeredCliffZones({zones:regions.filter(x=>!x.isCliff)}),[],
 'No inferred slope may ever substitute a user-marked cliff');
assert.equal(registeredCliffZones({zones:[{...regions[2],cliffParentId:'missing'}]})[0].map,null);
console.log('PASS cliff classification restored, parent-biome inheritance, and no implicit slope guessing');
