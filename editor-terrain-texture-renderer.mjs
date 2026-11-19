import {createTerrainGPULayers} from './editor-terrain-gpu-layers.mjs?v=0.9.175';
import {BIOMES,ensureBiomeTextureDefaults} from './editor-biome-textures.mjs?v=0.9.123';
export function createTerrainTexturePainter({scene,terrain,renderer,material,intangibleMaterial,live,toast,isTesting=()=>false,getTextureAssetUrl=url=>url,getHandpaintTexture=()=>null}){
 const status=document.getElementById('textureRenderStatus'),gpuLayers=createTerrainGPULayers({scene,terrain,renderer});
 gpuLayers.setHandpaintTexture(getHandpaintTexture());
 const cache=new Map(),loaded=new Map();let enabled=true,timer=0,generation=0;
 function decode(url){
  if(!url)return Promise.resolve(null);
  if(cache.has(url))return cache.get(url);
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||location.pathname.endsWith('/mobile.html');
  const result=new Promise(resolve=>{
   const img=new Image();
   img.onload=()=>{
    if(mobile){
     try{
      const longest=Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height,1);
      const maxSize=Math.max(512,Math.min(renderer?.capabilities?.maxTextureSize||1024,1024));
      const ratio=Math.min(1,maxSize/longest);
      const small=document.createElement('canvas');
      small.width=Math.max(1,Math.round((img.naturalWidth||img.width)*ratio));
      small.height=Math.max(1,Math.round((img.naturalHeight||img.height)*ratio));
      const ctx=small.getContext('2d',{alpha:true});
      if(!ctx)throw Error('Sin Canvas2D');
      ctx.drawImage(img,0,0,small.width,small.height);
      resolve(small);
     }catch(error){console.warn('WildTrap: no se pudo reducir textura:',url,error);resolve(null)}
    }else resolve(img);
   };
   img.onerror=()=>{console.warn('WildTrap: imagen de terreno inaccesible:',url);resolve(null)};
   img.src=getTextureAssetUrl(url);
  });
  cache.set(url,result);return result;
 }
 async function bake(){const ticket=++generation;if(!enabled)return;
  // Restore missing texture slot defaults before GPU layer construction.
  if(!live.biomeMaterials||!BIOMES.every(b=>live.biomeMaterials[b.id]?.slots?.ground))
   live.biomeMaterials=ensureBiomeTextureDefaults(live.biomeMaterials);
  const zones=(live.zones||[]).filter(z=>BIOMES.some(b=>b.id===z.biomeId)&&Array.isArray(z.points)&&z.points.length>=3);
  const urls=new Set();for(const z of zones){const slots=live.biomeMaterials?.[z.biomeId]?.slots;for(const key of ['ground','detail1','detail2','detail3'])if(slots?.[key]?.image)urls.add(slots[key].image)}
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||location.pathname.endsWith('/mobile.html');
  // Load one image at a time: 8K source PNGs otherwise decode concurrently
  // into hundreds of MB and lose the WebGL context on mobile browsers.
  for(const url of urls){
   if(mobile&&!Object.values(live.biomeMaterials||{}).some(m=>m?.slots?.ground?.image===url))continue;
   const image=await decode(url);
   if(ticket!==generation)return;
   loaded.set(url,image);
  }
  const widths=Object.values(live.biomeMaterials||{}).map(m=>Number(m?.edgeBlend)||0);
  const transitionWorld=Math.max(16,...widths);
  gpuLayers.build({zones:live.zones||[],materials:live.biomeMaterials,loaded,enabled,transitionWorld});
  // The renderer owns downscaled GPU source canvases. Release enormous original PNG
  // Image objects after building the mobile terrain layers.
  if(mobile){loaded.clear();cache.clear();}
  if(status)status.textContent=gpuLayers.count()?'Suelos base intactos · capas complementarias independientes · '+gpuLayers.count()+' capas GPU.':'Sin texturas de terreno para las zonas asignadas.';apply()}
 function apply(){terrain.material=live.settings?.terrainIntangible&&!isTesting()?intangibleMaterial:material;gpuLayers.sync(enabled&&!(live.settings?.terrainIntangible&&!isTesting()))}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{void bake().catch(e=>toast('Error al generar texturas: '+e.message))},180)}
 function setEnabled(next){enabled=Boolean(next);if(enabled)schedule();else{++generation;gpuLayers.clear();apply()}}
 function invalidateTextureImages(){++generation;cache.clear();loaded.clear();if(enabled)schedule()}
 function dispose(){clearTimeout(timer);++generation;gpuLayers.clear()}
 return {schedule,apply,invalidateTextureImages,setEnabled,dispose,
  setHandpaintTexture:texture=>gpuLayers.setHandpaintTexture(texture),
  setHandpaintSettings:settings=>gpuLayers.setHandpaintSettings(settings),
  setBiomeColorSettings:(biome,settings)=>gpuLayers.setBiomeColorSettings(biome,settings),
  getHandpaintState:()=>gpuLayers.getHandpaintState()};
}
