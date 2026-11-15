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
   // Distribute CONVERGES toward each local connected component's center
   // in X,Y,Z simultaneously. Never repel or extrapolate away from the
   // centroid. Separate cave walls remain separate components.
   const candidate=new Set(included.map(v=>v[0]));
   const fades=new Map(included);
   const visited=new Set();
   for(const [seed] of included){
    if(visited.has(seed))continue;
    const group=[],pending=[seed];visited.add(seed);
    for(let k=0;k<pending.length;k++){
     const i=pending[k];group.push(i);
     for(const j of topology[i]){
      if(candidate.has(j)&&!visited.has(j)){visited.add(j);pending.push(j)}
     }
    }
    if(group.length<2)continue;
    const centroid=[0,0,0];
    for(const i of group)for(let k=0;k<3;k++)centroid[k]+=result[i][k]/group.length;
    // Calculate from a frozen snapshot to prevent ordering-dependent drift.
    const before=new Map(group.map(i=>[i,result[i].slice()]));
    for(const i of group){
     const fade=fades.get(i);
     const rate=Math.min(.75,strength*.035*fade);
     const point=before.get(i);
     for(let k=0;k<3;k++)result[i][k]=point[k]+(centroid[k]-point[k])*rate;
    }
   }
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
