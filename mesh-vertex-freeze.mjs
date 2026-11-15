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
  radius:s.radius,strength:s.strength,locked:normalizedLocks(s.locked)}));
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
   for(let i=0;i<result.length;i++){
    if(locks.has(i))continue;
    const p=result[i],d=Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]);
    if(d>=r)continue;
    const fade=(1-d/r)**1.4;
    if(stamp.mode==='raise'||stamp.mode==='lower'){
     const value=(stamp.mode==='raise'?1:-1)*strength*.11*fade;
     for(let k=0;k<3;k++)p[k]+=n[k]*value;
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
   if(d<r)included.push([i,(1-d/r)**1.5]);
  }
  if(!included.length)continue;
  const rounds=stamp.mode==='smooth'?2:3;
  for(let iteration=0;iteration<rounds;iteration++){
   const before=result.map(v=>v.slice()),updates=[];
   for(const [i,fade] of included){
    const p=before[i],neighbors=topology[i].filter(j=>j!==i&&before[j]);
    if(neighbors.length<2)continue;
    const move=[0,0,0];
    if(stamp.mode==='smooth'){
     // Uniform Laplacian smoothing: average only edge-connected neighbors.
     // Avoid the near-zero old stroke factor that made Smooth imperceptible.
     for(const j of neighbors)for(let k=0;k<3;k++)move[k]+=before[j][k]-p[k];
     for(let k=0;k<3;k++)move[k]/=neighbors.length;
     // Smooth height/shape along the brush surface normal only.
     // Tangential Laplacian averaging would collapse densely packed edges;
     // Distribute handles edge spacing independently.
     const depth=move[0]*n[0]+move[1]*n[1]+move[2]*n[2];
     for(let k=0;k<3;k++)move[k]=n[k]*depth;
    }else{
     // Estimate the characteristic edge length from the local two-ring,
     // rather than from compressed incident edges alone.
     const lengths=[];
     const ring=new Set([i,...neighbors]);
     for(const j of neighbors)for(const h of topology[j]||[])ring.add(h);
     for(const j of ring){
      if(!before[j])continue;
      const list=topology[j]||[];
      for(const h of list){
       if(h<=j||!ring.has(h)||!before[h])continue;
       const length=Math.hypot(...before[j].map((v,k)=>v-before[h][k]));
       if(length>1e-6)lengths.push(length);
      }
     }
     if(!lengths.length)continue;
     lengths.sort((a,b)=>a-b);
     const target=lengths[Math.floor(lengths.length/2)];
     for(const j of neighbors){
      const q=before[j],dx=p[0]-q[0],dy=p[1]-q[1],dz=p[2]-q[2];
      const length=Math.hypot(dx,dy,dz);
      if(length<1e-8)continue;
      // Stronger response to compressed edges; mild pull on stretched edges.
      const imbalance=Math.max(-.55,Math.min(.9,(target-length)/target));
      for(let k=0;k<3;k++)move[k]+=(p[k]-q[k])/length*imbalance*target;
     }
     for(let k=0;k<3;k++)move[k]/=neighbors.length;
     // Moderate centroid correction avoids irregular tangential distribution.
     const average=[0,0,0];
     for(const j of neighbors)for(let k=0;k<3;k++)average[k]+=before[j][k];
     for(let k=0;k<3;k++)move[k]+=.15*(average[k]/neighbors.length-p[k]);
    }
    const maxStep=r*(stamp.mode==='smooth'?.13:.10);
    const magnitude=Math.hypot(...move);
    const rate=Math.min(stamp.mode==='smooth'?.60:.48,strength*.07*fade);
    const step=rate*Math.min(1,maxStep/Math.max(magnitude,1e-8));
    updates.push([i,move.map(v=>v*step)]);
   }
   for(const [i,delta] of updates)for(let k=0;k<3;k++)result[i][k]+=delta[k];
  }
 }
 return result;
}
