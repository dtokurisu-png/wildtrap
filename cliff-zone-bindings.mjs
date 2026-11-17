export const CLIFF_HEIGHTMAPS=[
 {id:'plains-body',biome:'plains',file:'Textura de Acantilado llanura CUERPO-HEIGTH.png'}
];
// Cliff membership is ONLY an explicit zone tag. Parent biome owns the material choice.
export function registeredCliffZones(live){
 const zones=Array.isArray(live?.zones)?live.zones:[];
 const mains=new Map(zones.filter(z=>z&&!z.isCliff).map(z=>[z.id,z]));
 return zones.filter(z=>z?.isCliff===true&&Array.isArray(z.points)&&z.points.length>=3)
  .map(zone=>({zone,parent:mains.get(zone.cliffParentId)||null}))
  .map(({zone,parent})=>({zone,parent,biome:parent?.biomeId||null,
   map:CLIFF_HEIGHTMAPS.find(m=>m.biome===parent?.biomeId)||null}));
}
