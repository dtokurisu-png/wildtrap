// WILDTRAP: straighten the upper/lower vertex rails along a marked cliff-zone
// contour. Changes the REAL heightfield vertices, not a cosmetic overlay.
// Work on a frozen snapshot so every candidate is repositioned once.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0;};
const within=(poly,x,z)=>{
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
};
function guide(segments,x,z){
 let nearest=null;
 for(const s of segments){
  const t=clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length,0,s.length);
  const px=s.x+s.dx*t/s.length,pz=s.z+s.dz*t/s.length;
  const d=((x-s.x)*s.dz-(z-s.z)*s.dx)/s.length;
  const distance=Math.hypot(x-px,z-pz);
  if(!nearest||distance<nearest.distance)
   nearest={segment:s,t,d,distance};
 }
 return nearest;
}
function fittedHeight(samples,t,radius){
 let w=0,wx=0,wy=0,wxx=0,wxy=0;
 for(const p of samples){
  const dt=p.t-t;
  const k=1/(1+(dt/radius)**2*3);
  w+=k;wx+=k*dt;wy+=k*p.y;wxx+=k*dt*dt;wxy+=k*dt*p.y;
 }
 if(w<=0)return 0;
 const denominator=w*wxx-wx*wx;
 return Math.abs(denominator)<1e-8?wy/w:(wy*wxx-wx*wxy)/denominator;
}
// The polygon is a guide, NOT a snap target: keep distinct parallel upper/lower
// rails. Preserve their average offset from the guide and gradual slope in Y.
export function straightenCliffZone(live,zone,{size=630,resolution=129}={}){
 const points=zone?.points?.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z))||[];
 const n=resolution,cell=size/(n-1),count=n*n;
 if(!zone?.isCliff||points.length<3||live?.heights?.length!==count)return {changed:0,upper:0,lower:0};
 const segments=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
  const length=Math.hypot(dx,dz);
  if(length>cell*.25)segments.push({index:i,x:a.x,z:a.z,dx,dz,length});
 }
 if(segments.length<3)return {changed:0,upper:0,lower:0};
 const offsets=live.terrainVertexOffsets||{};
 const vertices=Array.from({length:count},(_,i)=>{
  const o=offsets[i];
  return {x:(i%n)*cell-size/2+(Number(o?.[0])||0),
   y:Number(live.heights[i])||0,
   z:Math.floor(i/n)*cell-size/2+(Number(o?.[1])||0)};
 });
 const groups=new Map(),borderWidth=cell*3.1,minimumRise=Math.max(2,cell*.72);
 for(let i=n+1;i<count-n-1;i++){
  const row=Math.floor(i/n),col=i%n;
  if(!col||col===n-1||!row||row===n-1)continue;
  const p=vertices[i];
  const hit=guide(segments,p.x,p.z);
  if(!hit||hit.distance>borderWidth)continue;
  if(!within(points,p.x,p.z)&&hit.distance>cell*.8)continue;
  const neighbors=[vertices[i-1],vertices[i+1],vertices[i-n],vertices[i+n]];
  const min=Math.min(p.y,...neighbors.map(q=>q.y));
  const max=Math.max(p.y,...neighbors.map(q=>q.y));
  if(max-min<minimumRise)continue; // Never flatten the ordinary terrain.
  const fraction=(p.y-min)/(max-min);
  const rail=fraction>=.68?'upper':fraction<=.32?'lower':null;
  if(!rail)continue; // Interior cliff faces must keep their vertical profile.
  const key=hit.segment.index+':'+rail;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({i,...hit,y:p.y,rail});
 }
 const updates=[];
 for(const group of groups.values()){
  if(group.length<3)continue;
  // Smooth each rail along the guide; do not mix top and bottom heights.
  group.sort((a,b)=>a.t-b.t);
  const window=cell*4.25;
  for(const item of group){
   const samples=group.filter(p=>Math.abs(p.t-item.t)<=window);
   if(samples.length<3)continue;
   const targetDistance=median(samples.map(p=>p.d));
   const targetY=fittedHeight(samples,item.t,window*.65);
   const s=item.segment;
   const corner=clamp(Math.min(item.t,s.length-item.t)/(cell*1.5),.45,1);
   const strength=.88*corner;
   const shift=clamp((targetDistance-item.d)*strength,-cell*1.4,cell*1.4);
   const dy=clamp((targetY-item.y)*strength,-cell*3.5,cell*3.5);
   if(Math.abs(shift)+Math.abs(dy)<.025)continue;
   // Signed normal to the XZ guide; preserve position along its tangent.
   const p=vertices[item.i];
   const x=p.x+shift*s.dz/s.length;
   const z=p.z-shift*s.dx/s.length;
   updates.push({i:item.i,x,y:clamp(p.y+dy,-500,500),z,rail:item.rail});
  }
 }
 let upper=0,lower=0;
 if(!updates.length)return {changed:0,upper,lower};
 live.terrainVertexOffsets||(live.terrainVertexOffsets={});
 for(const p of updates){
  live.heights[p.i]=p.y;
  const baseX=(p.i%n)*cell-size/2,baseZ=Math.floor(p.i/n)*cell-size/2;
  const dx=p.x-baseX,dz=p.z-baseZ;
  if(Math.abs(dx)<1e-6&&Math.abs(dz)<1e-6)delete live.terrainVertexOffsets[p.i];
  else live.terrainVertexOffsets[p.i]=[dx,dz];
  if(p.rail==='upper')upper++;else lower++;
 }
 return {changed:updates.length,upper,lower};
}
