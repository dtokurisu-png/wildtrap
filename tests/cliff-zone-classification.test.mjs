import assert from 'node:assert/strict';
import {registeredCliffZones,CLIFF_ASSETS,cliffRepeatCount} from '../cliff-zone-bindings.mjs';
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
assert.equal(CLIFF_ASSETS.length,5,'All five biome cliff images must be listed');
assert.ok(CLIFF_ASSETS.every(a=>a.color),'Every biome has its cliff color preview');
assert.equal(CLIFF_ASSETS.filter(a=>a.height).length,1,'Only the available plains heightmap may affect geometry');
assert.equal(cliffRepeatCount({},'plains'),26.25);
assert.equal(cliffRepeatCount({cliffHeightSettings:{period:70}},'plains'),9);
assert.equal(cliffRepeatCount({cliffHeightSettings:{period:70,biomes:{plains:{repeats:5.5}}}},'plains'),5.5);
assert.equal(cliffRepeatCount({cliffHeightSettings:{biomes:{forest:{repeats:11}}}},'forest'),11);
assert.equal(cliffRepeatCount({textureCatalogScale:{'cliff-swamp-color':7}},'swamp'),7);
console.log('PASS cliff classification restored, parent-biome inheritance, and no implicit slope guessing');
