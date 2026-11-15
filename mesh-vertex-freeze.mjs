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
 return stamps.filter(s=>s&&['raise','lower','flatten','smooth','trim'].includes(s.mode)&&
  validVec(s.center)&&validVec(s.normal)&&Number.isFinite(s.radius)&&s.radius>.02&&s.radius<=500&&
  Number.isFinite(s.strength)&&s.strength>.00001&&s.strength<=100
 ).map(s=>({mode:s.mode,center:s.center.slice(),normal:s.normal.slice(),
  radius:s.radius,strength:s.strength,locked:normalizedLocks(s.locked)}));
}
export function sculptRootPoints(points,stamps,locked=[],meshKey='0',topology=null){
 const safe=cleanSculptStamps(stamps);
 const result=points.map(p=>p.slice());
 for(const stamp of safe){
  const locks=new Set(stamp.locked?.[String(meshKey)]||locked);
  const [cx,cy,cz]=stamp.center,[nx,ny,nz]=stamp.normal;
  const normalLength=Math.hypot(nx,ny,nz)||1;
  const normal=[nx/normalLength,ny/normalLength,nz/normalLength];
  // Smooth is a LOCAL neighbor average on the shape BEFORE the stamp.
  const before=stamp.mode==='smooth'?result.map(p=>p.slice()):null;
  const affected=[];
  for(let i=0;i<result.length;i++){
   const p=result[i],distance=Math.hypot(p[0]-cx,p[1]-cy,p[2]-cz);
   if(distance>=stamp.radius||locks.has(i))continue;
   const falloff=(1-distance/stamp.radius)**2;
   const factor=Math.min(1,stamp.strength*.09*falloff);
   if(stamp.mode==='raise'||stamp.mode==='lower'){
    const d=(stamp.mode==='raise'?1:-1)*stamp.strength*.11*falloff;
    p[0]+=normal[0]*d;p[1]+=normal[1]*d;p[2]+=normal[2]*d;
   }else if(stamp.mode==='flatten'||stamp.mode==='trim'){
    const delta=(p[0]-cx)*normal[0]+(p[1]-cy)*normal[1]+(p[2]-cz)*normal[2];
    if(stamp.mode==='flatten'||delta>0){
     p[0]-=normal[0]*delta*factor;p[1]-=normal[1]*delta*factor;p[2]-=normal[2]*delta*factor;
    }
   }else affected.push({i,falloff});
  }
  if(before&&affected.length){
   // Connectivity-aware Laplacian: only vertices sharing real triangle edges
   // influence one another. Spatially nearby opposite cave walls never mix.
   // Keep the normal component of the neighbor correction to prevent
   // tangential contraction and collapsing a narrow tunnel.
   if(Array.isArray(topology)&&topology.length===before.length){
    for(const {i,falloff} of affected){
     const linked=topology[i];if(!linked?.length)continue;
     const p=before[i],avg=[0,0,0];
     let count=0;
     for(const j of linked){
      if(j===i||!before[j])continue;
      const q=before[j];
      for(let k=0;k<3;k++)avg[k]+=q[k];
      count++;
     }
     if(count<2)continue;
     const correction=avg.map((v,k)=>v/count-p[k]);
     // Limit individual changes relative to radius; never snap to a centroid.
     const maxStep=Math.max(.001,stamp.radius*.035);
     const magnitude=Math.hypot(...correction);
     const rate=Math.min(.32,stamp.strength*.035*falloff);
     const fraction=rate*Math.min(1,maxStep/Math.max(1e-8,magnitude));
     for(let k=0;k<3;k++)result[i][k]+=correction[k]*fraction;
    }
   }

  }
 }
 return result;
}
