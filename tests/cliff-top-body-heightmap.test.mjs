import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sampleCliffHeight} from '../editor-cliff-top-body.mjs';
import {buildCliffBodyHeightmapBuffers,cliffWallProjection,cliffHeightmapTone,
 hasMeaningfulCliffRelief,createCliffZoneProtection} from '../editor-cliff-body-heightmap.mjs';
import {PLAINS_CLIFF_TEXTURE_FILES,PLAINS_CLIFF_MAPS,REPO_TEXTURES,textureUrl} from '../editor-texture-catalog.mjs';
import {ensureBiomeTextureDefaults,normalizePlainsCliffImage} from '../editor-biome-textures.mjs';

const solid=(v=255,w=16,h=16)=>({width:w,height:h,
 data:Uint8ClampedArray.from(Array.from({length:w*h},()=>[v,v,v,255]).flat())});
const white=solid(),black=solid(0);
assert.ok(sampleCliffHeight(white,.5,.5,{repeat:false})>.99);
assert.equal(sampleCliffHeight(black,.4,.6,{repeat:false}),0);
// Bright central mountain, shadowed low surrounding pixels. This is a
// deterministic geometry signal; uniform white/black must NEVER count as relief.
const w=32,h=32,data=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const distance=Math.hypot((x-(w-1)/2)/((w-1)/2),(y-(h-1)/2)/((h-1)/2));
 const height=Math.round(255*Math.max(0,1-distance));
 const k=(y*w+x)*4;data[k]=data[k+1]=data[k+2]=height;data[k+3]=255;
}
const heightmap={width:w,height:h,data};
const tone=cliffHeightmapTone(heightmap);
assert(tone&&tone.contrast>.9,'Heightmap contains real mountain and valley contrast');
const positions=[],normals=[],uvs=[],size=24,step=1;
function push(x,y){positions.push(x,y,0);normals.push(0,0,1);
 uvs.push(x*450/630,y*450/630)}
for(let y=0;y<size;y+=step)for(let x=0;x<size;x+=step){
 push(x,y);push(x+step,y);push(x,y+step);
 push(x+step,y);push(x+step,y+step);push(x,y+step);
}
const refined={positions:new Float32Array(positions),uvs:new Float32Array(uvs),
 normals:new Float32Array(normals)};
const frozen=refined.positions.slice();
const projection={axis:0,minU:0,spanU:24,minY:0,spanY:24};
const result=buildCliffBodyHeightmapBuffers(refined,{
 heightmap,strength:2,wallProjection:projection
});
assert(result?.stats.applied,'A visible grayscale mountain must produce real geometry');
assert(hasMeaningfulCliffRelief(result.stats));
assert.equal(result.triangles,positions.length/9);
assert(result.stats.moved>12&&result.stats.range>.4);
assert(result.stats.minOffset<-.1&&result.stats.maxOffset>.1,
 'Both shadow valleys and bright peaks must deform the cliff');
assert.deepEqual(refined.positions,frozen,
 'Never mutate saved vertices even when the generated cliff changes shape');
assert.deepEqual(result.uvs,refined.uvs,
 'The COLOR UV repeat is unchanged by the independent heightmap projection');
const at=(out,x,y)=>{
 const values=[];
 if(!out?.positions)return values;
 for(let i=0;i<out.positions.length;i+=3)
  if(Math.abs(out.positions[i]-x)<.00001&&Math.abs(out.positions[i+1]-y)<.00001)
   values.push(out.positions[i+2]);
 return values;
};
assert.equal(Math.min(...at(result,0,0)),0,'Cliff rim stays pinned');
assert(Math.max(...at(result,12,12))>.15,'Center mountain actually protrudes in Z');
assert(Math.min(...at(result,4,4))<-.08,'Dark corner valley must be inset into the cliff');
const seam=[[12,6,0],[12,18,0]];
const protectedResult=buildCliffBodyHeightmapBuffers(refined,{
 heightmap,strength:2,seamPaths:[seam],wallProjection:projection
});
assert(protectedResult?.stats.applied);
assert.equal(Math.min(...at(protectedResult,12,12)),0,
 'Protected user seam XYZ remains pinned despite a high mountain');
assert(Math.max(...at(protectedResult,8,12))>0,
 'Adjacent rock away from seam can still protrude');
const changedColorUV={...refined,uvs:new Float32Array(refined.uvs.map(v=>v*10))};
const independent=buildCliffBodyHeightmapBuffers(changedColorUV,{
 heightmap,strength:2,wallProjection:projection
});
assert.deepEqual(independent.positions,result.positions,
 'Color repetition 450 vs 4500 must NOT alias the physical grayscale shape');
assert.equal(buildCliffBodyHeightmapBuffers(refined,{
 heightmap:white,strength:2,wallProjection:projection}),null,
 'Uniform WHITE image must leave original mesh completely unrefined');
