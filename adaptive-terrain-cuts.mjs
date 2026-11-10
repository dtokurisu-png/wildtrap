// WILDTRAP · Cortes locales 3D sobre la malla del terreno.
// Geometría pura: no depende de Three.js ni aumenta la cuadrícula global.
// Un corte es un prisma convexo orientado según la cara tocada.
const EPS=1e-7;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);
const norm=a=>{const l=len(a)||1;return a.map(v=>v/l)};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,k)=>a.map(v=>v*k);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function unitBasis(normal){
 const n=norm(normal),up=[0,1,0];
 const u=norm(Math.abs(n[1])>.95?[1,0,0]:cross(up,n));
 const v=norm(cross(n,u));
 return {n,u,v};
}
function footprint(radius,shape,dir){
 const r=radius;
 if(shape==='rectangle')return [[-r,-r],[r,-r],[r,r],[-r,r]];
 const count=shape==='semicircle'?13:24;
 const ang={east:-Math.PI/2,north:0,west:Math.PI/2,south:Math.PI}[dir]??0;
 if(shape==='semicircle'){
  const pts=[[0,0]];
  for(let i=0;i<=count;i++){
   const a=ang+i*Math.PI/count;
   pts.push([r*Math.cos(a),r*Math.sin(a)]);
  }
  return pts;
 }
 return Array.from({length:count},(_,i)=>{const a=i*2*Math.PI/count;return [r*Math.cos(a),r*Math.sin(a)]});
}
export function prepareCutStamp(raw){
 if(!raw||!Array.isArray(raw.center)||raw.center.length!==3||!raw.center.every(Number.isFinite))return null;
 if(!Array.isArray(raw.normal)||raw.normal.length!==3||!raw.normal.every(Number.isFinite)||len(raw.normal)<.01)return null;
 const center=raw.center.slice(),basis=unitBasis(raw.normal);
 const radius=clamp(Number(raw.radius)||4,.4,65);
 const depth=clamp(Number(raw.depth)||2,.25,20);
 const shape=['circle','semicircle','rectangle','free'].includes(raw.shape)?raw.shape:'circle';
 const dir=raw.dir||'north';
 const polygon=footprint(radius,shape,dir);
 const planes=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length];
  const dx=b[0]-a[0],dy=b[1]-a[1],dist=Math.hypot(dx,dy);
  if(dist<EPS)continue;
  const n=add(scale(basis.u,dy/dist),scale(basis.v,-dx/dist));
  const boundary=add(center,add(scale(basis.u,a[0]),scale(basis.v,a[1])));
  planes.push({n,limit:dot(n,boundary)});
 }
 const d=dot(basis.n,center);
 planes.push({n:basis.n,limit:d+depth},{n:scale(basis.n,-1),limit:-d+depth});
 const bounds=[0,1,2].map(i=>radius*(Math.abs(basis.u[i])+Math.abs(basis.v[i]))+depth*Math.abs(basis.n[i])+.02);
 return {op:raw.op==='restore'?'restore':'cut',center,normal:basis.n,radius,depth,shape,dir,polygon,
  u:basis.u,v:basis.v,planes,bounds:{min:center.map((c,i)=>c-bounds[i]),max:center.map((c,i)=>c+bounds[i])}};
}
export function pointInStamp(point,stamp){
 return stamp.planes.every(p=>dot(p.n,point)<=p.limit+1e-5);
}
export function isTerrainCutAt(x,y,z,legacyHoles,stamps,size,resolution){
 const side=resolution-1,step=size/side,origin=-size*.5;
 const i=Math.floor((x-origin)/step),j=Math.floor((z-origin)/step);
 let removed=i>=0&&j>=0&&i<side&&j<side&&legacyHoles.has(j*side+i);
 const p=[x,y,z];
 for(const s of stamps)if(pointInStamp(p,s))removed=s.op==='cut';
 return removed;
}
function interpolate(a,b,t){
 return {p:lerp(a.p,b.p,t),uv:lerp(a.uv,b.uv,t),color:lerp(a.color,b.color,t),
  normal:norm(lerp(a.normal,b.normal,t)),id:t<EPS?a.id:t>1-EPS?b.id:null};
}
function clean(poly){
 const result=[];
 for(const v of poly){
  const prior=result[result.length-1];
  if(!prior||Math.hypot(...v.p.map((a,i)=>a-prior.p[i]))>1e-6)result.push(v);
 }
 if(result.length>1&&len(result[0].p.map((a,i)=>a-result[result.length-1].p[i]))<1e-6)result.pop();
 return result.length>=3?result:[];
}
// Split convex polygon by a plane, preserving original triangle winding.
function bisect(poly,plane){
 const inside=[],outside=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const da=dot(plane.n,a.p)-plane.limit,db=dot(plane.n,b.p)-plane.limit;
  const ai=da<=EPS,bi=db<=EPS;
  if(ai)inside.push(a);else outside.push(a);
  if(ai!==bi){
   const t=clamp(da/(da-db),0,1),v=interpolate(a,b,t);
   inside.push(v);outside.push(v);
  }
 }
 return [clean(inside),clean(outside)];
}
function area(poly){
 if(poly.length<3)return 0;
 const p=poly[0].p;let a=0;
 for(let i=1;i<poly.length-1;i++){
  const x=poly[i].p.map((v,k)=>v-p[k]),y=poly[i+1].p.map((v,k)=>v-p[k]);
  a+=len(cross(x,y))*.5;
 }
 return a;
}
function subtractPrism(poly,stamp){
 // A minus convex B = disjoint outside slices plus intersection (inside).
 let inside=poly;
 const outside=[];
 for(const plane of stamp.planes){
  if(!inside.length)break;
  const [next,out]=bisect(inside,plane);
  if(out.length&&area(out)>1e-7)outside.push(out);
  inside=next;
 }
 return {outside,inside:inside.length&&area(inside)>1e-7?inside:[]};
}
function overlapsTriangle(stamp,a,b,c){
 const min=[Math.min(a[0],b[0],c[0]),Math.min(a[1],b[1],c[1]),Math.min(a[2],b[2],c[2])];
 const max=[Math.max(a[0],b[0],c[0]),Math.max(a[1],b[1],c[1]),Math.max(a[2],b[2],c[2])];
 for(let i=0;i<3;i++)if(max[i]<stamp.bounds.min[i]||min[i]>stamp.bounds.max[i])return false;
 return true;
}
function spatialStamps(stamps,size,resolution){
 const side=resolution-1,step=size/side,origin=-size/2,map=new Map();
 for(const s of stamps){
  const minX=clamp(Math.floor((s.bounds.min[0]-origin)/step),0,side-1);
  const maxX=clamp(Math.floor((s.bounds.max[0]-origin)/step),0,side-1);
  const minZ=clamp(Math.floor((s.bounds.min[2]-origin)/step),0,side-1);
  const maxZ=clamp(Math.floor((s.bounds.max[2]-origin)/step),0,side-1);
  for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++){
   const id=j*side+i;
   if(!map.has(id))map.set(id,[]);
   map.get(id).push(s);
  }
 }
 return map;
}
// Base attributes are Float32Array/typed arrays and indices from PlaneGeometry.
// Out is indexed: unchanged tiles share their ORIGINAL vertices and normals.
export function buildAdaptiveTerrain(base,legacyList=[],rawStamps=[],size=630,resolution=129){
 const legacy=new Set(legacyList.filter(i=>Number.isInteger(i)&&i>=0&&i<(resolution-1)**2));
 const stamps=rawStamps.map(prepareCutStamp).filter(Boolean);
 if(!stamps.length&&!legacy.size)return null;
 const perCell=spatialStamps(stamps,size,resolution),side=resolution-1;
 const positions=Array.from(base.positions),colors=Array.from(base.colors),uvs=Array.from(base.uvs);
 const normals=Array.from(base.normals),indices=[],original=base.indices;
 const extra=new Map(),vertexCount=base.positions.length/3;
 let clippedTriangles=0,addedFaces=0;
 function vertex(i){return {p:Array.from(base.positions.slice(i*3,i*3+3)),
  uv:Array.from(base.uvs.slice(i*2,i*2+2)),
  color:Array.from(base.colors.slice(i*3,i*3+3)),
  normal:Array.from(base.normals.slice(i*3,i*3+3)),id:i};}
 function pushVertex(v){
  if(v.id!==null&&v.id!==undefined)return v.id;
  const key=v.p.map(x=>Math.round(x*1e5)).join(':');
  const cached=extra.get(key);
  if(cached!==undefined)return cached;
  const id=positions.length/3;
  positions.push(...v.p);uvs.push(...v.uv);colors.push(...v.color);normals.push(...v.normal);
  extra.set(key,id);return id;
 }
 function emit(poly){
  if(!poly.length||area(poly)<1e-7)return;
  for(let i=1;i<poly.length-1;i++){
   const a=pushVertex(poly[0]),b=pushVertex(poly[i]),c=pushVertex(poly[i+1]);
   if(a===b||b===c||c===a)continue;
   indices.push(a,b,c);addedFaces++;
  }
 }
 for(let cell=0;cell<side*side;cell++){
  const cuts=perCell.get(cell)||[],removed=legacy.has(cell);
  const start=cell*6;
  if(!removed&&!cuts.length){
   for(let i=0;i<6;i++)indices.push(original[start+i]);
   continue;
  }
  for(let tri=0;tri<2;tri++){
   const a=vertex(original[start+tri*3]),b=vertex(original[start+tri*3+1]),c=vertex(original[start+tri*3+2]);
   let fragments=[{poly:[a,b,c],removed}];
   let touched=false;
   for(const s of cuts){
    if(!overlapsTriangle(s,a.p,b.p,c.p))continue;
    touched=true;
    const next=[];
    for(const fragment of fragments){
     const result=subtractPrism(fragment.poly,s);
     for(const polygon of result.outside)next.push({poly:polygon,removed:fragment.removed});
     if(result.inside.length)next.push({poly:result.inside,removed:s.op==='cut'});
    }
    fragments=next;
   }
   if(!touched&&!removed){indices.push(a.id,b.id,c.id);continue}
   clippedTriangles++;
   for(const fragment of fragments)if(!fragment.removed)emit(fragment.poly);
  }
 }
 return {positions,colors,uvs,normals,indices,stats:{originalTriangles:original.length/3,
  finalTriangles:indices.length/3,newVertices:positions.length/3-vertexCount,clippedTriangles,addedFaces}};
}
