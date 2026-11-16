// Horizontal cliff-top / cliff-foot seams.
// We clip each existing terrain triangle to two shared Y planes instead of
// selecting jagged triangular ends. This affects ONLY the render overlay.
// Preserves the original world-space triangle plane, winding, and holes.
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const safe=(p)=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
function clipPolygonY(polygon,height,keepAbove){
 const inside=p=>keepAbove?p[1]>=height-1e-7:p[1]<=height+1e-7;
 const result=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length];
  const isA=inside(a),isB=inside(b);
  if(isA)result.push(a);
  if(isA!==isB){
   const den=b[1]-a[1];
   if(Math.abs(den)>1e-10){
    const p=lerp(a,b,Math.max(0,Math.min(1,(height-a[1])/den)));
    p[1]=height;
    result.push(p);
   }
  }
 }
 return result;
}
const triArea2=(a,b,c)=>{
 const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
 const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
 return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
};
export function straightenCliffSeams(triangles,{trimFraction=.065,minHeight=2}={}){
 if(!triangles?.length)return {triangles:[],seams:null};
 const valid=triangles.filter(t=>t.length===3&&t.every(safe));
 if(!valid.length)return {triangles:[],seams:null};
 const heights=valid.flatMap(t=>t.map(p=>p[1]));
 const minY=Math.min(...heights),maxY=Math.max(...heights),range=maxY-minY;
 if(range<minHeight)return {triangles:valid,seams:null};
 // A single top and foot Y for this WHOLE cliff region. Clipping at common
 // levels produces horizontal seams in both geometry and projected UV.
 const amount=Math.max(.01,Math.min(.16,trimFraction));
 const bottom=minY+range*amount,top=maxY-range*amount;
 const out=[];
 for(const triangle of valid){
  let polygon=clipPolygonY(triangle,bottom,true);
  if(polygon.length<3)continue;
  polygon=clipPolygonY(polygon,top,false);
  if(polygon.length<3)continue;
  for(let i=1;i<polygon.length-1;i++){
   const a=polygon[0],b=polygon[i],c=polygon[i+1];
   if(triArea2(a,b,c)>1e-8)out.push([a,b,c]);
  }
 }
 // Failsafe for degenerate geometry: keep the previous cliff overlay.
 return {triangles:out.length?out:valid,seams:out.length?{bottom,top}:null};
}
