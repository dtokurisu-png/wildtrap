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

// Alt+Shift+left drag changes cave elevation in absolute world units.
// It is independent from terrain and does not change the X/Z coordinates.
export function altitudeFromVerticalDrag(originalY,startScreenY,screenY){
 const base=Number.isFinite(originalY)?originalY:0;
 const dy=Number(startScreenY)-Number(screenY);
 return Number.isFinite(dy)?base+dy*.25:base;
}

// Free cave placement is a camera-aware SCREEN gesture, not a terrain raycast.
// A normal drag maps screen X to the horizontal camera-right direction, and
// screen Y directly to absolute world Y (up = higher). Space+drag works in
// the camera-aligned ground plane for X/Z depth positioning, preserving Y.
export function freeCaveFromScreenDrag(
 original,startX,startY,screenX,screenY,right,up,
 horizontalUnits=.5,verticalUnits=.25,mapSize=630,plane=false
){
 const x=Number(original?.x),y=Number(original?.y),z=Number(original?.z);
 if(![x,y,z,startX,startY,screenX,screenY].every(Number.isFinite))return null;
 const pixelsX=screenX-startX,pixelsUp=startY-screenY;
 const width=Number.isFinite(horizontalUnits)&&horizontalUnits>0?horizontalUnits:.5;
 const elev=Number.isFinite(verticalUnits)&&verticalUnits>0?verticalUnits:.25;
 const norm=v=>{
  const vx=Number(v?.x)||0,vz=Number(v?.z)||0;
  const len=Math.hypot(vx,vz);
  return len>1e-6?{x:vx/len,z:vz/len}:null;
 };
 const cameraRight=norm(right)||{x:1,z:0};
 const cameraUp=norm(up)||{x:0,z:-1};
 const bound=mapSize/2-1;
 return {
  x:clamp(x+cameraRight.x*pixelsX*width+(plane?cameraUp.x*pixelsUp*width:0),-bound,bound),
  z:clamp(z+cameraRight.z*pixelsX*width+(plane?cameraUp.z*pixelsUp*width:0),-bound,bound),
  y:plane?y:y+pixelsUp*elev
 };
}
