// Physical cliff displacement. Works on the indexed terrain mesh itself, never an overlay.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
function normal(a,b,c){
 const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
 const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
 const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,l=Math.hypot(x,y,z)||1;
 return [x/l,y/l,z/l];
}
function insideCliffPolygon(x,z,points){
 if(!Array.isArray(points)||points.length<3)return false;
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if(!Number.isFinite(a.x)||!Number.isFinite(a.z)||!Number.isFinite(b.x)||!Number.isFinite(b.z))return false;
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
export function buildCliffHeightmapGeometry(source,{point,normalXZ,zonePoints=null,radius=32,strength=2.5,period=24,steps=2,sample,maxTriangles=150000}={}){
 if(!source||!point||typeof sample!=='function')return null;
 const [nx,nz]=normalXZ||[0,1],nl=Math.hypot(nx,nz)||1,axis=[nx/nl,nz/nl];
 const originalCount=source.positions.length/3;
 const vertices=Array.from({length:originalCount},(_,i)=>Array.from(source.positions.slice(i*3,i*3+3)));
 const uv=source.uvs?Array.from({length:originalCount},(_,i)=>Array.from(source.uvs.slice(i*2,i*2+2))):null;
 const colors=source.colors?Array.from({length:originalCount},(_,i)=>Array.from(source.colors.slice(i*3,i*3+3))):null;
 let triangles=[];const raw=source.indices||Array.from({length:originalCount},(_,i)=>i);
 for(let i=0;i+2<raw.length;i+=3)triangles.push([raw[i],raw[i+1],raw[i+2]]);
 const maxR=Math.max(2,Number(radius)||32),worldPeriod=Math.max(2,Number(period)||24);
 const coord=p=>[(-axis[1]*p[0]+axis[0]*p[2])/worldPeriod,p[1]/worldPeriod];
 const sampleAt=p=>{const [u,v]=coord(p);return clamp(Number(sample(u,v))||0,0,1)};
 const qualifies=tri=>{
  const a=vertices[tri[0]],b=vertices[tri[1]],c=vertices[tri[2]];
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;
  if(zonePoints){if(!insideCliffPolygon(x,z,zonePoints))return false}
  else if(Math.hypot(x-point.x,z-point.z)>maxR)return false;
  const n=normal(a,b,c);
  return Math.abs(n[1])<.72&&(zonePoints||Math.abs(n[0]*axis[0]+n[2]*axis[1])>.48);
 };
 let subdivided=0;
 const rounds=clamp(Math.floor(Number(steps)||2),1,3);
 for(let pass=0;pass<rounds;pass++){
  if(triangles.length>=maxTriangles)break;
  const marked=new Set();
  const active=triangles.map(t=>{
   if(!qualifies(t))return false;
   const a=vertices[t[0]],b=vertices[t[1]],c=vertices[t[2]];
   const mean=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
   const variation=Math.max(sampleAt(a),sampleAt(b),sampleAt(c),sampleAt(mean))-
    Math.min(sampleAt(a),sampleAt(b),sampleAt(c),sampleAt(mean));
   return variation>.025;
  });
  for(let i=0;i<triangles.length;i++)if(active[i]){
   const [a,b,c]=triangles[i];
   marked.add(edgeKey(a,b));marked.add(edgeKey(b,c));marked.add(edgeKey(c,a));
  }
  if(!marked.size)break;
  const mids=new Map();
  function mid(a,b){
   const key=edgeKey(a,b);if(!marked.has(key))return null;
   if(mids.has(key))return mids.get(key);
   const p=vertices[a],q=vertices[b],id=vertices.length;
   vertices.push(p.map((v,i)=>(v+q[i])*.5));
   if(uv)uv.push(uv[a].map((v,i)=>(v+uv[b][i])*.5));
   if(colors)colors.push(colors[a].map((v,i)=>(v+colors[b][i])*.5));
   mids.set(key,id);return id;
  }
  const next=[];
  for(const t of triangles){
   const [a,b,c]=t,m0=mid(a,b),m1=mid(b,c),m2=mid(c,a);
   if(m0===null&&m1===null&&m2===null){next.push(t);continue}
   const ring=[a,...(m0===null?[]:[m0]),b,...(m1===null?[]:[m1]),c,...(m2===null?[]:[m2])];
   // Triangle fan around a new interior vertex. All edge midpoints are globally shared.
   const id=vertices.length;
   vertices.push(t.map(k=>vertices[k]).reduce((p,q)=>p.map((v,i)=>v+q[i]/3),[0,0,0]));
   if(uv)uv.push(t.map(k=>uv[k]).reduce((p,q)=>p.map((v,i)=>v+q[i]/3),[0,0]));
   if(colors)colors.push(t.map(k=>colors[k]).reduce((p,q)=>p.map((v,i)=>v+q[i]/3),[0,0,0]));
   for(let k=0;k<ring.length;k++)next.push([ring[k],ring[(k+1)%ring.length],id]);
   subdivided++;
  }
  triangles=next;
 }
 if(!subdivided)return null;
 // Boundary vertices and every original vertex remain fixed: preserve the original terrain,
 // the seam constraints and continuity with neighboring non-cliff faces.
 const total=vertices.length;
 const wallVotes=new Uint16Array(total),allVotes=new Uint16Array(total);
 const horizontal=new Array(total).fill(null).map(()=>[0,0]);
 for(const tri of triangles){
  const qualifiesWall=qualifies(tri);
  const a=vertices[tri[0]],b=vertices[tri[1]],c=vertices[tri[2]],n=normal(a,b,c);
  for(const id of tri){allVotes[id]++;if(qualifiesWall){wallVotes[id]++;horizontal[id][0]+=n[0];horizontal[id][1]+=n[2]}}
 }
 let moved=0;
 for(let i=originalCount;i<total;i++){
  if(!wallVotes[i]||wallVotes[i]!==allVotes[i])continue;
  const p=vertices[i],v=sampleAt(p),delta=(v-.5)*2*strength;
  if(Math.abs(delta)<.001)continue;
  const fade=zonePoints?1:clamp((maxR-Math.hypot(p[0]-point.x,p[2]-point.z))/3,0,1);
  const n=horizontal[i],length=Math.hypot(n[0],n[1])||1;
  p[0]+=n[0]/length*delta*fade;
  p[2]+=n[1]/length*delta*fade;
  if(fade>0)moved++;
 }
 return {positions:Float32Array.from(vertices.flat()),indices:Uint32Array.from(triangles.flat()),
  colors:colors?Float32Array.from(colors.flat()):null,uvs:uv?Float32Array.from(uv.flat()):null,
  stats:{originalVertices:originalCount,vertices:vertices.length,triangles:triangles.length,subdivided,moved}};
}