assert.equal(buildCliffBodyHeightmapBuffers(refined,{
 heightmap:black,strength:2,wallProjection:projection}),null,
 'Uniform BLACK image must leave original mesh completely unrefined');
assert.equal(buildCliffBodyHeightmapBuffers(refined,{
 heightmap,strength:0,wallProjection:projection}),null,
 'Relief OFF/strength=0 must never subdivide or displace');
// The old protection-field calculation was done per 160-face batch and
// treated these artificial cuts as cliff boundaries. The true outer wall
// perimeter is the only automatic protected boundary.
const wallTiles=[];
for(let y=0;y<24;y++)for(let x=0;x<24;x++){
 wallTiles.push([[x,y,0],[x+1,y,0],[x,y+1,0]]);
 wallTiles.push([[x+1,y,0],[x+1,y+1,0],[x,y+1,0]]);
}
const globalProtect=createCliffZoneProtection(wallTiles,[],1.5);
assert(globalProtect([12,12,.085])>.95,
 'Internal batch boundaries must not suppress heightmap displacement');
assert.equal(globalProtect([0,12,.085]),0,
 'The real outer rim is protected against heightmap cracks');
const protectedWall=createCliffZoneProtection(wallTiles,[[[12,0,0],[12,24,0]]],1.5);
assert.equal(protectedWall([12,12,.085]),0,
 'Explicit manual seam remains pinned by the global protection field');

const inferred=cliffWallProjection([[[0,0,0],[24,0,0],[0,24,0]],
 [[24,0,0],[24,24,0],[0,24,0]]]);
assert.deepEqual(inferred,projection);
assert.deepEqual(PLAINS_CLIFF_TEXTURE_FILES.map(x=>x.role),
 ['cliffBodyColor','cliffBodyHeight'],'Llanura offers precisely 2 body assets; no Top');
const baseFile='Textura de Acantilado llanura CUERPO.png';
const normal=ensureBiomeTextureDefaults({});
assert.equal(normal.plains.slots.cliff.image,PLAINS_CLIFF_MAPS.base,
 'The ordinary Llanura cliff must display CUERPO.png, not Body Color');
assert.equal(REPO_TEXTURES.find(x=>x.id==='tx16')?.file,baseFile,
 'The existing normal cliff entry tx16 must be reassigned to CUERPO.png');
assert.equal(normal.plains.slots.cliffBodyColor.image,PLAINS_CLIFF_MAPS.base,
 'Body Color must use the real CUERPO.png, not a nonexistent -COLOR.png');
assert.equal(PLAINS_CLIFF_MAPS.bodyColor,PLAINS_CLIFF_MAPS.base,
 'Base and generated color are deliberately backed by the same existing file');
assert.ok(REPO_TEXTURES.filter(x=>x.file===baseFile).length===1,
 'Do not duplicate the one available color file in the picker');
assert.equal(normal.plains.slots.cliffBodyHeight.image,PLAINS_CLIFF_MAPS.bodyHeight,
 'Procedural displacement uses CUERPO-HEIGTH.png only');
const grass='Textura de Acantilado llanura Cubierto de Hierba.png';
const oldDouble='Textura de Acantilado llanura  CUERPO.png';
const oldBody='Textura de Acantilado llanura  CUERPO- COLOR.png';
assert.ok(!REPO_TEXTURES.some(x=>/Cubierto de Hierba/i.test(x.file)),
 'Retired grassy textures must not appear in the active repository catalog');
assert.ok(Object.values(PLAINS_CLIFF_MAPS).every(path=>!path.includes('Cubierto')),
 'Retired grassy sources must never appear in the renderer map set');
const legacy=ensureBiomeTextureDefaults({plains:{slots:{
 cliff:{image:textureUrl({file:grass}),name:grass,scale:100},
 cliffBodyColor:{image:PLAINS_CLIFF_MAPS.bodyColor,name:'Body',scale:8},
 cliffBodyHeight:{image:PLAINS_CLIFF_MAPS.bodyHeight,name:'Height',scale:8}
}}});
assert.equal(legacy.plains.slots.cliff.image,PLAINS_CLIFF_MAPS.base,
 'Retired grass material should be mapped to existing Llanura CUERPO.png');
assert.equal(normalizePlainsCliffImage(textureUrl({file:oldDouble}),'cliff'),
 PLAINS_CLIFF_MAPS.base,'Two-space legacy CUERPO path must normalize');
assert.equal(normalizePlainsCliffImage(textureUrl({file:oldBody}),'cliffBodyColor'),
 PLAINS_CLIFF_MAPS.base,'Missing -COLOR path must normalize to current CUERPO.png');
const retiredHeight='Textura de Acantilado llanura Cubierto de Hierba- HEIGTH SIN HIERBA .png';
assert.equal(normalizePlainsCliffImage(textureUrl({file:retiredHeight}),'cliffBodyHeight'),
 PLAINS_CLIFF_MAPS.bodyHeight,'Old saved HEIGHT filename must map to the real CUERPO-HEIGTH.png');
