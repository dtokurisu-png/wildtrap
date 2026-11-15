import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadCorrectedExplorerRun} from '../explorer-run-corrected.mjs';

const asset=readFileSync(new URL('../assets/explorador 1 wt.glb',import.meta.url));
assert.equal(asset.toString('utf8',0,4),'glTF');
const jsonSize=asset.readUInt32LE(12);
const gltf=JSON.parse(asset.toString('utf8',20,20+jsonSize));
const sourceAnimations=gltf.animations||[];
assert.ok(sourceAnimations.length>=5,'Original Explorer must have idle and run animations');
const properties={translation:'position',rotation:'quaternion',scale:'scale'};
const original={
 animations:sourceAnimations.map(a=>({
  tracks:a.channels.map(c=>({
   name:(gltf.nodes[c.target.node].name||'').replace(/[^a-zA-Z0-9_]/g,'')+'.'+properties[c.target.path]
  }))
 }))
};
const raw=readFileSync(new URL('../assets/animations/explorer-run-corrected.b64',import.meta.url),'utf8');
assert.equal(raw.trim().length,14864,'The supplied correction asset must be complete');
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,status:200,text:async()=>raw});
class MockTrack{
 constructor(name,times,values){this.name=name;this.times=times;this.values=values;
  assert.equal(values.length,times.length*(name.endsWith('quaternion')?4:3));}
}
class MockClip{
 constructor(name,duration,tracks){
  this.name=name;this.tracks=tracks;this.duration=Math.max(...tracks.map(t=>t.times[t.times.length-1]));
 }
}
const THREE={VectorKeyframeTrack:MockTrack,QuaternionKeyframeTrack:MockTrack,AnimationClip:MockClip};
try{
 const clip=await loadCorrectedExplorerRun(THREE,original);
 assert.ok(clip.tracks.length>=150,'Most of the animation skeleton must map onto existing Explorer bones; found '+clip.tracks.length);
 assert.ok(clip.duration>.85&&clip.duration<1.05,'Running clip should have approximately .9s duration');
 assert.ok(clip.tracks.every(t=>Array.from(t.values).every(Number.isFinite)));
 assert.ok(clip.tracks.some(t=>/hips/i.test(t.name)&&/position/.test(t.name)),'Root motion should be available for in-place correction');
 console.log('RUN CORREGIDA PASS',clip.tracks.length+' tracks',clip.duration.toFixed(3)+' sec',sourceAnimations.length+' existing animations retained');
}finally{
 globalThis.fetch=originalFetch;
}
