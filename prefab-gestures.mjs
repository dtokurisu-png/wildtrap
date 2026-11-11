// WILDTRAP · Cursor-driven transforms. This module is independent of Three.js.
export const MIN_PREFAB_SCALE=.05;
export const MAX_PREFAB_SCALE=15;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function scaleFromVerticalDrag(originalScale,startScreenY,screenY){
 const base=Number.isFinite(originalScale)&&originalScale>0?originalScale:1;
 const dy=Number(startScreenY)-Number(screenY);
 if(!Number.isFinite(dy))return clamp(base,MIN_PREFAB_SCALE,MAX_PREFAB_SCALE);
 return clamp(base*Math.exp(dy*.008),MIN_PREFAB_SCALE,MAX_PREFAB_SCALE);
}
export function translateNodeOnTerrain(original,dx,dz,mapSize=630){
 const bound=mapSize/2-1;
 const x=(value)=>clamp(value+dx,-bound,bound);
 const z=(value)=>clamp(value+dz,-bound,bound);
 if(original.a&&original.b){
  return {a:{x:x(original.a.x),z:z(original.a.z)},b:{x:x(original.b.x),z:z(original.b.z)}};
 }
 if(Number.isFinite(original.x)&&Number.isFinite(original.z))
  return {x:x(original.x),z:z(original.z)};
 return {};
}

// Alt + left drag: horizontal mouse motion rotates around vertical Y;
// vertical mouse motion tilts around local X. Angles are stored in radians.
// Drag is measured from the gesture's beginning to avoid accumulating drift.
export function rotateFromPointerDrag(originalYaw=0,originalPitch=0,startScreenX,startScreenY,screenX,screenY){
 const yaw=Number.isFinite(originalYaw)?originalYaw:0;
 const pitch=Number.isFinite(originalPitch)?originalPitch:0;
 const dx=Number(screenX)-Number(startScreenX);
 const dy=Number(startScreenY)-Number(screenY);
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return {rotation:yaw,rotationX:pitch};
 const radiansPerPixel=Math.PI/360;
 return {rotation:yaw+dx*radiansPerPixel,rotationX:pitch+dy*radiansPerPixel};
}
