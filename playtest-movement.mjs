// WILDTRAP: world-space WASD. The orbit camera never changes movement axes.
export function movementAxes(keys){
 const has=code=>keys.has(code);
 const forward=Number(has('KeyW')||has('ArrowUp'))-Number(has('KeyS')||has('ArrowDown'));
 const right=Number(has('KeyD')||has('ArrowRight'))-Number(has('KeyA')||has('ArrowLeft'));
 const length=Math.hypot(forward,right);
 return length?{x:right/length,z:forward===0?0:-forward/length,moving:true}:{x:0,z:0,moving:false};
}
export function movementHeading(x,z){
 return Math.atan2(x,-z);
}
