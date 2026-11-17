import * as THREE from 'three';

// Refine the VISUAL cliff surface only. The original terrain geometry,
// its collision, saved zones, and any cut/hole topology remain unchanged.
export function buildRefinedCliffGeometry(triangles,{repeat=8,maxEdge=3.0,maxTriangles=90000,minDivisions=3,maxDivisions=6}={}){
 if(!triangles?.length)return null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 let longest=0;
 for(const tri of triangles)longest=Math.max(longest,len(tri[0],tri[1]),len(tri[1],tri[2]),len(tri[2],tri[0]));
 // Use a single subdivision count for the entire selected patch so that
 // adjoining source triangles share the exact same edge vertices. Adaptive
 // per-face counts introduce T junctions and visible cracks.
 // Heightmapped cliffs can request dense, conforming triangulation so the
 // actual grayscale rock shapes can be sampled. This function is NOT called
 // for ordinary cliffs without an effective heightmap.
 let divisions=clamp(Math.ceil(longest/maxEdge),minDivisions,maxDivisions);
 while(divisions>minDivisions&&triangles.length*divisions*divisions>maxTriangles)divisions--;
 if(triangles.length*divisions*divisions>maxTriangles)
  throw Error('Heightmap excede el presupuesto de malla; usa lotes más pequeños');
 const vertices=[],faces=[],uvFaces=[];
 const lookup=new Map(),edgeCounts=new Map();
 const key=p=>p.map(v=>Math.round(v*10000)).join(':');
 function add(p){
  const k=key(p);
  if(lookup.has(k))return lookup.get(k);
  const index=vertices.length;
  vertices.push([...p]);lookup.set(k,index);return index;
 }
 function addEdge(a,b){
  const k=a<b?a+':'+b:b+':'+a;
  edgeCounts.set(k,(edgeCounts.get(k)||0)+1);
 }
 function register(a,b,c,projection){
  if(a===b||b===c||a===c)return;
  faces.push([a,b,c]);
  uvFaces.push(projection);
  addEdge(a,b);addEdge(b,c);addEdge(c,a);
 }
 const lerp=(a,b,c,u,v)=>[
  a[0]+u*(b[0]-a[0])+v*(c[0]-a[0]),
  a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]),
  a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])
 ];
 for(const tri of triangles){
  const [a,b,c]=tri;
  const ab=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const ac=new THREE.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
  const n=new THREE.Vector3().crossVectors(ab,ac);
  if(n.lengthSq()<1e-12)continue;
  const projection=Math.abs(n.x)>Math.abs(n.z)?'z':'x';
  const rows=[];
  for(let j=0;j<=divisions;j++){
   const row=[];
   for(let i=0;i<=divisions-j;i++){
    row.push(add(lerp(a,b,c,i/divisions,j/divisions)));
   }
   rows.push(row);
  }
  for(let j=0;j<divisions;j++){
   for(let i=0;i<divisions-j;i++){
    register(rows[j][i],rows[j][i+1],rows[j+1][i],projection);
    if(i+j<divisions-1)
     register(rows[j][i+1],rows[j+1][i+1],rows[j+1][i],projection);
   }
  }
 }
 if(!faces.length)return null;
 // Only internal vertices are allowed to relax. Pin all outer edges,
 // corners, cut boundaries, and abrupt ridges to preserve the real terrain.
 const neighbors=Array.from({length:vertices.length},()=>new Set());
 for(const [a,b,c] of faces){
  neighbors[a].add(b);neighbors[a].add(c);
  neighbors[b].add(a);neighbors[b].add(c);
  neighbors[c].add(a);neighbors[c].add(b);
 }
 const fixed=new Set();
 for(const [k,count] of edgeCounts){
  if(count!==2){const [a,b]=k.split(':').map(Number);fixed.add(a);fixed.add(b);}
 }
 const normals0=Array.from({length:vertices.length},()=>new THREE.Vector3());
 for(const [a,b,c] of faces){
  const x=vertices[a],y=vertices[b],z=vertices[c];
  const normal=new THREE.Vector3().crossVectors(
   new THREE.Vector3(y[0]-x[0],y[1]-x[1],y[2]-x[2]),
   new THREE.Vector3(z[0]-x[0],z[1]-x[1],z[2]-x[2]));
  normals0[a].add(normal);normals0[b].add(normal);normals0[c].add(normal);
 }
 for(const n of normals0)n.normalize();
 const original=vertices.map(p=>[...p]);
 // Tangential smoothing is restrained to prevent pulling the overlay away
 // from the collider. Max movement is 0.08 world units from original surface.
 for(let iteration=0;iteration<3;iteration++){
  const next=vertices.map(p=>[...p]);
  for(let i=0;i<vertices.length;i++){
   if(fixed.has(i)||neighbors[i].size<4)continue;
   const p=vertices[i],ns=[...neighbors[i]];
   const avg=[0,0,0];
   for(const j of ns)for(let k=0;k<3;k++)avg[k]+=vertices[j][k]/ns.length;
   const d=avg.map((v,k)=>(v-p[k])*.28);
   const normal=normals0[i];
   const projection=d[0]*normal.x+d[1]*normal.y+d[2]*normal.z;
   // Retain a small fraction of normal-direction relaxation. Tangential-only
   // smoothing changes tessellation but cannot round a triangulated ridge.
   // Limit total displacement to protect the underlying collision surface.
   for(let k=0;k<3;k++)d[k]-=.70*projection*normal.getComponent(k);
   const target=p.map((v,k)=>v+d[k]);
   const off=target.map((v,k)=>v-original[i][k]);
   const magnitude=Math.hypot(...off);
   next[i]=magnitude>.08?original[i].map((v,k)=>v+off[k]*.08/magnitude):target;
  }
  for(let i=0;i<vertices.length;i++)vertices[i]=next[i];
 }
 // Vertex normals are accumulated across neighboring triangles and reused
 // across UV seams. The UV projection stays consistent with the existing
 // cliff material until the separate top/body phase.
 const normals=Array.from({length:vertices.length},()=>new THREE.Vector3());
 for(const [a,b,c] of faces){
  const x=vertices[a],y=vertices[b],z=vertices[c];
  const normal=new THREE.Vector3().crossVectors(
   new THREE.Vector3(y[0]-x[0],y[1]-x[1],y[2]-x[2]),
   new THREE.Vector3(z[0]-x[0],z[1]-x[1],z[2]-x[2]));
  normals[a].add(normal);normals[b].add(normal);normals[c].add(normal);
 }
 for(const n of normals)n.normalize();
 const pos=[],uv=[],norm=[];
 const scale=Math.max(.25,Number(repeat)||8)/630;
 for(let f=0;f<faces.length;f++){
  const proj=uvFaces[f];
  for(const id of faces[f]){
   const p=vertices[id],n=normals[id];
   // Offset only the rendered cliff material to prevent z-fighting.
   pos.push(p[0]+n.x*.085,p[1]+n.y*.085,p[2]+n.z*.085);
   uv.push((proj==='z'?p[2]:p[0])*scale,p[1]*scale);
   norm.push(n.x,n.y,n.z);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.computeBoundingSphere();
 geometry.userData={sourceTriangles:triangles.length,
  divisions,generatedTriangles:pos.length/9,subdivisionRatio:(pos.length/9)/triangles.length};
 return geometry;
}

// Original cliff material: no subdivision, no smoothing and no heightmap
// displacement. Only a tiny rendering offset prevents Z-fighting against the
// immutable terrain source (which remains editable and intact).
export function buildOriginalCliffMaterialGeometry(triangles,{repeat=8}={}){
 if(!triangles?.length)return null;
 const pos=[],uv=[],norm=[],scale=Math.max(.25,Number(repeat)||8)/630;
 for(const tri of triangles){
  const [a,b,c]=tri;
  const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],
   ab[0]*ac[1]-ab[1]*ac[0]];
  const length=Math.hypot(...n)||1;
  const nn=n.map(x=>x/length),proj=Math.abs(nn[0])>Math.abs(nn[2])?2:0;
  for(const p of tri){
   pos.push(p[0]+nn[0]*.04,p[1]+nn[1]*.04,p[2]+nn[2]*.04);
   norm.push(...nn);
   uv.push(p[proj]*scale,p[1]*scale);
  }
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geo.computeBoundingSphere();
 geo.userData={sourceTriangles:triangles.length,generatedTriangles:triangles.length,
  divisions:1,subdivisionRatio:1,unrefined:true};
 return geo;
}
