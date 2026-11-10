// WILDTRAP Cave Library / Phase 1.
// Pure, deterministic BufferGeometry data; no Three.js dependency.
// Coordinates: X across, Y up, Z depth. Entries open toward -Z.
export const CAVE_PIECE_TYPES=Object.freeze([
 {id:'floor',name:'Suelo deformable',defaultSize:[18,1,18]},
 {id:'wall',name:'Pared rocosa',defaultSize:[16,9,2]},
 {id:'vault',name:'Techo arqueado',defaultSize:[16,7,18]},
 {id:'tunnel',name:'Túnel abierto',defaultSize:[12,8,20]},
 {id:'ramp',name:'Rampa',defaultSize:[12,6,18]},
 {id:'chamber',name:'Cámara de jefe',defaultSize:[32,12,28]}
]);
export const PIECE_IDS=CAVE_PIECE_TYPES.map(p=>p.id);
const PI=Math.PI, TAU=2*PI;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const finite=(x,f)=>Number.isFinite(Number(x))?Number(x):f;
export function pieceOptions(id,params={}){
 const def=CAVE_PIECE_TYPES.find(x=>x.id===id);
 if(!def)throw Error('Pieza de cueva desconocida: '+id);
 const [w,h,l]=def.defaultSize;
 return {
  width:clamp(finite(params.width,w),4,90),
  height:clamp(finite(params.height,h),.3,50),
  length:clamp(finite(params.length,l),4,90),
  thickness:clamp(finite(params.thickness,1.25),.25,5),
  segmentsX:clamp(Math.round(finite(params.segmentsX,12)),4,32),
  segmentsZ:clamp(Math.round(finite(params.segmentsZ,12)),4,32),
  segmentsArch:clamp(Math.round(finite(params.segmentsArch,16)),8,40)
 };
}
class Builder{
 constructor(){this.positions=[];this.uvs=[];this.indices=[];this.groups=[];}
 vertex(x,y,z,u,v){const id=this.positions.length/3;this.positions.push(x,y,z);this.uvs.push(u,v);return id;}
 triangle(a,b,c,materialIndex){
  const start=this.indices.length;this.indices.push(a,b,c);
  const last=this.groups[this.groups.length-1];
  if(last&&last.materialIndex===materialIndex&&last.start+last.count===start)last.count+=3;
  else this.groups.push({start,count:3,materialIndex});
 }
 quad(a,b,c,d,flip,materialIndex){
  if(flip){this.triangle(a,c,b,materialIndex);this.triangle(b,c,d,materialIndex);}
  else {this.triangle(a,b,c,materialIndex);this.triangle(b,d,c,materialIndex);}
 }
 grid(uSeg,vSeg,point,flip=false,materialIndex=0){
  const rows=[];
  for(let j=0;j<=vSeg;j++){
   const row=[],v=j/vSeg;
   for(let i=0;i<=uSeg;i++){
    const u=i/uSeg,p=point(u,v);
    row.push(this.vertex(p[0],p[1],p[2],u,v));
   }
   rows.push(row);
  }
  for(let j=0;j<vSeg;j++)for(let i=0;i<uSeg;i++)
   this.quad(rows[j][i],rows[j][i+1],rows[j+1][i],rows[j+1][i+1],flip,materialIndex);
 }
 build(id,options){
  const data={kind:id,options,positions:this.positions,uvs:this.uvs,
    indices:this.indices,groups:this.groups,vertexEdits:{}};
  recomputeNormals(data);return data;
 }
}
export function recomputeNormals(data){
 const p=data.positions,idx=data.indices,n=Array(p.length).fill(0);
 for(let k=0;k<idx.length;k+=3){
  const a=idx[k]*3,b=idx[k+1]*3,c=idx[k+2]*3;
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2];
  const vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
  for(const q of [a,b,c]){n[q]+=x;n[q+1]+=y;n[q+2]+=z;}
 }
 for(let i=0;i<n.length;i+=3){
  const d=Math.hypot(n[i],n[i+1],n[i+2])||1;
  n[i]/=d;n[i+1]/=d;n[i+2]/=d;
 }
 data.normals=n;return data;
}
function widthX(u,w){return w*(u-.5)}
function depthZ(v,l){return l*(v-.5)}
function roofPoint(o,u,v,outer=false){
 const x=widthX(u,o.width),z=depthZ(v,o.length);
 const y=o.height*Math.sin(PI*u)+(outer?o.thickness:0);
 return [x,y,z];
}
function makeFloor(b,o){
 const y=0;
 b.grid(o.segmentsX,o.segmentsZ,(u,v)=>[widthX(u,o.width),y,depthZ(v,o.length)],true,0);
}
function makeWall(b,o){
 const {width:w,height:h,length:l,thickness:t,segmentsX:sx,segmentsZ:sz}=o;
 const front=t/2,back=-t/2;
 b.grid(sx,sz,(u,v)=>[widthX(u,w),h*v,front],false,0);
 b.grid(sx,sz,(u,v)=>[widthX(u,w),h*v,back],true,1);
 b.grid(sx,2,(u,v)=>[widthX(u,w),h,t*(v-.5)],true,0);
 b.grid(sx,2,(u,v)=>[widthX(u,w),0,t*(v-.5)],false,0);
 b.grid(2,sz,(u,v)=>[-w/2,h*v,t*(u-.5)],false,0);
 b.grid(2,sz,(u,v)=>[w/2,h*v,t*(u-.5)],true,0);
}
function makeVault(b,o){
 const s=o.segmentsArch,z=o.segmentsZ;
 // Interior and exterior are two independent UV surfaces, joined by thickness strips.
 b.grid(s,z,(u,v)=>roofPoint(o,u,v,false),false,1);
 b.grid(s,z,(u,v)=>roofPoint(o,u,v,true),true,0);
 // Cross-section lips at both open ends: only shell thickness, no end walls.
 for(const v of [0,1]){
  b.grid(s,2,(u,t)=>{const p=roofPoint(o,u,v,false);p[1]+=t*o.thickness;return p;},v===0,0);
 }
 for(const u of [0,1]){
  b.grid(z,2,(v,t)=>{const p=roofPoint(o,u,v,false);p[1]+=t*o.thickness;return p;},u===1,0);
 }
}
function makeTunnel(b,o){
 makeVault(b,o);
 const y=.02;
 b.grid(o.segmentsX,o.segmentsZ,(u,v)=>[widthX(u,o.width),y,depthZ(v,o.length)],true,1);
 b.grid(o.segmentsX,o.segmentsZ,(u,v)=>[widthX(u,o.width),-o.thickness*.45,depthZ(v,o.length)],false,0);
 for(const u of [0,1])b.grid(o.segmentsZ,2,(v,t)=>[widthX(u,o.width),y-t*(o.thickness*.45+y),depthZ(v,o.length)],u===1,0);
 for(const v of [0,1])b.grid(o.segmentsX,2,(u,t)=>[widthX(u,o.width),y-t*(o.thickness*.45+y),depthZ(v,o.length)],v===1,0);
}
function makeRamp(b,o){
 const slope=v=>o.height*v;
 b.grid(o.segmentsX,o.segmentsZ,(u,v)=>[widthX(u,o.width),slope(v),depthZ(v,o.length)],true,0);
 b.grid(o.segmentsX,o.segmentsZ,(u,v)=>[widthX(u,o.width),slope(v)-o.thickness,depthZ(v,o.length)],false,1);
 for(const u of [0,1])b.grid(o.segmentsZ,2,(v,t)=>[widthX(u,o.width),slope(v)-o.thickness*t,depthZ(v,o.length)],u===0,0);
 for(const v of [0,1])b.grid(o.segmentsX,2,(u,t)=>[widthX(u,o.width),slope(v)-o.thickness*t,depthZ(v,o.length)],v===1,0);
}
function makeChamber(b,o){
 const seg=Math.max(24,o.segmentsArch*2),rings=6,levels=8;
 const shape=angle=>1+.075*Math.sin(angle*3+.34)+.047*Math.cos(angle*5-.71);
 const xy=(a,r)=>[Math.cos(a)*(o.width/2)*shape(a)*r,Math.sin(a)*(o.length/2)*shape(a)*r];
 const center=b.vertex(0,.03,0,.5,.5);
 const ringVerts=[];
 for(let ring=1;ring<=rings;ring++){
  const arr=[];
  for(let i=0;i<=seg;i++){
   const a=i/seg*TAU,[x,z]=xy(a,ring/rings);
   arr.push(b.vertex(x,.03,z,.5+x/o.width,.5+z/o.length));
  }
  ringVerts.push(arr);
 }
 // Triangle fan, oriented upward.
 for(let i=0;i<seg;i++)b.triangle(center,ringVerts[0][i+1],ringVerts[0][i],1);
 for(let r=1;r<rings;r++)for(let i=0;i<seg;i++){
  const inner=ringVerts[r-1],outer=ringVerts[r];
  b.quad(inner[i],inner[i+1],outer[i],outer[i+1],false,1);
 }
 // Irregular cave walls with a front portal gap facing negative Z.
 const gap=clamp(Math.round(seg*.10),2,6),entrance=Math.round(seg*.75);
 const omit=i=>Math.abs(i-entrance)<gap/2;
 const wall=(outside,mat)=>{
  for(let i=0;i<seg;i++){
   if(omit(i))continue;
   const a=i/seg*TAU,bAngle=(i+1)/seg*TAU;
   b.grid(1,levels,(u,v)=>{
    const a2=a+(bAngle-a)*u,[x,z]=xy(a2,1);
    const t=outside?1+o.thickness/(o.width*.5):1;
    return [x*t,.03+o.height*v,z*t];
   },outside,mat);
  }
 };
 wall(false,1);wall(true,0);
 // Open roof, actual top wall lip around the perimeter.
 for(let i=0;i<seg;i++){
  if(omit(i))continue;
  const a=i/seg*TAU,bAngle=(i+1)/seg*TAU;
  b.grid(1,2,(u,v)=>{
   const theta=a+(bAngle-a)*u,[x,z]=xy(theta,1);
   const t=1+v*o.thickness/(o.width*.5);
   return [x*t,o.height+.03,z*t];
  },false,0);
 }
}
export function createCavePieceData(kind,parameters={},vertexEdits={}){
 const o=pieceOptions(kind,parameters),b=new Builder();
 if(kind==='floor')makeFloor(b,o);
 if(kind==='wall')makeWall(b,o);
 if(kind==='vault')makeVault(b,o);
 if(kind==='tunnel')makeTunnel(b,o);
 if(kind==='ramp')makeRamp(b,o);
 if(kind==='chamber')makeChamber(b,o);
 const data=b.build(kind,o);
 applyVertexEdits(data,vertexEdits);
 return data;
}
export function applyVertexEdits(data,edits={}){
 const count=data.positions.length/3,accepted={};
 for(const [key,d] of Object.entries(edits||{})){
  const i=Number(key);
  if(!Number.isInteger(i)||i<0||i>=count||!Array.isArray(d)||d.length!==3||d.some(v=>!Number.isFinite(v)))continue;
  const k=i*3;data.positions[k]+=d[0];data.positions[k+1]+=d[1];data.positions[k+2]+=d[2];
  accepted[i]=d.slice();
 }
 data.vertexEdits=accepted;
 recomputeNormals(data);return data;
}
export function deformCavePieceData(data,center,radius,delta){
 const r=Math.max(.1,Number(radius)||1),p=data.positions;
 const d=[Number(delta.x)||0,Number(delta.y)||0,Number(delta.z)||0];
 let count=0;
 for(let i=0;i<p.length;i+=3){
  const dx=p[i]-center.x,dy=p[i+1]-center.y,dz=p[i+2]-center.z;
  const dist=Math.hypot(dx,dy,dz);
  if(dist>r)continue;
  const weight=(1-dist/r)**2,vertexId=i/3,stored=data.vertexEdits[vertexId]||[0,0,0];
  for(let k=0;k<3;k++){const v=d[k]*weight;p[i+k]+=v;stored[k]+=v;}
  data.vertexEdits[vertexId]=stored;count++;
 }
 if(count)recomputeNormals(data);
 return count;
}
export function verifyCavePieceData(data){
 const count=data.positions.length/3,errors=[];
 if(count<16||data.positions.length%3||data.uvs.length!==count*2||data.normals.length!==count*3)
  errors.push('Arreglos de vértices/UV/normales incoherentes');
 if(data.indices.length<30||data.indices.length%3)errors.push('Índices incompletos');
 if(data.indices.some(i=>!Number.isInteger(i)||i<0||i>=count))errors.push('Índices fuera de rango');
 if(data.positions.some(v=>!Number.isFinite(v))||data.normals.some(v=>!Number.isFinite(v)))errors.push('Valores no finitos');
 const used=data.groups.reduce((n,g)=>n+g.count,0);
 if(used!==data.indices.length)errors.push('Grupos de materiales incompletos');
 if(data.groups.some(g=>g.materialIndex!==0&&g.materialIndex!==1))errors.push('Material inválido');
 return errors;
}
