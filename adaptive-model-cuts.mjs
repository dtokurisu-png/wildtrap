// WILDTRAP · Recorte local y reversible de mallas GLB ya colocadas.
// Operación pura sin Three.js: trabaja sobre triángulos indexados o no indexados,
// conserva grupos de materiales y atributos interpolables (UV/normales/colores).
import {prepareCutStamp,overlapsTriangle} from './adaptive-terrain-cuts.mjs';

const EPS=1e-7;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vecDist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};
function interpolate(a,b,t,names){
 const values={};
 for(const k of names){
  const val=lerp(a.values[k],b.values[k],t);
  values[k]=k==='normal'?norm(val):val;
 }
 return {p:lerp(a.p,b.p,t),values,id:t<EPS?a.id:t>1-EPS?b.id:null};
}
function clean(poly){
 const out=[];
 for(const v of poly){
  if(!out.length||vecDist(out[out.length-1].p,v.p)>1e-6)out.push(v);
 }
 if(out.length>1&&vecDist(out[0].p,out[out.length-1].p)<1e-6)out.pop();
 return out.length>=3?out:[];
}
function bisect(poly,plane,names){
 const inside=[],outside=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=dot(plane.n,a.p)-plane.limit,db=dot(plane.n,b.p)-plane.limit;
  const ai=da<=EPS,bi=db<=EPS;
  if(ai)inside.push(a);else outside.push(a);
  if(ai!==bi){
   const v=interpolate(a,b,clamp(da/(da-db),0,1),names);
   inside.push(v);outside.push(v);
  }
 }
 return [clean(inside),clean(outside)];
}
function area(polygon){
 if(polygon.length<3)return 0;
 const p=polygon[0].p;let area=0;
 for(let i=1;i<polygon.length-1;i++){
  const a=polygon[i].p.map((x,k)=>x-p[k]);
  const b=polygon[i+1].p.map((x,k)=>x-p[k]);
  const c=cross(a,b);area+=.5*Math.hypot(...c);
 }
 return area;
}
function subtract(poly,stamp,names){
 let inside=poly;const outside=[];
 for(const plane of stamp.planes){
  if(!inside.length)break;
  const [next,out]=bisect(inside,plane,names);
  if(out.length&&area(out)>1e-8)outside.push(out);
  inside=next;
 }
 return {outside,inside:inside.length&&area(inside)>1e-8?inside:[]};
}
function intersectBounds(stamp,min,max){
 return [0,1,2].every(i=>max[i]>=stamp.bounds.min[i]&&min[i]<=stamp.bounds.max[i]);
}
const identity=point=>point;
// base: {attributes:{position:{array,itemSize},normal:{...},uv:{...}},indices,groups}.
// transformPoint converts a local mesh vertex into the GLB instance's ROOT space,
// so cuts remain attached when the instance is translated, rotated or scaled.
export function buildAdaptiveModel(base,rawStamps=[],transformPoint=identity){
 if(!Array.isArray(rawStamps)||!rawStamps.length)return null;
 const attrs=base?.attributes||{};
 if(!attrs.position?.array||attrs.position.itemSize!==3)return null;
 const names=Object.keys(attrs).filter(k=>attrs[k].array&&attrs[k].itemSize>=1&&attrs[k].itemSize<=4);
 const vertexCount=attrs.position.array.length/3;
 const getAttr=(name,id)=>{
  const attr=attrs[name],start=id*attr.itemSize;
  return Array.from(attr.array.slice(start,start+attr.itemSize));
 };
 const stamps=rawStamps.map(prepareCutStamp).filter(Boolean);
 if(!stamps.length)return null;
 const p=attrs.position.array;
 // Cheap whole-mesh culling before touching its individual triangles.
 const meshMin=[Infinity,Infinity,Infinity],meshMax=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<vertexCount;i++){
  const v=transformPoint([p[i*3],p[i*3+1],p[i*3+2]]);
  for(let k=0;k<3;k++){meshMin[k]=Math.min(meshMin[k],v[k]);meshMax[k]=Math.max(meshMax[k],v[k]);}
 }
 const affecting=stamps.filter(s=>intersectBounds(s,meshMin,meshMax));
 if(!affecting.length)return null;
 const output=Object.fromEntries(names.map(k=>[k,Array.from(attrs[k].array)]));
 const indices=base.indices||Array.from({length:vertexCount},(_,i)=>i);
 const groups=base.groups?.length?base.groups:[{start:0,count:indices.length,materialIndex:0}];
 const outputIndices=[],outputGroups=[];
 let touched=0,newTriangles=0;
 function makeVertex(id,worldPoint){
  const values=Object.fromEntries(names.map(k=>[k,getAttr(k,id)]));
  return {p:worldPoint,values,id};
 }
 function worldVertex(id){
  const i=id*3;
  return transformPoint([p[i],p[i+1],p[i+2]]);
 }
 function addVertex(v){
  if(v.id!==null)return v.id;
  const id=output.position.length/3;
  for(const k of names)output[k].push(...v.values[k]);
  return id;
 }
 function emit(poly){
  if(!poly.length||area(poly)<1e-8)return;
  for(let i=1;i<poly.length-1;i++){
   const a=addVertex(poly[0]),b=addVertex(poly[i]),c=addVertex(poly[i+1]);
   if(a!==b&&b!==c&&c!==a){outputIndices.push(a,b,c);newTriangles++;}
  }
 }
 for(const group of groups){
  const groupStart=outputIndices.length;
  const end=Math.min(indices.length,group.start+group.count);
  for(let offset=group.start;offset+2<end;offset+=3){
   const a=indices[offset],b=indices[offset+1],c=indices[offset+2];
   // Most triangles are untouched: do not allocate per-vertex attributes for
   // them, particularly important for Tripo GLBs with tens of thousands of faces.
   const pa=worldVertex(a),pb=worldVertex(b),pc=worldVertex(c);
   const relevant=affecting.filter(s=>overlapsTriangle(s,pa,pb,pc));
   if(!relevant.length){outputIndices.push(a,b,c);continue;}
   const va=makeVertex(a,pa),vb=makeVertex(b,pb),vc=makeVertex(c,pc);
   touched++;
   let fragments=[{poly:[va,vb,vc],removed:false}];
   for(const stamp of relevant){
    const next=[];
    for(const frag of fragments){
     const pieces=subtract(frag.poly,stamp,names);
     for(const poly of pieces.outside)next.push({poly,removed:frag.removed});
     if(pieces.inside.length)next.push({poly:pieces.inside,removed:stamp.op==='cut'});
    }
    fragments=next;
   }
   for(const frag of fragments)if(!frag.removed)emit(frag.poly);
  }
  const count=outputIndices.length-groupStart;
  if(count)outputGroups.push({start:groupStart,count,materialIndex:group.materialIndex||0});
 }
 if(!touched)return null;
 return {attributes:Object.fromEntries(names.map(k=>[k,{array:output[k],itemSize:attrs[k].itemSize,normalized:!!attrs[k].normalized}])),
  indices:outputIndices,groups:outputGroups,
  stats:{originalTriangles:Math.floor(indices.length/3),finalTriangles:outputIndices.length/3,
   generatedVertices:output.position.length/3-vertexCount,touchedTriangles:touched,generatedTriangles:newTriangles}};
}
