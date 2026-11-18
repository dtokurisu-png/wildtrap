import assert from 'node:assert/strict';
import {HERO_SHADOW_MOVING_INTERVAL_MS,HERO_SHADOW_IDLE_INTERVAL_MS,explorerShadowDue} from '../explorer-shadow-cadence.mjs';
assert.equal(HERO_SHADOW_MOVING_INTERVAL_MS,32);
assert.equal(HERO_SHADOW_IDLE_INTERVAL_MS,66);
assert.ok(explorerShadowDue(0,-Infinity,false),'First play frame renders the avatar shadow');
assert.ok(!explorerShadowDue(16,0,true),'No extra shadow pass on the next 60 Hz frame');
assert.ok(explorerShadowDue(34,0,true),'Move shadow refreshes after two 60 Hz frames');
assert.ok(!explorerShadowDue(60,0,false),'Idle shadow stays cached');
assert.ok(explorerShadowDue(70,0,false),'Idle silhouette is refreshed periodically');
const rate=moving=>{
 let last=-Infinity,count=0;
 for(let i=0;i<120;i++){
  const now=i*(1000/60);
  if(explorerShadowDue(now,last,moving)){last=now;count++}
 }
 return count;
};
const movingFrames=rate(true),idleFrames=rate(false);
assert.ok(movingFrames>=55&&movingFrames<=62,
 'Keep moving shadow near 30 fps over two seconds: '+movingFrames);
assert.ok(idleFrames>=27&&idleFrames<=32,
 'Idle shadow should refresh near 15 fps over two seconds: '+idleFrames);
console.log('PASS: 60 Hz gameplay shadows update '+movingFrames+'/120 moving frames and '+idleFrames+'/120 idle frames');
