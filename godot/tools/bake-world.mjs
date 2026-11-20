// WildTrap source -> native Godot geometry. Node runs only during development.
// Runtime in Godot is fully native. Original cutters, polygons, cliff subdivision
// and saved numeric data are used rather than a second approximation of them.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildAdaptiveTerrain} from '../../adaptive-terrain-cuts.mjs';
import {buildCliffHeightmapGeometry} from '../../cliff-heightmap-geometry.mjs';
import {registeredCliffZones, cliffRepeatCount} from '../../cliff-zone-bindings.mjs';
const require=createRequire(import.meta.url);
const {PNG}=require('pngjs');
const ROOT=new URL('../../',import.meta.url);
const filepath=p=>path.join(new URL('.',ROOT).pathname,p);
const read=p=>fs.readFileSync(filepath(p));
const write=(p,b)=>{const out=filepath(p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,b)};
const world=JSON.parse(read('godot/data/world.json').toString('utf8'));
if(!Number.isFinite(world.size)||world.size<=0||!Number.isInteger(world.resolution)||world.resolution<2||
  !Array.isArray(world.heights)||world.heights.length!==world.resolution**2)
 throw Error('Invalid WildTrap world: size/resolution/heights mismatch');
const n=world.resolution,size=world.size,count=n*n,step=size/(n-1);
const positions=new Float32Array(count*3),colors=new Float32Array(count*3),
  uvs=new Float32Array(count*2);
const originalIndices=[];
for(let z=0;z<n;z++)for(let x=0;x<n;x++){
 const i=z*n+x,offset=world.terrainVertexOffsets?.[i]||[0,0],h=Number(world.heights[i]);
 if(!Number.isFinite(h))throw Error('Nonfinite height at '+i);
 positions[i*3]=x*step-size/2+(Number(offset[0])||0);
 positions[i*3+1]=h;
 positions[i*3+2]=z*step-size/2+(Number(offset[1])||0);
 const green=.40+Math.max(0,Math.min(1,h/55))*(-.25);
 colors.set([.20+green*.18,green+.20,.26+green*.08],i*3);
 uvs.set([x/(n-1),1-z/(n-1)],i*2);
}
for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){
 const a=z*n+x,b=(z+1)*n+x,c=a+1,d=b+1;
 originalIndices.push(a,b,c,b,d,c);
}
let geometry={positions,colors,uvs,normals:new Float32Array(positions.length).fill(0),
 indices:originalIndices};
for(let i=1;i<geometry.normals.length;i+=3)geometry.normals[i]=1;
const cut=buildAdaptiveTerrain(geometry,world.holes||[],world.cuts3d||[],size,n);
if(cut?.stats.incomplete)throw Error('Source adaptive cutter returned incomplete geometry: '+JSON.stringify(cut.stats));
if(cut)geometry=cut;
const cutStats=cut?.stats||null;
let heightmapStats=[],disabledHeightmaps=0;
const cliffSettings=world.cliffHeightSettings||{};
if(cliffSettings.enabled!==false){
 const cliffHeightPath='godot/assets/textures/cliff_plains_height.png';
 let png=null;
 for(const association of registeredCliffZones(world)){
  if(!association.map||association.biome!=='plains')continue;
  if(!png)png=PNG.sync.read(read(cliffHeightPath));
  const pixel=(x,y)=>{
   const px=((x%png.width)+png.width)%png.width,py=((y%png.height)+png.height)%png.height;
   const ix=(py*png.width+px)*4;
   return (png.data[ix]*.2126+png.data[ix+1]*.7152+png.data[ix+2]*.0722)/255;
  };
  const sample=(u,v)=>{
   const x=((u%1+1)%1)*png.width,y=((v%1+1)%1)*png.height;
   const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
   return pixel(x0,y0)*(1-tx)*(1-ty)+pixel(x0+1,y0)*tx*(1-ty)+
      pixel(x0,y0+1)*(1-tx)*ty+pixel(x0+1,y0+1)*tx*ty;
  };
  const zone=association.zone,xx=zone.points.map(p=>p.x),zz=zone.points.map(p=>p.z);
  const own=cliffSettings.biomes?.[association.biome]||{};
  const setting=(name,defaultVal)=>Number(own[name]??cliffSettings[name]??defaultVal);
  const output=buildCliffHeightmapGeometry(geometry,{
   point:{x:(Math.min(...xx)+Math.max(...xx))/2,z:(Math.min(...zz)+Math.max(...zz))/2},
   normalXZ:[1,0],zonePoints:zone.points,
   radius:Math.max(3,Math.hypot(Math.max(...xx)-Math.min(...xx),Math.max(...zz)-Math.min(...zz))),
   strength:Math.max(0,Math.min(12,setting('strength',3))),
   period:630/cliffRepeatCount(world,association.biome),
   steps:Math.max(1,Math.min(3,Math.floor(setting('steps',2)))),
   smoothing:Math.max(0,Math.min(1,setting('smoothing',.55))),
   peakFlatten:Math.max(0,Math.min(1,setting('peakFlatten',.4))),
   sample
  });
  if(output){geometry=output;heightmapStats.push({zone:zone.id,...output.stats})}
  else disabledHeightmaps++;
 }
}
const pos=geometry.positions,idx=geometry.indices,uv=geometry.uvs||[],
 color=geometry.colors||[],vc=pos.length/3;
