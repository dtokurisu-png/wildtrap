/** Extract shadow-casting cliff triangles, excluding nearly horizontal floor faces.
 * Pure geometry utility: independent of the renderer and player shadow system.
 */
export function terrainCliffShadowIndices(position,index=null,steepLimit=0.80){
 if(!position||position.length%3!==0)throw new TypeError('Invalid position buffer');
 const vertexCount=position.length/3;
 const faceCount=index?Math.floor(index.length/3):Math.floor(vertexCount/3);
 const selected=[];
 for(let face=0;face<faceCount;face++){
  const a=index?index[face*3]:face*3,b=index?index[face*3+1]:face*3+1,c=index?index[face*3+2]:face*3+2;
  if(a>=vertexCount||b>=vertexCount||c>=vertexCount)continue;
  const ax=position[a*3],ay=position[a*3+1],az=position[a*3+2];
  const ux=position[b*3]-ax,uy=position[b*3+1]-ay,uz=position[b*3+2]-az;
  const vx=position[c*3]-ax,vy=position[c*3+1]-ay,vz=position[c*3+2]-az;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const length=Math.hypot(nx,ny,nz);
  if(length>1e-7&&Math.abs(ny)/length<steepLimit)selected.push(a,b,c);
 }
 return selected;
}
