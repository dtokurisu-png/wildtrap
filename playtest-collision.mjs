// WILDTRAP Playtest: geometry-aware capsule approximation.
// Only the rendered (and already cut) meshes are queried. The uncut heightmap
// is never used as an invisible wall or as a forced floor.
export function createPlaytestCollider({THREE,terrain,roots=[]}){
 const ray=new THREE.Raycaster();
 const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
 const normalMatrix=new THREE.Matrix3(),normal=new THREE.Vector3();
 const obstacles=[];
 const modifiedMaterials=new Map();
 const meshList=[];
 function refresh(){
  meshList.length=0;
  const unique=new Set();
  const visit=obj=>{
   if(!obj.visible||obj.userData?.editorOnly||obj.userData?.editorIntangible)return;
   if(obj.isMesh&&obj.geometry?.attributes?.position&&!unique.has(obj)){
    // Ignore decorative / non-solid helpers even when parent geometry is visible.
    if(obj.userData?.editorIntangible||obj.userData?.noCollision)return;
    unique.add(obj);meshList.push(obj);
    // Raycast cave interiors from either side. Restore on stop.
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const mat of materials){
     if(mat&&!modifiedMaterials.has(mat)){modifiedMaterials.set(mat,mat.side);mat.side=THREE.DoubleSide;}
    }
   }
   for(const child of obj.children||[])visit(child);
  };
  visit(terrain);
  const sceneRoots=typeof roots==='function'?roots():roots;
  for(const root of sceneRoots||[])if(root)visit(root);
  for(const obj of meshList)obj.updateWorldMatrix(true,false);
  return meshList.length;
 }
 function restore(){
  for(const [material,side] of modifiedMaterials)material.side=side;
  modifiedMaterials.clear();meshList.length=0;
 }
 function hits(x,y,z,dir,distance){
  ray.set(new THREE.Vector3(x,y,z),dir);ray.near=0;ray.far=distance;
  return ray.intersectObjects(meshList,false);
 }
 function worldNormal(hit){
  if(!hit.face)return null;
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  return normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
 }
 // Ground queries use the actual post-cut render meshes only.
 // A cave roof over the avatar must never snap the player onto its top.
 function floorAt(x,z,feetY,{stepUp=.65,searchDepth=18,footprint=.13}={}){
  const above=feetY+stepUp;
  // Five closely spaced rays avoid narrow cracks and triangulation seams that
  // made a moving Explorer drop through otherwise continuous walkable surfaces.
  // Deliberate cut openings remain open when there is no triangle below ANY ray.
  const offsets=footprint>0?[[0,0],[footprint,0],[-footprint,0],[0,footprint],[0,-footprint]]:[[0,0]];
  let best=null;
  for(const [ox,oz] of offsets){
   const intersections=hits(x+ox,above,z+oz,down,stepUp+searchDepth);
   for(const hit of intersections){
    if(hit.point.y>above+1e-4)continue;
    const n=worldNormal(hit);
    if(n&&Math.abs(n.y)<.50)continue;
    if(!best||hit.point.y>best.y){
     best={y:hit.point.y,object:hit.object,normal:n?n.clone():new THREE.Vector3(0,1,0)};
    }
    break; // nearest walkable surface for this ray; never snap through cave ceilings
   }
  }
  return best;
 }
 // Capsule-like side probes at hips and chest, with radius on both sides.
 // Horizontal geometry removed by the knife cannot block this sweep.
 function blocked(x,y,z,dx,dz,{radius=.42,height=1.75}={}){
  const len=Math.hypot(dx,dz);if(len<1e-7)return false;
  const forward=new THREE.Vector3(dx/len,0,dz/len);
  const sideways=new THREE.Vector3(-forward.z,0,forward.x);
  for(const h of [.42,height*.62,height-.2]){
   for(const offset of [-radius*.72,0,radius*.72]){
    const sx=x+sideways.x*offset,sz=z+sideways.z*offset;
    for(const hit of hits(sx,y+h,sz,forward,len+radius)){
     const n=worldNormal(hit);
     if(n&&Math.abs(n.y)>.68)continue; // floor/ceiling; use floorAt instead
     return true;
    }
   }
  }
  return false;
 }
 return {refresh,restore,floorAt,blocked,get count(){return meshList.length}};
}
