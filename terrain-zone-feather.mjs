import * as THREE from 'three';
export const TERRAIN_WORLD_SIZE=630;
export const TERRAIN_MASK_RESOLUTION=768;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
/** Paint polygons in world X/Z and soften their edges in image space.
 * This operates only on texture masks; it never changes terrain geometry or saved polygons.
 * An edge that runs into a cliff is allowed to extend slightly beyond the original zone.
 */
export function createFeatheredZoneMask(zones,{featherWorld=12,expandWorld=0,resolution=TERRAIN_MASK_RESOLUTION}={}){
 const source=document.createElement('canvas');
 source.width=source.height=resolution;
 const ctx=source.getContext('2d');
 const polygons=(zones||[]).filter(zone=>Array.isArray(zone.points)&&zone.points.length>=3);
 const scale=resolution/TERRAIN_WORLD_SIZE;
 ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineJoin='round';ctx.lineCap='round';
 ctx.lineWidth=clamp(Number(expandWorld)||0,0,25)*2*scale;
 for(const zone of polygons){
  ctx.beginPath();
  zone.points.forEach((point,index)=>{
   const x=(point.x/TERRAIN_WORLD_SIZE+.5)*resolution;
   const y=(point.z/TERRAIN_WORLD_SIZE+.5)*resolution;
   if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.closePath();ctx.fill();
  if(expandWorld>0)ctx.stroke();
 }
 const image=document.createElement('canvas');
 image.width=image.height=resolution;
 const dst=image.getContext('2d');
 const blur=clamp(Number(featherWorld)||0,0,50)*scale;
 if(blur>0.05){dst.filter='blur('+blur.toFixed(2)+'px)';dst.drawImage(source,0,0);dst.filter='none'}
 else dst.drawImage(source,0,0);
 const mask=new THREE.CanvasTexture(image);
 mask.colorSpace=THREE.NoColorSpace;
 mask.minFilter=mask.magFilter=THREE.LinearFilter;
 mask.generateMipmaps=false;
 mask.needsUpdate=true;
 return mask;
}
