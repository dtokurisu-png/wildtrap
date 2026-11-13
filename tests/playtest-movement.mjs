import assert from 'node:assert/strict';
import {movementAxes,movementHeading} from '../playtest-movement.mjs';
const get=(...codes)=>movementAxes(new Set(codes));
const near=(a,b)=>Math.abs(a-b)<1e-9;
assert.deepEqual(get('KeyW'),{x:0,z:-1,moving:true});
assert.deepEqual(get('KeyS'),{x:0,z:1,moving:true});
assert.deepEqual(get('KeyA'),{x:-1,z:0,moving:true});
assert.deepEqual(get('KeyD'),{x:1,z:0,moving:true});
assert.deepEqual(get('KeyW','KeyS'),{x:0,z:0,moving:false});
assert.deepEqual(get('KeyA','KeyD'),{x:0,z:0,moving:false});
assert.deepEqual(get('ArrowUp'),get('KeyW'));
assert.deepEqual(get('ArrowLeft'),get('KeyA'));
const diagonal=get('KeyW','KeyD');
assert.ok(near(Math.hypot(diagonal.x,diagonal.z),1),'Diagonal movement must be normalized');
assert.ok(near(diagonal.x,Math.SQRT1_2)&&near(diagonal.z,-Math.SQRT1_2));
assert.ok(near(movementHeading(0,-1),0));
assert.ok(near(movementHeading(1,0),Math.PI/2));
assert.ok(near(movementHeading(-1,0),-Math.PI/2));
assert.equal(get().moving,false);
// W direction and animation facing must coincide at every camera yaw.
for(const yaw of [-Math.PI,-Math.PI/2,-.8,0,.75,Math.PI/2,Math.PI]){
 const run=movementAxes(new Set(['KeyW']),yaw);
 const heading=movementHeading(run.x,run.z);
 assert.ok(Math.abs(Math.sin(heading-yaw))<1e-9);
 assert.ok(Math.cos(heading-yaw)>.999999);
}

// The actual Explorer rig faces +Z. The visual child has a PI rotation,
// and its parent receives NEGATIVE heading. Verify the visible forward
// vector equals the movement vector, not merely that heading equals yaw.
for(const yaw of [-Math.PI,-Math.PI/2,-1.2,-.4,0,.4,1.2,Math.PI/2,Math.PI]){
 for(const code of ['KeyW','KeyA','KeyS','KeyD']){
  const movement=movementAxes(new Set([code]),yaw);
  const parentRotation=-movementHeading(movement.x,movement.z);
  const worldFacing=parentRotation+Math.PI;
  const visibleForward={x:Math.sin(worldFacing),z:Math.cos(worldFacing)};
  assert.ok(near(visibleForward.x,movement.x)&&near(visibleForward.z,movement.z),
   'Explorer must visually face travel direction: '+code+' at '+yaw);
 }
}
// Camera-relative movement. At 90 degrees, W moves to +X and D to +Z.
const yawRight=Math.PI/2;
const wRight=movementAxes(new Set(['KeyW']),yawRight);
const dRight=movementAxes(new Set(['KeyD']),yawRight);
assert.ok(near(wRight.x,1)&&near(wRight.z,0),'W must follow camera yaw');
assert.ok(near(dRight.x,0)&&near(dRight.z,1),'D must strafe right of camera');
const opposite=movementAxes(new Set(['KeyS']),yawRight);
assert.ok(near(opposite.x,-1)&&near(opposite.z,0));
const diagCamera=movementAxes(new Set(['KeyW','KeyD']),yawRight);
assert.ok(near(Math.hypot(diagCamera.x,diagCamera.z),1));

console.log('PASS: W toward camera direction; A/D camera-relative strafe; normalized diagonals');
