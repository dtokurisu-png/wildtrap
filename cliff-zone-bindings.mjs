// Cliff assets follow parent biome, never inferred from the zone name.
export const CLIFF_ASSETS=[
 {biome:'plains',label:'Llanura',color:'Textura de Acantilado llanura CUERPO.png',height:'Textura de Acantilado llanura CUERPO-HEIGTH.png'},
 {biome:'forest',label:'Bosque',color:'acantilado bosque.png',height:null},
 {biome:'desert',label:'Desierto',color:'Acantilado decierto con borde arenoso.png',height:null},
 {biome:'swamp',label:'Pantano',color:'Acantilado pantanoso de musgo y raíces.png',height:null},
 {biome:'mountain',label:'Montaña',color:'Muro de acantilado rocoso en capas.png',height:null}
];
export const CLIFF_HEIGHTMAPS=CLIFF_ASSETS.filter(a=>a.height).map(a=>({
 id:a.biome+'-body',biome:a.biome,file:a.height
}));
export const cliffAsset=biome=>CLIFF_ASSETS.find(a=>a.biome===biome)||null;
export function cliffRepeatCount(live,biome){
 const settings=live?.cliffHeightSettings||{};
 const own=Number(settings.biomes?.[biome]?.repeats);
 if(Number.isFinite(own)&&own>=3.5&&own<=315)return own;
 // Preserve the original plains heightmap scale for existing projects.
 if(biome==='plains'){
  const previousPeriod=Number(settings.period);
  if(previousPeriod>=2&&previousPeriod<=180)return 630/previousPeriod;
 }
 const original=Number(live?.textureCatalogScale?.['cliff-'+biome+'-color']);
 return original>=3.5&&original<=315?original:26.25;
}
export function registeredCliffZones(live){
 const zones=Array.isArray(live?.zones)?live.zones:[];
 const mains=new Map(zones.filter(z=>z&&!z.isCliff).map(z=>[z.id,z]));
 return zones.filter(z=>z?.isCliff===true&&Array.isArray(z.points)&&z.points.length>=3)
  .map(zone=>({zone,parent:mains.get(zone.cliffParentId)||null}))
  .map(({zone,parent})=>({zone,parent,biome:parent?.biomeId||null,
   map:CLIFF_HEIGHTMAPS.find(m=>m.biome===parent?.biomeId)||null}));
}
