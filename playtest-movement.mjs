// WILDTRAP: third-person movement relative to the camera's horizontal yaw.
// The camera supplies direction, but does not translate or rotate the player.
export function movementAxes(keys,yaw=0){
 const has=code=>keys.has(code);
 const forward=Number(has('KeyW')||has('ArrowUp'))-Number(has('KeyS')||has('ArrowDown'));
 const right=Number(has('KeyD')||has('ArrowRight'))-Number(has('KeyA')||has('ArrowLeft'));
 const length=Math.hypot(forward,right);
 if(!length)return {x:0,z:0,moving:false};
 const f=forward/length,r=right/length;
 const sin=Math.sin(yaw),cos=Math.cos(yaw);
 const x=f*sin+r*cos,z=-f*cos+r*sin;
 return {x:x===0?0:x,z:z===0?0:z,moving:true};
}
export function movementHeading(x,z){
 return Math.atan2(x,-z);
}
