// WILDTRAP v0.9.12 — persistent, instance-local vertex edits.
// Coordinates are model-root-local. The original GLB and every other
// placement retain their immutable vertex buffers.
export const AXES=Object.freeze(['x','y','z','xyz']);
export function normalizedLocks(locks){
 const result={};
 if(!locks||typeof locks!=='object'||Array.isArray(locks))return result;
 for(const [key,values] of Object.entries(locks)){
  if(!/^\d{1,4}$/.test(key)||!Array.isArray(values))continue;
  const unique=[...new Set(values.filter(x=>Number.isInteger(x)&&x>=0&&x<2_000_000))];
  if(unique.length)result[key]=unique.slice(0,200_000).sort((a,b)=>a-b);
 }
 return result;
}
export function pointAfterScale(point,axis,factor,pivot){
 const p=Array.from(point);const f=Number(factor);
 if(!AXES.includes(axis)||!Number.isFinite(f)||f<=0)return p;
 const base=Array.isArray(pivot)?pivot:[0,0,0];
 for(let i=0;i<3;i++){
  if(axis==='xyz'||axis===['x','y','z'][i]){
   const at=Number(base[i])||0;
   p[i]=at+(p[i]-at)*f;
  }
 }
 return p;
}
export function cleanVertexOperations(ops){
 if(!Array.isArray(ops))return [];
 return ops.slice(0,32).filter(op=>
  op&&AXES.includes(op.axis)&&Number.isFinite(op.factor)&&op.factor>=.1&&op.factor<=5&&
  Array.isArray(op.pivot)&&op.pivot.length===3&&op.pivot.every(Number.isFinite)
 ).map(op=>({
  axis:op.axis,factor:op.factor,pivot:op.pivot.slice(),
  locked:normalizedLocks(op.locked)
 }));
}
export function applyVertexOperations(geometry,operations,key,toRoot,fromRoot){
 if(!operations?.length)return null;
 const position=geometry.getAttribute('position');
 if(!position||position.itemSize!==3)return null;
 const output=geometry.clone(),target=output.getAttribute('position');
 const lockedMaps=operations.map(op=>new Set(op.locked?.[String(key)]||[]));
 for(let i=0;i<target.count;i++){
  let coords=[position.getX(i),position.getY(i),position.getZ(i)];
  coords=toRoot(coords);
  for(let j=0;j<operations.length;j++){
   if(!lockedMaps[j].has(i))coords=pointAfterScale(coords,operations[j].axis,operations[j].factor,operations[j].pivot);
  }
  coords=fromRoot(coords);
  target.setXYZ(i,...coords);
 }
 target.needsUpdate=true;output.computeBoundingBox();output.computeBoundingSphere();
 output.computeVertexNormals();
 return output;
}
export function constrainedRotation(origin,deltaX,deltaY,locks={}){
 const current={x:Number(origin?.x)||0,y:Number(origin?.y)||0,z:Number(origin?.z)||0};
 const dx=Number(deltaX)||0,dy=Number(deltaY)||0,r=Math.PI/360;
 if(!locks.y)current.y+=dx*r;
 if(!locks.x)current.x+=dy*r;
 // The Z axis uses the horizontal drag when X and Y are locked.
 if(!locks.z&&locks.y&&locks.x)current.z+=dx*r;
 return current;
}
