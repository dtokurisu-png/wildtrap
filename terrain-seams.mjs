// Persistent terrain seam locks. Source-grid vertex IDs are stable across
// cuts, undo/redo, and generated terrain geometry; their XYZ anchors are not.
const validId=(id,n)=>Number.isInteger(id)&&id>=0&&id<n;
const validPosition=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const base=(id,size,resolution)=>{
 const step=size/(resolution-1);
 return [(id%resolution)*step-size/2,Math.floor(id/resolution)*step-size/2];
};
export function seamAnchors(live,count=Infinity){
 const anchors=new Map();
 for(const seam of Array.isArray(live?.terrainSeams)?live.terrainSeams:[])
  for(const id of seam?.vertices||[]){
   const p=seam?.anchors?.[id];
   if(validId(id,count)&&validPosition(p)&&!anchors.has(id))anchors.set(id,p);
  }
 return anchors;
}
export function seamVertexIds(live,count=Infinity){
 return new Set(seamAnchors(live,count).keys());
}
export function restoreTerrainSeams(live,{size=630,resolution=129}={}){
 if(!live||!Array.isArray(live.heights))return 0;
 const anchors=seamAnchors(live,live.heights.length);
 const offsets=live.terrainVertexOffsets||(live.terrainVertexOffsets={});
 let changed=0;
 for(const [id,p] of anchors){
  const [x0,z0]=base(id,size,resolution),dx=p[0]-x0,dz=p[2]-z0;
  const current=offsets[id]||[0,0];
  if(live.heights[id]!==p[1]||Math.abs((Number(current[0])||0)-dx)>1e-7||
      Math.abs((Number(current[1])||0)-dz)>1e-7)changed++;
  live.heights[id]=p[1];
  if(Math.abs(dx)+Math.abs(dz)<1e-7)delete offsets[id];
  else offsets[id]=[dx,dz];
 }
 return changed;
}
export function updateManualTerrainSeamAnchors(live,points){
 if(!Array.isArray(live?.terrainSeams)||!points?.size)return 0;
 let updated=0;
 for(const seam of live.terrainSeams){
  if(!seam?.anchors)continue;
  for(const id of seam.vertices||[]){
   const p=points.get(id);
   if(validPosition(p)&&Object.prototype.hasOwnProperty.call(seam.anchors,id)){
    seam.anchors[id]=[...p];updated++;
   }
  }
 }
 return updated;
}
export function addTerrainSeam(live,indices,getPosition,orderedPath=[]){
 if(!Array.isArray(live?.heights)||typeof getPosition!=='function')return null;
 const ids=[...new Set(indices)].filter(id=>validId(id,live.heights.length));
 if(ids.length<2)return null;
 const anchors={};
 for(const id of ids){
  const p=getPosition(id);
  if(!validPosition(p))return null;
  anchors[id]=[...p];
 }
 live.terrainSeams||(live.terrainSeams=[]);
 let number=1;
 while(live.terrainSeams.some(seam=>seam.id==='seam-'+number))number++;
 const same=new Set(ids);
 let path=[...orderedPath].filter(id=>same.has(id));
 if(path.length<2)path=ids;
 const seam={id:'seam-'+number,name:'Costura '+String(number).padStart(2,'0'),
  kind:'cliff',vertices:ids,anchors,path};
 live.terrainSeams.push(seam);
 return seam;
}
export function removeTerrainSeam(live,id){
 const seams=live?.terrainSeams;
 if(!Array.isArray(seams))return false;
 const i=seams.findIndex(s=>s.id===id);
 if(i<0)return false;
 seams.splice(i,1);return true;
}
export function buildTerrainVertexGraph(geometry){
 const count=geometry.attributes.position.count;
 const adjacency=Array.from({length:count},()=>new Set());
 const indices=geometry.index?.array;
 const join=(a,b)=>{
  if(a===b||!validId(a,count)||!validId(b,count))return;
  adjacency[a].add(b);adjacency[b].add(a);
 };
 if(indices){
  for(let k=0;k+2<indices.length;k+=3){
   const a=indices[k],b=indices[k+1],c=indices[k+2];
   join(a,b);join(b,c);join(c,a);
  }
 }
 return adjacency.map(s=>[...s]);
}
const distance=(pos,a,b)=>{
 const x=pos.getX(a)-pos.getX(b),y=pos.getY(a)-pos.getY(b),z=pos.getZ(a)-pos.getZ(b);
 return Math.hypot(x,y,z);
};
// A* over ACTUAL triangle edges, not a geometric straight-line interpolation.
// Stable tie breaks and terrain height keep the route on the selected rim.
export function shortestTerrainVertexPath(geometry,graph,from,to){
 const pos=geometry?.attributes?.position;
 if(!pos||!Array.isArray(graph)||!validId(from,pos.count)||!validId(to,pos.count))return [];
 if(from===to)return [from];
 const g=new Float64Array(pos.count).fill(Infinity),parent=new Int32Array(pos.count).fill(-1);
 const closed=new Uint8Array(pos.count),heap=[];
 function push(id,score){
  let i=heap.length;heap.push({id,score});
  while(i){const p=(i-1)>>1;if(heap[p].score<=score)break;heap[i]=heap[p];i=p;}
  heap[i]={id,score};
 }
 function pop(){
  const result=heap[0],last=heap.pop();
  if(!heap.length)return result;
  let i=0;
  while(i*2+1<heap.length){
   let c=i*2+1;
   if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;
   if(heap[c].score>=last.score)break;
   heap[i]=heap[c];i=c;
  }
  heap[i]=last;return result;
 }
 g[from]=0;push(from,distance(pos,from,to));
 while(heap.length){
  const {id}=pop();
  if(closed[id])continue;
  if(id===to){
   const route=[];
   for(let k=to;k>=0;k=parent[k]){route.push(k);if(k===from)break;}
   return route.at(-1)===from?route.reverse():[];
  }
  closed[id]=1;
  for(const next of graph[id]||[]){
   if(closed[next])continue;
   const candidate=g[id]+distance(pos,id,next);
   if(candidate>=g[next]-1e-9)continue;
   g[next]=candidate;parent[next]=id;
   push(next,candidate+distance(pos,next,to));
  }
 }
 return [];
}
