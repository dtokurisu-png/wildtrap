// WILDTRAP · Cortes locales 3D sobre la malla del terreno.
// Geometría pura: no depende de Three.js ni aumenta la cuadrícula global.
// Un corte poligonal almacena sus esquinas; solo polígonos cóncavos se triangulan internamente.
const EPS=1e-7;
// Hard limits keep malformed or densely overlapping cuts from freezing the UI.
// A heightfield has at most (resolution - 1)^2 * 2 triangles.
// Never silently discard old cuts or put uncut source triangles back.
// Complicated cut/restore cycles still have a per-triangle complexity guard,
// reported to the caller so an incomplete cut cannot be saved as successful.
const MAX_FRAGMENTS_PER_TRIANGLE=2048;
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

const orient2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function signedArea2(points){
 let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a[0]*b[1]-b[0]*a[1];}
 return sum;
}
function onSegment(a,b,p){return Math.abs(orient2(a,b,p))<1e-8&&
 p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&
 p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8;}
function segmentsCross(a,b,c,d){
 const x=orient2(a,b,c),y=orient2(a,b,d),z=orient2(c,d,a),w=orient2(c,d,b);
 return (x*y<0&&z*w<0)||
  (Math.abs(x)<1e-8&&onSegment(a,b,c))||
  (Math.abs(y)<1e-8&&onSegment(a,b,d))||
  (Math.abs(z)<1e-8&&onSegment(c,d,a))||
  (Math.abs(w)<1e-8&&onSegment(c,d,b));
}
function polygonIsSimple(p){
 const n=p.length;
 for(let i=0;i<n;i++){
  if(Math.hypot(p[i][0]-p[(i+1)%n][0],p[i][1]-p[(i+1)%n][1])<.001)return false;
  for(let j=i+1;j<n;j++){
   if(j===i+1||(i===0&&j===n-1))continue;
   if(segmentsCross(p[i],p[(i+1)%n],p[j],p[(j+1)%n]))return false;
  }
 }
 return true;
}
function convexPolygon(p){
 for(let i=0;i<p.length;i++)if(orient2(p[i],p[(i+1)%p.length],p[(i+2)%p.length]) < -1e-7)return false;
 return true;
}
function insideTriangle(p,a,b,c){
 return orient2(a,b,p)>=-1e-8&&orient2(b,c,p)>=-1e-8&&orient2(c,a,p)>=-1e-8;
}
// Ear clipping only for concave contours; a rectangle is one convex clipping volume.
function triangulatePolygon(p){
 const ids=p.map((_,i)=>i),result=[];
 let attempts=0;
 while(ids.length>3&&attempts++<p.length*p.length){
  let clipped=false;
  for(let i=0;i<ids.length;i++){
   const a=ids[(i-1+ids.length)%ids.length],b=ids[i],c=ids[(i+1)%ids.length];
   if(orient2(p[a],p[b],p[c])<=1e-7)continue;
   if(ids.some(k=>k!==a&&k!==b&&k!==c&&insideTriangle(p[k],p[a],p[b],p[c])))continue;
   result.push([p[a],p[b],p[c]]);
   ids.splice(i,1);clipped=true;break;
  }
  if(!clipped)return null;
 }
 if(ids.length!==3||orient2(p[ids[0]],p[ids[1]],p[ids[2]])<=1e-7)return null;
 result.push(ids.map(i=>p[i]));
 return result;
}

