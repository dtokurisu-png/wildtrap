// WT plains cliff prototype: real vertex displacement from TWO grayscale maps.
// Geometry is a separate, subdivided visual patch; source terrain XYZ, cuts,
// saved cliff contours and locked seam anchors are NEVER modified.
// The resulting patches can also participate in playtest raycast collision.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const key=p=>p.map(v=>Math.round(v*10000)).join(':');
export const PLAINS_CLIFF_DEFAULTS=Object.freeze({
 strength:1.5,topFraction:.23,bodyTileWidth:20,bodyTileHeight:16
});
// Canvas pixels have their origin at the top left. WebGL UVs at the bottom.
export function sampleCliffHeight(source,u,v,{repeat=false}={}){
 if(!source?.data?.length||!source.width||!source.height)return 0;
 const w=source.width,h=source.height;
 const norm=x=>repeat?((x%1)+1)%1:clamp(x,0,1);
 const x=norm(u)*(repeat?w:w-1),y=(1-norm(v))*(repeat?h:h-1);
 const get=(ix,iy)=>{
  ix=repeat?(ix%w+w)%w:clamp(ix,0,w-1);
  iy=repeat?(iy%h+h)%h:clamp(iy,0,h-1);
  const k=(iy*w+ix)*4,d=source.data;
  // Weighted grayscale also supports slightly tinted height-map exports.
  return ((d[k]*.2126+d[k+1]*.7152+d[k+2]*.0722)/255)*(d[k+3]/255);
 };
 const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
 return lerp(lerp(get(x0,y0),get(x0+1,y0),tx),
             lerp(get(x0,y0+1),get(x0+1,y0+1),tx),ty);
}
function boundaryGrid(positions,paths,cell=5){
 // Build spatial pins from ORIGINAL triangle boundaries + explicit user seams.
 // Preserving original boundaries also prevents displacement across cut edges.
 const edges=new Map(),points=new Map();
 const addEdge=(a,b)=>{
  const ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;
  const old=edges.get(k);if(old)old.count++;else edges.set(k,{a,b,count:1});
 };
 for(let i=0;i+8<positions.length;i+=9){
  const a=[positions[i],positions[i+1],positions[i+2]],
   b=[positions[i+3],positions[i+4],positions[i+5]],
   c=[positions[i+6],positions[i+7],positions[i+8]];
  addEdge(a,b);addEdge(b,c);addEdge(c,a);
 }
 const add=p=>{if(p?.length===3&&p.every(Number.isFinite))points.set(key(p),p)};
 const segments=[];
 for(const e of edges.values())if(e.count===1){add(e.a);add(e.b);segments.push([e.a,e.b]);}
 for(const path of paths||[])for(let i=0;i<path.length;i++){
  add(path[i]);
  if(i&&path[i-1]?.length===3&&path[i]?.length===3)
   segments.push([path[i-1],path[i]]);
 }
 // Exact line-segment distance near each boundary, accelerated by a 3D grid.
 const grid=new Map();
 for(const [a,b] of segments){
  const steps=Math.max(1,Math.ceil(dist(a,b)/cell));
  for(let k=0;k<=steps;k++){
   const p=[0,1,2].map(j=>lerp(a[j],b[j],k/steps));
   const xyz=p.map(v=>Math.floor(v/cell)),bucket=xyz.join(':');
   if(!grid.has(bucket))grid.set(bucket,[]);
   grid.get(bucket).push(p);
  }
 }
 return p=>{
  const xyz=p.map(v=>Math.floor(v/cell));let best=Infinity;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   const hit=grid.get([xyz[0]+x,xyz[1]+y,xyz[2]+z].join(':'));
   for(const q of hit||[])best=Math.min(best,dist(p,q));
  }
  return Number.isFinite(best)?smooth(best/(cell*.85)):1;
 };
}
function localVerticalBounds(positions,axis){
 let low=Infinity,high=-Infinity,umin=Infinity,umax=-Infinity;
 for(let i=0;i<positions.length;i+=3){
  umin=Math.min(umin,positions[i+axis]);umax=Math.max(umax,positions[i+axis]);
 }
 const span=Math.max(1e-5,umax-umin);
 const n=clamp(Math.ceil(span/6),8,64);
 const bottoms=Array(n).fill(Infinity),tops=Array(n).fill(-Infinity);
 for(let i=0;i<positions.length;i+=3){
  const y=positions[i+1],u=clamp((positions[i+axis]-umin)/span,0,1);
  const bin=clamp(Math.round(u*(n-1)),0,n-1);
  bottoms[bin]=Math.min(bottoms[bin],y);
  tops[bin]=Math.max(tops[bin],y);
  low=Math.min(low,y);high=Math.max(high,y);
 }
 // Fill empty columns by the closest populated column. Relax only values,
 // not the actual user-edited mesh vertices.
 for(let i=0;i<n;i++)if(!Number.isFinite(bottoms[i])){
  let j=0;while(j<n&&!Number.isFinite(bottoms[j]))j++;
  if(j<n){bottoms[i]=bottoms[j];tops[i]=tops[j]}
  else{bottoms[i]=low;tops[i]=high}
 }
 const b0=[...bottoms],t0=[...tops];
 for(let i=0;i<n;i++){
  const a=Math.max(0,i-1),b=Math.min(n-1,i+1);
  bottoms[i]=(b0[a]+b0[i]+b0[b])/3;
  tops[i]=(t0[a]+t0[i]+t0[b])/3;
 }
 const at=(values,u)=>{
  const t=clamp((u-umin)/span,0,1)*(n-1),i=Math.floor(t);
  return lerp(values[i],values[Math.min(n-1,i+1)],t-i);
 };
 return {umin,span,minY:low,maxY:high,at,pair:p=>{
  const u=p[axis];return [at(bottoms,u),at(tops,u)];
 }};
}
function seamGuides(paths,bounds,axis){
 const candidates=(paths||[]).filter(path=>path?.length>1&&path.some(p=>
  p&&p[0]>=bounds.minX-12&&p[0]<=bounds.maxX+12&&
  p[2]>=bounds.minZ-12&&p[2]<=bounds.maxZ+12));
 candidates.sort((a,b)=>b.reduce((s,p)=>s+p[1],0)/b.length-
                       a.reduce((s,p)=>s+p[1],0)/a.length);
 const guides=[candidates[0],candidates.length>1?candidates.at(-1):null];
 function nearbyY(p,path){
  if(!path)return null;let best=Infinity,result=null;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2];
   const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/Math.max(1e-10,dx*dx+dz*dz),0,1);
   const d=Math.hypot(p[0]-(a[0]+dx*t),p[2]-(a[2]+dz*t));
   if(d<best){best=d;result=lerp(a[1],b[1],t)}
  }
  return best<14?result:null;
 }
 return p=>[nearbyY(p,guides[0]),nearbyY(p,guides[1])];
}
function normals(source,i){
 return [source[i],source[i+1],source[i+2]];
}
function interpolate(a,b,t){
 return {p:a.p.map((v,i)=>lerp(v,b.p[i],t)),
  n:a.n.map((v,i)=>lerp(v,b.n[i],t)),
  level:lerp(a.level,b.level,t)};
}
function clip(vertices,threshold,keepTop){
 const out=[],inside=p=>keepTop?p.level>=threshold-1e-8:p.level<=threshold+1e-8;
 for(let j=0;j<vertices.length;j++){
  const a=vertices[j],b=vertices[(j+1)%vertices.length],aa=inside(a),bb=inside(b);
  if(aa)out.push(a);
  if(aa!==bb&&Math.abs(b.level-a.level)>1e-12){
   const p=interpolate(a,b,clamp((threshold-a.level)/(b.level-a.level),0,1));
   p.level=threshold;out.push(p);
  }
 }
 return out;
}
export function buildCliffTopBodyBuffers(refined,{
 topHeight,bodyHeight,strength=1.5,topFraction=.23,bodyTileWidth=20,
 bodyTileHeight=16,seamPaths=[]
}={}){
 const position=refined?.attributes?.position?.array||refined?.positions;
 const normal=refined?.attributes?.normal?.array||refined?.normals;
 if(!position||!normal||position.length!==normal.length||position.length<9)
  return {top:null,body:null,stats:{reason:'invalid geometry'}};
 const b={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};
 for(let i=0;i<position.length;i+=3){
  b.minX=Math.min(b.minX,position[i]);b.maxX=Math.max(b.maxX,position[i]);
  b.minZ=Math.min(b.minZ,position[i+2]);b.maxZ=Math.max(b.maxZ,position[i+2]);
 }
 const axis=b.maxX-b.minX>=b.maxZ-b.minZ?0:2;
 const bounds=localVerticalBounds(position,axis);
 if(bounds.maxY-bounds.minY<1.5)return {top:null,body:null,stats:{reason:'flat surface'}};
 const seamBounds=seamGuides(seamPaths,b,axis);
 const attenuation=boundaryGrid(position,seamPaths);
 const fraction=clamp(Number(topFraction)||.23,.08,.45),threshold=1-fraction;
 const power=clamp(Number(strength)||0,0,4),tileW=Math.max(2,Number(bodyTileWidth)||20),
  tileH=Math.max(2,Number(bodyTileHeight)||16);
 const results={top:{positions:[],uvs:[],normals:[]},body:{positions:[],uvs:[],normals:[]}};
 let moved=0,maxOffset=0;
 function annotate(p,n){
  const [lowerRaw,upperRaw]=bounds.pair(p),guides=seamBounds(p);
  let lower=lowerRaw,upper=upperRaw;
  if(guides[0]!=null)upper=guides[0];
  if(guides[1]!=null)lower=guides[1];
  if(upper-lower<1.5){lower=lowerRaw;upper=Math.max(lower+1.5,upperRaw)}
  return {p,n,level:clamp((p[1]-lower)/(upper-lower),0,1)};
 }
 function write(part,v){
  const target=results[part],p=v.p,n=v.n;
  const nlen=Math.hypot(...n)||1,nn=n.map(x=>x/nlen);
  const u=(p[axis]-bounds.umin)/bounds.span;
  const [rawBottom,rawTop]=bounds.pair(p);
  const divider=rawBottom+(rawTop-rawBottom)*threshold;
  const tex=part==='top'?
   [clamp(u,0,1),clamp((v.level-threshold)/fraction,0,1)]:
   [(p[axis]-bounds.umin)/tileW,(divider-p[1])/tileH];
  const height=sampleCliffHeight(part==='top'?topHeight:bodyHeight,tex[0],tex[1],{repeat:part==='body'});
  // Lower grayscale values sit close to the original collision surface;
  // peaks protrude outward. Never push inward through the original collider.
  const splitFade=smooth(Math.abs(v.level-threshold)/.065);
  const ends=smooth(v.level/.06)*smooth((1-v.level)/.045);
  const borderFade=attenuation(p);
  const shift=height*power*splitFade*ends*borderFade;
  const displaced=p.map((x,i)=>x+nn[i]*shift);
  target.positions.push(...displaced);
  target.normals.push(...nn);
  target.uvs.push(...tex);
  if(shift>1e-4)moved++;
  maxOffset=Math.max(maxOffset,shift);
 }
 for(let i=0;i+8<position.length;i+=9){
  const tri=[];
  for(let j=0;j<3;j++){
   const k=i+j*3;
   tri.push(annotate([position[k],position[k+1],position[k+2]],normals(normal,k)));
  }
  for(const part of ['top','body']){
   const clipped=clip(tri,threshold,part==='top');
   for(let j=1;j<clipped.length-1;j++){
    for(const v of [clipped[0],clipped[j],clipped[j+1]])write(part,v);
   }
  }
 }
 const make=r=>r.positions.length?{
  positions:new Float32Array(r.positions),
  normals:new Float32Array(r.normals),uvs:new Float32Array(r.uvs),
  triangles:r.positions.length/9
 }:null;
 return {top:make(results.top),body:make(results.body),
  stats:{axis:axis===0?'x':'z',moved,maxOffset,topTriangles:results.top.positions.length/9,
   bodyTriangles:results.body.positions.length/9}};
}
