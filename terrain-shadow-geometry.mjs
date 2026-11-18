// Geometry-only sunlight caster selection. Ground and gentle hills do not
// write into the global shadow map; the steep cliff faces still cast real
// shadows onto the ground and on other cliff/wall faces.
// No DOM, Three.js or renderer dependencies: testable in Node.
export function cliffShadowFaceIndices(positions,indices=null,maxVerticalNormal=0.72){
 if(!positions||positions.length%3!==0)throw new TypeError('Invalid XYZ positions');
 const vertexCount=positions.length/3,triangles=indices?Math.floor(indices.length/3):Math.floor(vertexCount/3);
 const output=[];
 for(let i=0;i<triangles;i++){
  const a=indices?indices[i*3]:i*3;
  const b=indices?indices[i*3+1]:i*3+1;
  const c=indices?indices[i*3+2]:i*3+2;
  if(a>=vertexCount||b>=vertexCount||c>=vertexCount)continue;
  const ia=3*a,ib=3*b,ic=3*c;
  const ux=positions[ib]-positions[ia],uy=positions[ib+1]-positions[ia+1],uz=positions[ib+2]-positions[ia+2];
  const vx=positions[ic]-positions[ia],vy=positions[ic+1]-positions[ia+1],vz=positions[ic+2]-positions[ia+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const length=Math.hypot(nx,ny,nz);
  if(length>1e-7&&Math.abs(ny)/length<maxVerticalNormal)output.push(a,b,c);
 }
 return output;
}
