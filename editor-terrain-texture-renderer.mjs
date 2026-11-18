import {createTerrainGPULayers} from './editor-terrain-gpu-layers.mjs?v=0.9.139';
import {BIOMES,ensureBiomeTextureDefaults} from './editor-biome-textures.mjs?v=0.9.123';
export function createTerrainTexturePainter({scene,terrain,material,intangibleMaterial,live,toast,isTesting=()=>false,getTextureAssetUrl=url=>url}){
 const status=document.getElementById('textureRenderStatus'),gpuLayers=createTerrainGPULayers({scene,terrain});
 const cache=new Map(),loaded=new Map();let enabled=true,timer=0,generation=0;
 function decode(url){if(!url)return Promise.resolve(null);if(cache.has(url))return cache.get(url);
  const result=new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=getTextureAssetUrl(url)});cache.set(url,result);return result}
 async function bake(){const ticket=++generation;if(!enabled)return;
  // Independent of which optional panel finishes loading first: never start with missing ground slots.
  if(!live.biomeMaterials||!BIOMES.every(b=>live.biomeMaterials[b.id]?.slots?.ground))
   live.biomeMaterials=ensureBiomeTextureDefaults(live.biomeMaterials);
  const zones=(live.zones||[]).filter(z=>BIOMES.some(b=>b.id===z.biomeId)&&Array.isArray(z.points)&&z.points.length>=3);
  const urls=new Set();for(const z of zones){const slots=live.biomeMaterials?.[z.biomeId]?.slots;for(const key of ['ground','detail1','detail2','detail3'])if(slots?.[key]?.image)urls.add(slots[key].image)}
  await Promise.all([...urls].map(async url=>loaded.set(url,await decode(url))));if(ticket!==generation)return;
  const widths=Object.values(live.biomeMaterials||{}).map(m=>Number(m?.edgeBlend)||0);
  const transitionWorld=Math.max(16,...widths);
  gpuLayers.build({zones:live.zones||[],materials:live.biomeMaterials,loaded,enabled,transitionWorld});
  if(status)status.textContent=gpuLayers.count()?'Suelos base intactos · capas complementarias independientes · '+gpuLayers.count()+' capas GPU.':'Sin texturas de terreno para las zonas asignadas.';apply()}
 function apply(){terrain.material=live.settings?.terrainIntangible&&!isTesting()?intangibleMaterial:material;gpuLayers.sync(enabled&&!(live.settings?.terrainIntangible&&!isTesting()))}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{void bake().catch(e=>toast('Error al generar texturas: '+e.message))},180)}
 function setEnabled(next){enabled=Boolean(next);if(enabled)schedule();else{++generation;gpuLayers.clear();apply()}}
 function invalidateTextureImages(){++generation;cache.clear();loaded.clear();if(enabled)schedule()}
 function dispose(){clearTimeout(timer);++generation;gpuLayers.clear()}
 return {schedule,apply,invalidateTextureImages,setEnabled,dispose,
  getState:()=>({layers:gpuLayers.count(),enabled})};
}
