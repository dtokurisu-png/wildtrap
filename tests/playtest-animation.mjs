import assert from 'node:assert/strict';
import {inPlaceClip} from '../playtest-animation.mjs';
const track=(name,values)=>({name,values:new Float32Array(values),getValueSize(){return 3}});
const src={name:'Run',tracks:[
 track('mixamorigHips.position',[2,1,3,5,1.5,9,-1,1.3,20]),
 track('mixamorigLeftFoot.position',[0,1,0,1,2,2,2,3,3]),
],clone(){return {name:this.name,tracks:this.tracks.map(t=>track(t.name,t.values))}}};
const out=inPlaceClip(src);
assert.equal(out.corrected,1);
assert.deepEqual([...out.clip.tracks[0].values],[2,1,3,2,1.5,3,2,Math.fround(1.3),3]);
assert.deepEqual([...out.clip.tracks[1].values],[0,1,0,1,2,2,2,3,3]);
assert.deepEqual([...src.tracks[0].values],[2,1,3,5,1.5,9,-1,1.3,20]);
console.log('PASS: in-place root translation, leg tracks and source animation preserved');