export function prepareCutStamp(raw){
 if(!raw||!Array.isArray(raw.center)||raw.center.length!==3||!raw.center.every(Number.isFinite))return null;
 if(!Array.isArray(raw.normal)||raw.normal.length!==3||!raw.normal.every(Number.isFinite)||len(raw.normal)<.01)return null;
 const center=raw.center.slice(),basis=unitBasis(raw.normal);
 const depth=clamp(Number(raw.depth)||2,.25,20);
 const shape=raw.shape==='polygon'?'polygon':
  ['circle','semicircle','rectangle','free'].includes(raw.shape)?raw.shape:'circle';
 const dir=raw.dir||'north';
 let polygon,radius;
 if(shape==='polygon'){
  if(!Array.isArray(raw.polygon)||raw.polygon.length<3||raw.polygon.length>48)return null;
  polygon=raw.polygon.map(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)?p.slice():null);
  if(polygon.some(p=>!p))return null;
  if(polygon.some(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))>315))return null;
  if(Math.abs(signedArea2(polygon))<.001||!polygonIsSimple(polygon))return null;
  if(signedArea2(polygon)<0)polygon.reverse();
  radius=Math.max(...polygon.map(p=>Math.hypot(...p)));
 }else{
  radius=clamp(Number(raw.radius)||4,.4,65);
  polygon=footprint(radius,shape,dir);
 }
 const d=dot(basis.n,center);
 function planesFor(poly){
  const planes=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length];
   const dx=b[0]-a[0],dy=b[1]-a[1],dist=Math.hypot(dx,dy);
   if(dist<EPS)continue;
   const n=add(scale(basis.u,dy/dist),scale(basis.v,-dx/dist));
   const boundary=add(center,add(scale(basis.u,a[0]),scale(basis.v,a[1])));
   planes.push({n,limit:dot(n,boundary)});
  }
  planes.push({n:basis.n,limit:d+depth},{n:scale(basis.n,-1),limit:-d+depth});
  return planes;
 }
 let parts=null;
 if(shape==='polygon'&&!convexPolygon(polygon)){
  const triangles=triangulatePolygon(polygon);
  if(!triangles)return null;
  parts=triangles.map(poly=>({planes:planesFor(poly)}));
 }
 const planes=parts?[]:planesFor(polygon);
 const corners=polygon.map(p=>add(center,add(scale(basis.u,p[0]),scale(basis.v,p[1]))));
 const bounds={
  min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))-depth*Math.abs(basis.n[i])-.02),
  max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i]))+depth*Math.abs(basis.n[i])+.02)
 };
 return {op:raw.op==='restore'?'restore':'cut',center,normal:basis.n,radius,depth,shape,dir,polygon,
  u:basis.u,v:basis.v,planes,parts,bounds};
}
export function pointInStamp(point,stamp){
 return (stamp.parts||[stamp]).some(part=>part.planes.every(p=>dot(p.n,point)<=p.limit+1e-5));
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
export function subtractPrism(poly,stamp){
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
export function overlapsTriangle(stamp,a,b,c){
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
   const cellStamps=map.get(id);
   cellStamps.push(s);
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
 let clippedTriangles=0,addedFaces=0,limitedTriangles=0,limitedFragments=0;
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
   for(let stampIndex=0;stampIndex<cuts.length;stampIndex++){
    const s=cuts[stampIndex];
    if(!overlapsTriangle(s,a.p,b.p,c.p))continue;
    touched=true;
    // Concave polygons are the union of nonoverlapping triangular prisms.
    for(const part of (s.parts||[s])){
     if(fragments.length>MAX_FRAGMENTS_PER_TRIANGLE){limitedFragments++;break;}
     const next=[];
     const targetRemoved=s.op==='cut';
     for(const fragment of fragments){
      // Once a region is already cut, an overlapping cut cannot fragment
      // it again. Likewise restoring a visible region is a no-op.
      if(fragment.removed===targetRemoved){next.push(fragment);continue}
      const result=subtractPrism(fragment.poly,part);
      for(const polygon of result.outside)next.push({poly:polygon,removed:fragment.removed});
      if(result.inside.length)next.push({poly:result.inside,removed:targetRemoved});
     }
     fragments=next;
    }
    // Once no future restoration exists, removed regions are permanently
    // absent. Keeping them causes quadratic fragmentation when users cut the
    // same spot 10+ times; discard them instead of clipping dead triangles.
    if(!cuts.slice(stampIndex+1).some(next=>next.op==='restore'))
     fragments=fragments.filter(fragment=>!fragment.removed);
   }
   if(!touched&&!removed){indices.push(a.id,b.id,c.id);continue}
   clippedTriangles++;
   for(const fragment of fragments)if(!fragment.removed)emit(fragment.poly);
  }
 }
 return {positions,colors,uvs,normals,indices,stats:{originalTriangles:original.length/3,
  finalTriangles:indices.length/3,newVertices:positions.length/3-vertexCount,clippedTriangles,addedFaces,
  limitedTriangles,limitedFragments,incomplete:limitedTriangles>0||limitedFragments>0}};
}
