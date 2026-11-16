// Single-material cliff body displacement. UV coordinates arrive from the
// existing WILDTRAP cliff renderer (same 630-unit repetition scale visible
// in the texture editor). No Top split, no separate hidden tile dimensions.
import {sampleCliffHeight} from './editor-cliff-top-body.mjs?v=0.9.101';
const key=(x,y,z)=>[x,y,z].map(v=>Math.round(v*10000)).join(':');
const smooth=t=>{const q=Math.max(0,Math.min(1,t));return q*q*(3-2*q)};
function pointDistance(p,a,b){
 const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ap=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];
 const len=Math.max(1e-12,ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2]);
 const t=Math.max(0,Math.min(1,(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/len));
 return Math.hypot(p[0]-a[0]-t*ab[0],p[1]-a[1]-t*ab[1],p[2]-a[2]-t*ab[2]);
}
// The subdivided output is non-indexed. Count each shared triangle edge once,
// and pin the physical patch rim and all manual protected seam paths.
function protectionField(position,seamPaths,radius=2.5){
 const edgeMap=new Map(),pairs=new Map();
 for(let i=0;i+8<position.length;i+=9){
  const tri=[];
  for(let j=0;j<3;j++){const k=i+3*j;tri.push([position[k],position[k+1],position[k+2]])}
  for(let j=0;j<3;j++){
   const a=tri[j],b=tri[(j+1)%3],ak=key(...a),bk=key(...b);
   const ek=ak<bk?ak+'|'+bk:bk+'|'+ak;
   const found=edgeMap.get(ek);
   if(found)found.count++;
   else edgeMap.set(ek,{a,b,count:1});
  }
 }
 const edges=[];
 for(const e of edgeMap.values())if(e.count===1)edges.push([e.a,e.b]);
 for(const path of seamPaths||[]){
  if(!Array.isArray(path))continue;
  for(let j=1;j<path.length;j++){
   const a=path[j-1],b=path[j];
   if(a?.length===3&&b?.length===3&&a.every(Number.isFinite)&&b.every(Number.isFinite))
    edges.push([a,b]);
  }
 }
 // Bucket edges by world position to avoid vertex×edge quadratic scans.
 const size=radius*1.5,cell=new Map();
 for(let i=0;i<edges.length;i++){
  const [a,b]=edges[i],len=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const count=Math.max(1,Math.ceil(len/size));
  for(let j=0;j<=count;j++){
   const t=j/count,p=[0,1,2].map(k=>a[k]+(b[k]-a[k])*t);
   const k=p.map(v=>Math.floor(v/size)).join(':');
   if(!cell.has(k))cell.set(k,new Set());
   cell.get(k).add(i);
  }
 }
 const cache=new Map();
 return p=>{
  const pk=key(...p);
  if(cache.has(pk))return cache.get(pk);
  const base=p.map(v=>Math.floor(v/size));
  let best=Infinity;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   const ids=cell.get([base[0]+x,base[1]+y,base[2]+z].join(':'));
   for(const id of ids||[]){
    const [a,b]=edges[id];
    best=Math.min(best,pointDistance(p,a,b));
   }
  }
  const value=Number.isFinite(best)?smooth(best/radius):1;
  cache.set(pk,value);
  return value;
 };
}
export function buildCliffBodyHeightmapBuffers(refined,{
 heightmap,strength=1.5,seamPaths=[],protectRadius=2.5
}={}){
 const pos=refined?.attributes?.position?.array||refined?.positions;
 const uvs=refined?.attributes?.uv?.array||refined?.uvs;
 const normals=refined?.attributes?.normal?.array||refined?.normals;
 if(!pos||!uvs||!normals||pos.length%9!==0||uvs.length*3!==pos.length*2||
   normals.length!==pos.length||!heightmap)return null;
 const attenuation=protectionField(pos,seamPaths,Math.max(.1,protectRadius));
 const out=new Float32Array(pos.length),newNormals=new Float32Array(normals.length);
 const amplitude=Math.max(0,Math.min(4,Number(strength)||0));
 let moved=0,maxOffset=0;
 const offsets=new Map();
 for(let i=0;i<pos.length;i+=3){
  const p=[pos[i],pos[i+1],pos[i+2]],pk=key(...p);
  let d=offsets.get(pk);
  if(d===undefined){
   const uv=i/3*2;
   d=sampleCliffHeight(heightmap,uvs[uv],uvs[uv+1],{repeat:true})*
    amplitude*attenuation(p);
   offsets.set(pk,d);
  }
  const nx=normals[i],ny=normals[i+1],nz=normals[i+2],length=Math.hypot(nx,ny,nz)||1;
  out[i]=p[0]+d*nx/length;out[i+1]=p[1]+d*ny/length;out[i+2]=p[2]+d*nz/length;
  if(d>1e-4)moved++;
  maxOffset=Math.max(maxOffset,d);
 }
 // Recompute smooth normals from DISPLACED triangles. Nonindexed Three.js
 // computeVertexNormals would otherwise produce faceted shading per triangle.
 const normalSums=new Map();
 for(let i=0;i<out.length;i+=9){
  const ax=out[i+3]-out[i],ay=out[i+4]-out[i+1],az=out[i+5]-out[i+2];
  const bx=out[i+6]-out[i],by=out[i+7]-out[i+1],bz=out[i+8]-out[i+2];
  const face=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
  for(let j=0;j<3;j++){
   const k=i+j*3,lookup=key(out[k],out[k+1],out[k+2]);
   const sum=normalSums.get(lookup)||[0,0,0];
   sum[0]+=face[0];sum[1]+=face[1];sum[2]+=face[2];normalSums.set(lookup,sum);
  }
 }
 for(let i=0;i<out.length;i+=3){
  const sum=normalSums.get(key(out[i],out[i+1],out[i+2]))||
   [normals[i],normals[i+1],normals[i+2]];
  const len=Math.hypot(...sum)||1;
  newNormals[i]=sum[0]/len;newNormals[i+1]=sum[1]/len;newNormals[i+2]=sum[2]/len;
 }
 return {positions:out,uvs:new Float32Array(uvs),normals:newNormals,
  triangles:out.length/9,stats:{moved,maxOffset}};
}
