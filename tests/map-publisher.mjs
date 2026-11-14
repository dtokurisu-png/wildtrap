import assert from 'node:assert/strict';
import {validatePublishedScene,publishMap} from '../map-publisher.mjs';

const scene={size:630,resolution:3,heights:Array(9).fill(0),
 nodes:[{kind:'playerSpawn',playerSlot:1,x:233,z:275}],cuts3d:[{op:'cut'}]};
assert.equal(validatePublishedScene(scene).spawns,1);
assert.throws(()=>validatePublishedScene({...scene,nodes:[]}),/Spawn/);
assert.throws(()=>validatePublishedScene({...scene,heights:[0]}),/inválido/);
const oldFetch=globalThis.fetch;
const requests=[];
let num=0;
const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
const baseline={activeVersion:'v001',releases:[{id:'v001',path:'maps/versions/v001.json'}]};
globalThis.fetch=async(url,opts={})=>{
 const path=new URL(url).pathname.split('/repos/dtokurisu-png/wildtrap-play')[1];
 const method=opts.method||'GET';
 const body=opts.body?JSON.parse(opts.body):null;
 requests.push({path,method,body});
 if(path==='/git/ref/heads/main')return response({object:{sha:'oldhead'}});
 if(path==='/contents/maps/manifest.json')return response({content:Buffer.from(JSON.stringify(baseline)).toString('base64')});
 if(path==='/git/commits/oldhead')return response({tree:{sha:'oldtree'}});
 if(path==='/git/blobs')return response({sha:'blob'+(++num)});
 if(path==='/git/trees')return response({sha:'newtree'});
 if(path==='/git/commits')return response({sha:'newhead'});
 if(path==='/git/refs/heads/main')return response({object:{sha:'newhead'}});
 throw Error('Unexpected Github endpoint '+method+' '+path);
};
try{
 const result=await publishMap({scene,token:'test-only',notes:'Mock test'});
 assert.ok(result.id.startsWith('v20'));
 assert.equal(result.statistics.spawns,1);
 const tree=requests.find(x=>x.path==='/git/trees').body;
 assert.equal(tree.base_tree,'oldtree');
 assert.deepEqual(tree.tree.map(x=>x.path).sort(),
  ['maps/current.json','maps/manifest.json',result.path].sort());
 assert.equal(requests.filter(x=>x.path==='/git/commits'&&x.method==='POST').length,1);
 const patch=requests.find(x=>x.method==='PATCH');
 assert.equal(patch.body.force,false,'Must not overwrite concurrent Play edits');
 const manifestBody=requests.filter(x=>x.path==='/git/blobs').map(x=>x.body.content)
   .find(x=>x.includes('"activeVersion"'));
 const manifest=JSON.parse(manifestBody);
 assert.equal(manifest.activeVersion,result.id);
 assert.equal(manifest.releases[0].id,'v001');
 assert.equal(manifest.releases[1].notes,'Mock test');
 assert.equal(scene.heights.length,9,'Source scene should not be mutated');
 console.log('PASS: atomic map publish, version archive, manifest and non-force branch update');
}finally{globalThis.fetch=oldFetch;}
