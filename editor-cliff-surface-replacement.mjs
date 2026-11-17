import * as THREE from 'three';

// Runtime-only triangulation replacement for cliff patches. The terrain's
// editable source geometry and saved vertex IDs are NOT modified. When a
// heightmapped cliff is regenerated we mask just its original rendered faces
// and show its subdivided, displaced geometry in their place. Raycasts and
// terrain GPU masks then use the SAME replacement surface.
export function maskTerrainCliffFaces(source,faces){
 if(!source||!(faces instanceof Set)||faces.size===0)return null;
 const positions=source.getAttribute?.('position');
 if(!positions)return null;
 const original=source.index?.array||null;
 const faceCount=Math.floor((original?.length||positions.count)/3);
 const removed=new Set([...faces].filter(f=>Number.isInteger(f)&&f>=0&&f<faceCount));
 if(!removed.size)return null;
 const remaining=new Uint32Array((faceCount-removed.size)*3);
 let write=0;
 for(let f=0;f<faceCount;f++){
  if(removed.has(f))continue;
  const i=f*3;
  remaining[write++]=original?original[i]:i;
  remaining[write++]=original?original[i+1]:i+1;
  remaining[write++]=original?original[i+2]:i+2;
 }
 const geometry=new THREE.BufferGeometry();
 // The source attributes belong to the terrain/cutter. Sharing them leaves
 // seam anchors and sculpt vertex IDs untouched and avoids a second CPU copy.
 for(const [name,attribute] of Object.entries(source.attributes))
  geometry.setAttribute(name,attribute);
 geometry.setIndex(new THREE.Uint32BufferAttribute(remaining.subarray(0,write),1));
 geometry.boundingBox=source.boundingBox?.clone()||null;
 geometry.boundingSphere=source.boundingSphere?.clone()||null;
 if(!geometry.boundingSphere)geometry.computeBoundingSphere();
 geometry.userData={...source.userData,
  wildtrapCliffReplacedFaces:removed.size,
  wildtrapSourceFaces:faceCount,
  wildtrapRemainingFaces:write/3,
  wildtrapReplacement:true};
 return geometry;
}
