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
  // Refined geometry includes a 0.085-unit anti-z-fighting offset and up
  // to 0.08 units of relaxation. Exactly pin the whole neighborhood of
  // each user seam instead of leaving a tiny displacement at that offset.
  const protectedMargin=Math.min(.25,radius*.4);
  const value=Number.isFinite(best)?
   smooth(Math.max(0,best-protectedMargin)/Math.max(.01,radius-protectedMargin)):1;
  cache.set(pk,value);
  return value;
 };
}
// A heightmap is a GEOMETRY source, not a material that must repeat hundreds
// of times with the color PNG. Map it across the whole cliff wall, vertically.
// Using color repeat (often 100–450 per world) on a 3-unit mesh caused severe
// aliasing: random tiny offsets while the shape stayed practically unchanged.
export function cliffWallProjection(triangles){
 const b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,
  minZ:Infinity,maxZ:-Infinity};
 for(const tri of triangles||[])for(const p of tri){
  b.minX=Math.min(b.minX,p[0]);b.maxX=Math.max(b.maxX,p[0]);
  b.minY=Math.min(b.minY,p[1]);b.maxY=Math.max(b.maxY,p[1]);
  b.minZ=Math.min(b.minZ,p[2]);b.maxZ=Math.max(b.maxZ,p[2]);
 }
 if(!Number.isFinite(b.minX))return null;
 const widthX=b.maxX-b.minX,widthZ=b.maxZ-b.minZ;
 const axis=widthX>=widthZ?0:2;
 return {axis,minU:axis===0?b.minX:b.minZ,
  spanU:Math.max(.001,axis===0?widthX:widthZ),
  minY:b.minY,spanY:Math.max(.001,b.maxY-b.minY)};
}
export function cliffHeightmapTone(source){
 if(!source?.data||!source.width||!source.height)return null;
 const d=source.data,n=source.width*source.height,step=Math.max(1,Math.floor(n/32768));
 let total=0,low=1,high=0,count=0;
 for(let i=0;i<n;i+=step){
  const k=i*4,alpha=d[k+3]/255;
  if(alpha<.1)continue;
  const value=(d[k]*.2126+d[k+1]*.7152+d[k+2]*.0722)/255;
  low=Math.min(low,value);high=Math.max(high,value);
  total+=value;count++;
 }
 if(!count)return null;
 return {mean:total/count,low,high,contrast:high-low};
}
export function hasMeaningfulCliffRelief(stats,{
 minRange=.16,minRms=.075,minMoved=12
}={}){
 return Boolean(stats?.moved>=minMoved&&stats?.range>=minRange&&
  stats?.rms>=minRms&&stats?.toneContrast>=.06&&
  stats?.sampledRange>=.07&&stats?.shapeChanged===true);
}
export function buildCliffBodyHeightmapBuffers(refined,{
 heightmap,strength=1.5,seamPaths=[],protectRadius=1.5,wallProjection=null
}={}){
 const pos=refined?.attributes?.position?.array||refined?.positions;
 const uvs=refined?.attributes?.uv?.array||refined?.uvs;
 const normals=refined?.attributes?.normal?.array||refined?.normals;
 if(!pos||!uvs||!normals||pos.length%9!==0||uvs.length*3!==pos.length*2||
   normals.length!==pos.length||!heightmap)return null;
 const tone=cliffHeightmapTone(heightmap);
 const amplitude=Math.max(0,Math.min(4,Number(strength)||0));
 if(!tone||tone.contrast<.06||amplitude<=0)return null;
 const wall=wallProjection||cliffWallProjection(Array.from(
  {length:pos.length/9},(_,i)=>Array.from({length:3},(_,j)=>[
   pos[i*9+j*3],pos[i*9+j*3+1],pos[i*9+j*3+2]
  ])));
 if(!wall||wall.spanY<.4)return null;
 const attenuation=protectionField(pos,seamPaths,Math.max(.5,protectRadius));
 const out=new Float32Array(pos.length),newNormals=new Float32Array(normals.length);
 const offsets=new Map();
 let moved=0,maxOffset=-Infinity,minOffset=Infinity,sum2=0,
  sampleMin=1,sampleMax=0;
 for(let i=0;i<pos.length;i+=3){
  const p=[pos[i],pos[i+1],pos[i+2]],pk=key(...p);
  let entry=offsets.get(pk);
  if(!entry){
   const u=wall.axis===0?p[0]:p[2];
   const wallU=Math.max(0,Math.min(1,(u-wall.minU)/wall.spanU));
   const wallV=Math.max(0,Math.min(1,(p[1]-wall.minY)/wall.spanY));
   const sample=sampleCliffHeight(heightmap,wallU,wallV,{repeat:false});
   // Center the grayscale and allow peaks AND hollows. A constant white
   // map no longer pushes the entire wall outward and pretends to be relief.
   const contrast=Math.max(.15,tone.contrast);
   const fade=attenuation(p);
   const offset=(sample-tone.mean)/contrast*amplitude*1.8*fade;
   entry={offset,sample};
   offsets.set(pk,entry);
  }
  const d=entry.offset;
  const nx=normals[i],ny=normals[i+1],nz=normals[i+2];
  // On a steep wall move horizontally along the wall normal. Never turn
  // horizontal grass/ground triangles into wavy vertical spikes.
  const lateral=Math.hypot(nx,nz);
  const slope=Math.min(1,lateral/.65);
  const dx=lateral>.05?nx/lateral:0,dz=lateral>.05?nz/lateral:0;
  const shift=d*slope;
  out[i]=p[0]+shift*dx;out[i+1]=p[1];out[i+2]=p[2]+shift*dz;
  if(Math.abs(shift)>1e-4)moved++;
  maxOffset=Math.max(maxOffset,shift);minOffset=Math.min(minOffset,shift);
  sum2+=shift*shift;
  sampleMin=Math.min(sampleMin,entry.sample);
  sampleMax=Math.max(sampleMax,entry.sample);
 }
 const stats={moved,maxOffset:Math.max(0,maxOffset),minOffset:Math.min(0,minOffset),
  range:maxOffset-minOffset,rms:Math.sqrt(sum2/(pos.length/3)),
  sampledRange:sampleMax-sampleMin,toneContrast:tone.contrast,vertices:pos.length/3,
  shapeChanged:false};
 stats.shapeChanged=stats.range>=.16&&stats.rms>=.075&&
  stats.moved>=Math.max(12,Math.floor(stats.vertices*.01))&&
  stats.sampledRange>=.07&&tone.contrast>=.06;
 stats.applied=hasMeaningfulCliffRelief(stats);
 if(!stats.applied)return {positions:null,uvs:null,normals:null,
  triangles:0,stats};
 // Recompute shading normals based on the DEFORMED geometry rather than the
 // original, otherwise the material continues looking perfectly flat.
 const sums=new Map();
 for(let i=0;i<out.length;i+=9){
  const ab=[out[i+3]-out[i],out[i+4]-out[i+1],out[i+5]-out[i+2]];
  const ac=[out[i+6]-out[i],out[i+7]-out[i+1],out[i+8]-out[i+2]];
  const face=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],
   ab[0]*ac[1]-ab[1]*ac[0]];
  for(let j=0;j<3;j++){
   const k=i+j*3,pk=key(out[k],out[k+1],out[k+2]);
   const sum=sums.get(pk)||[0,0,0];
   for(let q=0;q<3;q++)sum[q]+=face[q];
   sums.set(pk,sum);
  }
 }
 for(let i=0;i<out.length;i+=3){
  const sum=sums.get(key(out[i],out[i+1],out[i+2]))||
   [normals[i],normals[i+1],normals[i+2]];
  const length=Math.hypot(...sum)||1;
  newNormals[i]=sum[0]/length;newNormals[i+1]=sum[1]/length;
  newNormals[i+2]=sum[2]/length;
 }
 return {positions:out,uvs:new Float32Array(uvs),normals:newNormals,
  triangles:out.length/9,stats};
}