const restoredHeight=ensureBiomeTextureDefaults({plains:{slots:{
 cliffBodyHeight:{image:textureUrl({file:retiredHeight}),name:retiredHeight,scale:450}
}}});
assert.equal(restoredHeight.plains.slots.cliffBodyHeight.image,PLAINS_CLIFF_MAPS.bodyHeight,
 'Do not leave a deleted grassy heightmap assigned in persisted projects');
assert.equal(restoredHeight.plains.slots.cliffBodyHeight.scale,450,
 'Migrating the height PNG must retain the saved scale');
assert.equal(restoredHeight.plains.slots.cliffBodyHeight.name,
 'Textura de Acantilado llanura CUERPO-HEIGTH.png');

const oldMap=ensureBiomeTextureDefaults({plains:{slots:{
 cliff:{image:textureUrl({file:oldDouble}),name:oldDouble,scale:100},
 cliffBodyColor:{image:textureUrl({file:oldBody}),name:oldBody,scale:450},
 cliffBodyHeight:{image:PLAINS_CLIFF_MAPS.bodyHeight,name:'Height',scale:450}
}}});
assert.equal(oldMap.plains.slots.cliff.image,PLAINS_CLIFF_MAPS.base);
assert.equal(oldMap.plains.slots.cliffBodyColor.image,PLAINS_CLIFF_MAPS.base);
assert.equal(oldMap.plains.slots.cliffBodyHeight.image,PLAINS_CLIFF_MAPS.bodyHeight);
assert.equal(oldMap.plains.slots.cliff.scale,100);
assert.equal(oldMap.plains.slots.cliffBodyColor.scale,450);
assert.equal(oldMap.plains.slots.cliffBodyHeight.scale,450);
assert.equal(normalizePlainsCliffImage('data:image/png;base64,AA==','cliffBodyColor'),
 'data:image/png;base64,AA==','Keep uploaded materials untouched');
assert.equal(legacy.plains.slots.cliff.scale,100,
 'Existing user-selected normal cliff scale must be preserved on migration');


const cliff=readFileSync(new URL('../editor-cliff-mesh.mjs',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../editor-terrain-texture-renderer.mjs',import.meta.url),'utf8');
const biome=readFileSync(new URL('../editor-biome-textures.mjs',import.meta.url),'utf8');
assert.match(cliff,/minDivisions=3,maxDivisions=6/);
assert.match(cliff,/buildOriginalCliffMaterialGeometry/);
assert.match(renderer,/const CHUNK=canDisplace\?160:2400/);
assert.match(renderer,/buildRefinedCliffGeometry\(batch/);
assert.match(renderer,/buildOriginalCliffMaterialGeometry\(batch/);
assert.match(renderer,/if\(displaced\?\.stats\?\.applied&&displaced\.positions\)/,
 'Refined geometry can only replace the source if real heightmap shape variation was verified');
assert.match(renderer,/cliffWallProjection\(source\)/,
 'Heightmap must be vertically projected over the actual cliff wall');
assert.match(renderer,/removedSourceFaces\.add\(face\)/,
 'Only accepted heightmap deformation can remove original faces');
assert.match(renderer,/repeat:visibleScale/,
 'Color texture repeat retains its independent scale');
assert.match(renderer,/const generated=plains&&live\.cliffHeightmapPlains\?\.enabled===true/,
 'The ordinary cliff must use CUERPO.png unless procedural generation is enabled');
assert.match(renderer,/slots\.cliff\?\.image\|\|PLAINS_CLIFF_MAPS\.base/,
 'Ordinary cliff must read its original cliff slot');
assert.match(renderer,/slots\.cliffBodyColor\?\.image\|\|PLAINS_CLIFF_MAPS\.bodyColor/,
 'Procedural cliff reads the Body Color slot, now normalized to CUERPO.png');
assert.match(renderer,/slots\.cliffBodyHeight\?\.image\|\|PLAINS_CLIFF_MAPS\.bodyHeight/,
 'Procedural cliff must read dedicated Body Height slot');

assert.match(renderer,/getCliffSubdivisionStats/);
assert.doesNotMatch(biome, /\{id:'cliffTopColor'/,'Top Color must be removed from active slots');
assert.doesNotMatch(biome, /\{id:'cliffTopHeight'/,'Top Height must be removed from active slots');
const scalePreview=readFileSync(new URL('../editor-texture-scale-preview.mjs',import.meta.url),'utf8');
assert.match(scalePreview,/slot==='cliffBodyColor'\|\|slot==='cliffBodyHeight'/,
 'CUERPO Color and Height previews must both be upright vertical cliff surfaces');
const inspector=readFileSync(new URL('../terrain-mesh-inspector.mjs',import.meta.url),'utf8');
assert.match(inspector,/getCliffOverlay\(\)/,'Inspector must display real subdivided cliff meshes');
console.log('PASS: grayscale mountain peaks and valleys change XYZ geometry; uniform/zero maps do not subdivide; color UV remains independent');