if(!Number.isInteger(vc)||!Number.isInteger(idx.length/3)||idx.length===0)throw Error('Invalid geometry output');
const normals=new Float32Array(pos.length);
for(let i=0;i<idx.length;i+=3){
 const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
 if(a<0||b<0||c<0||a>=pos.length||b>=pos.length||c>=pos.length)throw Error('Index out of range');
 const abx=pos[b]-pos[a],aby=pos[b+1]-pos[a+1],abz=pos[b+2]-pos[a+2];
 const acx=pos[c]-pos[a],acy=pos[c+1]-pos[a+1],acz=pos[c+2]-pos[a+2];
 const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
 for(const q of [a,b,c]){normals[q]+=nx;normals[q+1]+=ny;normals[q+2]+=nz}
}
for(let i=0;i<normals.length;i+=3){
 const len=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
 normals[i]/=len;normals[i+1]/=len;normals[i+2]/=len;
}
const stride=11*4,buffer=Buffer.alloc(16+vc*stride+idx.length*4);
buffer.write('WTG2',0,'ascii');buffer.writeUInt32LE(1,4);
buffer.writeUInt32LE(vc,8);buffer.writeUInt32LE(idx.length,12);
let off=16;
for(let i=0;i<vc;i++){
 const values=[pos[i*3],pos[i*3+1],pos[i*3+2],normals[i*3],normals[i*3+1],normals[i*3+2],
  Number(uv[i*2]??0),Number(uv[i*2+1]??0),Number(color[i*3]??1),Number(color[i*3+1]??1),Number(color[i*3+2]??1)];
 for(const v of values){if(!Number.isFinite(v))throw Error('Nonfinite mesh element at vertex '+i);buffer.writeFloatLE(v,off);off+=4;}
}
for(const x of idx){buffer.writeUInt32LE(x,off);off+=4}
write('godot/data/terrain.wtmesh',buffer);
const biomes=['forest','desert','plains','swamp','mountain'],maskRes=512;
const zones=(world.zones||[]).filter(z=>!z.isCliff&&!z.hidden&&z.points?.length>=3);
const inside=(x,z,p)=>{
 let yes=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[i],b=p[j];
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)yes=!yes;
 }return yes;
};
for(const biome of biomes){
 const belonging=zones.filter(z=>z.biomeId===biome),img=new PNG({width:maskRes,height:maskRes});
 for(let y=0;y<maskRes;y++)for(let x=0;x<maskRes;x++){
  const wx=(x+.5)/maskRes*size-size/2,wz=size/2-(y+.5)/maskRes*size;
  const v=belonging.some(zone=>inside(wx,wz,zone.points))?255:0;
  const i=(y*maskRes+x)*4;img.data[i]=v;img.data[i+1]=v;img.data[i+2]=v;img.data[i+3]=255;
 }
 write('godot/data/masks/'+biome+'.png',PNG.sync.write(img));
}
const summary={
 source:'assets/terrain/wildtrap-mobile-world.json (published repository snapshot, not verified as escenario (4))',
 size,resolution:n,heightSamples:count,offsets:Object.keys(world.terrainVertexOffsets||{}).length,
 zones:world.zones?.length||0,cliffs:(world.zones||[]).filter(z=>z.isCliff).length,
 cuts:world.cuts3d?.length||0,vertices:vc,triangles:idx.length/3,cutStats,heightmapStats,disabledHeightmaps,
 missing:'Full exported wildtrap-escenario (4).json not available; sculpt operations of GLB models and source-specific texture layering remain to migrate.'
};
write('godot/data/world-build.json',JSON.stringify(summary,null,2)+'\n');
console.log('WILDTRAP_BAKE_OK '+JSON.stringify(summary));
