import {normalizedLocks} from './mesh-deform.mjs';
// Per-vertex anchors and sculpt operations are instance-local, not GLB edits.
// All coordinates here are either model-root-local or WORLD as named.
const validVec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e7);
export function normalizedVertexAnchors(data){
 const output={};
 if(!data||typeof data!=='object'||Array.isArray(data))return output;
 for(const [meshKey,vertices] of Object.entries(data)){
  if(!/^\d{1,4}$/.test(meshKey)||!vertices||typeof vertices!=='object'||Array.isArray(vertices))continue;
  const accepted={};
  for(const [index,value] of Object.entries(vertices)){
   if(!/^\d{1,7}$/.test(index)||!value||!validVec(value.root)||!validVec(value.world)||
    !Number.isFinite(value.scale)||value.scale<.001||value.scale>1000)continue;
   accepted[index]={root:value.root.slice(),world:value.world.slice(),scale:value.scale};
  }
  if(Object.keys(accepted).length)output[meshKey]=accepted;
 }
 return output;
}
// Root scale is uniform. Preserve a locked vertex's world offset when the
// WHOLE model scales; allow translating/rotating the model by default.
export function normalAnchorRootPoint(anchor,currentScale){
 const f=anchor.scale/(Number.isFinite(currentScale)&&currentScale>.00001?currentScale:1);
 return anchor.root.map(v=>v*f);
}
export function cleanSculptStamps(stamps){
 if(!Array.isArray(stamps))return [];
 return stamps.filter(s=>s&&['raise','lower','flatten','smooth','trim','relax'].includes(s.mode)&&
  validVec(s.center)&&validVec(s.normal)&&Number.isFinite(s.radius)&&s.radius>.02&&s.radius<=500&&
  Number.isFinite(s.strength)&&s.strength>.00001&&s.strength<=100
 ).map(s=>({mode:s.mode,center:s.center.slice(),normal:s.normal.slice(),
  radius:s.radius,strength:s.strength,flatDirection:s.flatDirection==='min'?'min':s.flatDirection==='max'?'max':null,locked:normalizedLocks(s.locked)}));
}
// Local, topology-only sculpting. Smooth reduces irregular height changes;
// Distribute equalizes connected edge spacing (no new vertices or remeshing).
export function sculptRootPoints(points,stamps,locked=[],meshKey='0',topology=null){
 const result=points.map(p=>p.slice());
 for(const stamp of cleanSculptStamps(stamps)){
  const locks=new Set(stamp.locked?.[String(meshKey)]||locked);
  const center=stamp.center,normal=stamp.normal;
  const normalLength=Math.hypot(...normal)||1;
  const n=normal.map(v=>v/normalLength);
  const strength=Math.min(30,stamp.strength);
  const r=stamp.radius;
  if(stamp.mode==='raise'||stamp.mode==='lower'||stamp.mode==='flatten'||stamp.mode==='trim'){
   // New directional Flatten uses the actual highest/lowest Y within the brush.
   // Old saved stamps have no flatDirection and keep their original plane behavior.
   let referenceHeight=null;
   if(stamp.mode==='flatten'&&stamp.flatDirection){
    for(const p of result){
     if(Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])>=r)continue;
     if(referenceHeight===null)referenceHeight=p[1];
     else referenceHeight=stamp.flatDirection==='max'?Math.max(referenceHeight,p[1]):Math.min(referenceHeight,p[1]);
    }
   }
   for(let i=0;i<result.length;i++){
    if(locks.has(i))continue;
    const p=result[i],d=Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]);
    if(d>=r)continue;
    const fade=(1-d/r)**1.4;
    if(stamp.mode==='raise'||stamp.mode==='lower'){
     const value=(stamp.mode==='raise'?1:-1)*strength*.11*fade;
     for(let k=0;k<3;k++)p[k]+=n[k]*value;
    }else if(stamp.mode==='flatten'&&referenceHeight!==null){
     const factor=Math.min(.95,strength*.075*fade);
     p[1]+=(referenceHeight-p[1])*factor;
    }else{
     const delta=(p[0]-center[0])*n[0]+(p[1]-center[1])*n[1]+(p[2]-center[2])*n[2];
     if(stamp.mode==='trim'&&delta<=0)continue;
     const factor=Math.min(.85,strength*.06*fade);
     for(let k=0;k<3;k++)p[k]-=n[k]*delta*factor;
    }
   }
   continue;
  }
  if(!Array.isArray(topology)||topology.length!==result.length)continue;
  const included=[];
  for(let i=0;i<result.length;i++){
   if(locks.has(i)||!topology[i]?.length)continue;
   const p=result[i],d=Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]);
   if(d<r)included.push([i,(1-d/r)**.75]);
  }
  if(!included.length)continue;
  if(stamp.mode==='relax'){
   // Edge-local mesh relaxation: the brush selects vertices, but NEVER
   // determines a destination. Only topology neighbours exert forces.
   // Equalize short/long edges without collapsing the component centroid.
   const fades=new Map(included);
   const active=new Set(fades.keys());
   const before=result.map(p=>p.slice());
   const edges=[];
   for(const [i] of included){
    for(const j of topology[i]){
     if(!Number.isInteger(j)||j<0||j>=before.length||j===i)continue;
     if(active.has(j)&&j<i)continue;
     const p=before[i],q=before[j];
     const length=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
     // Duplicate seam vertices at the same location should remain welded.
     if(length>1e-6)edges.push({i,j,length});
    }
   }
   if(!edges.length)continue;
   // A robust local reference length from REAL connected edges, independent
   // of camera angle, global axes, or position of the mouse within the brush.
   const sorted=edges.map(e=>e.length).sort((a,b)=>a-b);
   const reference=sorted[Math.floor(sorted.length/2)];
   const forces=new Map(included.map(([i])=>[i,[0,0,0]]));
   const weights=new Map(included.map(([i])=>[i,0]));
   for(const {i,j,length} of edges){
    const p=before[i],q=before[j];
    // Keep displacement conservative to avoid turning triangles inside out.
    const imbalance=Math.max(-.65,Math.min(.65,(length-reference)/Math.max(reference,1e-6)));
    const tension=imbalance*reference/length;
    for(const [vertex,sign] of [[i,1],[j,-1]]){
     if(!active.has(vertex))continue;
     const f=forces.get(vertex);
     for(let k=0;k<3;k++)f[k]+=(q[k]-p[k])*tension*sign;
     weights.set(vertex,weights.get(vertex)+1);
    }
   }
   // Small Laplacian correction irons uneven angles around each vertex.
   // No common component centroid is used; only directly connected neighbours.
   const correction=new Map();
   for(const [i,fade] of included){
    const neighbours=topology[i].filter(j=>Number.isInteger(j)&&j>=0&&j<before.length&&j!==i);
    if(!neighbours.length)continue;
    const p=before[i],avg=[0,0,0],edgeLengths=[];
    for(const j of neighbours){
     const q=before[j];
     for(let k=0;k<3;k++)avg[k]+=q[k]/neighbours.length;
     const d=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
     if(d>1e-6)edgeLengths.push(d);
    }
    if(!edgeLengths.length)continue;
    const f=forces.get(i),weight=Math.max(1,weights.get(i));
    const amplitude=Math.min(.34,strength*.022)*fade;
    const meanEdge=edgeLengths.reduce((a,b)=>a+b,0)/edgeLengths.length;
    const maxStep=Math.min(reference,meanEdge)*.22;
    const move=[0,1,2].map(k=>
     ((f[k]/weight)*.75+(avg[k]-p[k])*.25)*amplitude);
    const len=Math.hypot(...move);
    correction.set(i,move.map(v=>v*Math.min(1,maxStep/Math.max(len,1e-8))));
   }
   // Anchored vertices and the region boundary remain in place; interior
   // vertices move simultaneously based on frozen positions (no chain drift).
   for(const [i,move] of correction)for(let k=0;k<3;k++)result[i][k]+=move[k];
   continue;
  }
  // Smooth only along the local brush normal, retaining vertex spacing.
  for(let iteration=0;iteration<2;iteration++){
   const before=result.map(v=>v.slice()),updates=[];
   for(const [i,fade] of included){
    const p=before[i],neighbors=topology[i].filter(j=>j!==i&&before[j]);
    if(neighbors.length<2)continue;
    const delta=[0,0,0];
    for(const j of neighbors)for(let k=0;k<3;k++)delta[k]+=(before[j][k]-p[k])/neighbors.length;
    const depth=delta[0]*n[0]+delta[1]*n[1]+delta[2]*n[2];
    const amount=Math.min(.6,strength*.07*fade)*depth;
    updates.push([i,amount]);
   }
   for(const [i,amount] of updates)for(let k=0;k<3;k++)result[i][k]+=n[k]*amount;
  }
 }
 return result;
}
