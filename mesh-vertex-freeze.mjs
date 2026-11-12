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
 return stamps.slice(0,240).filter(s=>s&&['raise','lower','flatten','smooth'].includes(s.mode)&&
  validVec(s.center)&&validVec(s.normal)&&Number.isFinite(s.radius)&&s.radius>.02&&s.radius<=500&&
  Number.isFinite(s.strength)&&s.strength>.00001&&s.strength<=100
 ).map(s=>({mode:s.mode,center:s.center.slice(),normal:s.normal.slice(),
  radius:s.radius,strength:s.strength,locked:normalizedLocks(s.locked)}));
}
export function sculptRootPoints(points,stamps,locked=[],meshKey='0'){
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
   }else if(stamp.mode==='flatten'){
    const delta=(p[0]-cx)*normal[0]+(p[1]-cy)*normal[1]+(p[2]-cz)*normal[2];
    p[0]-=normal[0]*delta*factor;p[1]-=normal[1]*delta*factor;p[2]-=normal[2]*delta*factor;
   }else affected.push({i,falloff});
  }
  if(before&&affected.length){
   // Spatial hash: smoothing a dense GLB must not compare every active
   // vertex against EVERY other vertex (quadratic lockups).
   const near=stamp.radius*.35,nearSq=near*near,inv=1/Math.max(.00001,near);
   const key=(x,y,z)=>x+','+y+','+z;
   const cells=new Map(),grid=[];
   for(let j=0;j<before.length;j++){
    const p=before[j],x=Math.floor(p[0]*inv),y=Math.floor(p[1]*inv),z=Math.floor(p[2]*inv);
    grid[j]=[x,y,z];
    const token=key(x,y,z),cell=cells.get(token)||[];
    cell.push(j);cells.set(token,cell);
   }
   for(const {i,falloff} of affected){
    const p=before[i],neighbors=[0,0,0];let count=0;
    const [x,y,z]=grid[i];
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){
     for(const j of cells.get(key(x+a,y+b,z+c))||[]){
      const other=before[j];
      const d2=(p[0]-other[0])**2+(p[1]-other[1])**2+(p[2]-other[2])**2;
      if(d2>nearSq)continue;
      neighbors[0]+=other[0];neighbors[1]+=other[1];neighbors[2]+=other[2];count++;
     }
    }
    if(count<2)continue;
    const t=Math.min(.65,stamp.strength*.04*falloff);
    for(let k=0;k<3;k++)result[i][k]+=(neighbors[k]/count-p[k])*t;
   }
  }
 }
 return result;
}
