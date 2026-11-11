import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryForNode,sceneObjectName,cleanObjectGroups,objectTree,sceneObjectCount} from '../scene-object-catalog.mjs';
const look=id=>({
 'rocky-cave':{name:'Cueva rocosa'},'stone-cave':{name:'Cueva de piedra'},
 mountain:{name:'Montaña'}
})[id]||null;
const nodes=[
 {id:1,kind:'prefab',prefabId:'rocky-cave',x:0,z:0},
 {id:2,kind:'prefab',prefabId:'stone-cave',x:9,z:0,editorHidden:true},
 {id:3,kind:'prefab',prefabId:'mountain',x:18,z:0},
 {id:4,kind:'cavePiece'},
 {id:5,kind:'cave'},
 {id:6,kind:'mountain'},
 {id:7,kind:'tree'},
 {id:8,kind:'wallspawn'},
 {id:9,kind:'spawn'},
 {id:10,kind:'exit'},
 {id:11,kind:'anchor'},
 {id:12,kind:'path'},
 {id:13,kind:'wall'},
 {id:14,kind:'stairs'},
 {id:15,kind:'gate'}
];
test('El visor solo enumera modelos persistentes colocados',()=>{
 const tree=objectTree(nodes,[],look);
 assert.equal(sceneObjectCount(nodes),6);
 assert.deepEqual(tree.map(g=>g.name),['Cuevas','Montañas','Piezas de cueva']);
 assert.deepEqual(tree.flatMap(g=>g.objects.map(o=>o.id)),[1,2,5,3,6,4]);
 assert.ok(tree.flatMap(g=>g.objects).every(o=>o.id<7));
 assert.ok(tree.find(g=>g.name==='Cuevas').objects.find(o=>o.id===2).hidden);
});
test('El tipo del GLB y su nombre no dependen del orden de la lista',()=>{
 assert.equal(categoryForNode({id:19,kind:'prefab',prefabId:'stylized-cave'}),'caves');
 assert.equal(categoryForNode({id:20,kind:'prefab',prefabId:'mountain'}),'mountains');
 assert.equal(categoryForNode({id:21,kind:'prefab',prefabId:'custom-tree'}),'models');
 assert.equal(categoryForNode({id:22,kind:'path'}),null);
 assert.equal(sceneObjectName({id:19,kind:'prefab',prefabId:'rocky-cave'},look),'Cueva rocosa 19');
 assert.equal(sceneObjectName({id:19,kind:'prefab',name:'Entrada sur',prefabId:'rocky-cave'},look),'Entrada sur');
});
test('Grupos manuales son prioritarios y no duplican objetos',()=>{
 const group={id:'group-1',name:'Tres cuevas'};
 const modified=nodes.map(n=>({...n,...([1,2].includes(n.id)?{groupId:'group-1'}:{})}));
 const tree=objectTree(modified,[group],look);
 assert.equal(tree[0].manual,true);
 assert.equal(tree[0].name,'Tres cuevas');
 assert.deepEqual(tree[0].objects.map(o=>o.id),[1,2]);
 assert.equal(tree.flatMap(g=>g.objects).length,6);
 assert.equal(new Set(tree.flatMap(g=>g.objects.map(o=>o.id))).size,6);
});
test('Grupos obsoletos o mal formados no dañan el visor',()=>{
 const invalid=[null,{id:'../hack',name:'Peligroso'},{id:'group-1',name:'Válido'},
 {id:'group-1',name:'Duplicado'},{id:'group-2',name:''}];
 assert.deepEqual(cleanObjectGroups(invalid),[{id:'group-1',name:'Válido'}]);
 assert.equal(objectTree(nodes,invalid,look).flatMap(g=>g.objects).length,6);
 assert.equal(sceneObjectCount(null),0);
});
