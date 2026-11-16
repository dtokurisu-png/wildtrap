export const REPO_TEXTURES=[
 {
  "id": "tx01",
  "file": "Acantilado decierto con borde arenoso.png",
  "biome": "desert",
  "kind": "cliff",
  "size": 2183386
 },
 {
  "id": "tx02",
  "file": "Acantilado pantanoso de musgo y raíces.png",
  "biome": "swamp",
  "kind": "cliff",
  "size": 2217864
 },
 {
  "id": "tx03",
  "file": "Baldosa rocosa con musgo en capas.png",
  "biome": "mountain",
  "kind": "blend",
  "size": 2133214
 },
 {
  "id": "tx04",
  "file": "Charca de pantano con nenúfares.png",
  "biome": "swamp",
  "kind": "blend",
  "size": 1696145
 },
 {
  "id": "tx05",
  "file": "Círculo de pantano sobre transparencia.png",
  "biome": "swamp",
  "kind": "blend",
  "size": 3114973
 },
 {
  "id": "tx06",
  "file": "Muro de acantilado rocoso en capas.png",
  "biome": "mountain",
  "kind": "cliff",
  "size": 2231597
 },
 {
  "id": "tx07",
  "file": "Parche de hierba seca pintada.png",
  "biome": "plains",
  "kind": "blend",
  "size": 2480513
 },
 {
  "id": "tx08",
  "file": "Parche de pradera florida pintada.png",
  "biome": "plains",
  "kind": "blend",
  "size": 2371305
 },
 {
  "id": "tx09",
  "file": "Parche de suelo forestal con musgo y piedras.png",
  "biome": "forest",
  "kind": "blend",
  "size": 2126203
 },
 {
  "id": "tx10",
  "file": "Parche de suelo forestal erosionado.png",
  "biome": "forest",
  "kind": "blend",
  "size": 2010369
 },
 {
  "id": "tx11",
  "file": "Parche de terreno desértico estilizado (2).png",
  "biome": "desert",
  "kind": "blend",
  "size": 2409750
 },
 {
  "id": "tx12",
  "file": "Parche de terreno rocoso y musgoso.png",
  "biome": "mountain",
  "kind": "blend",
  "size": 2165706
 },
 {
  "id": "tx13",
  "file": "Parche de tierra con raíces y musgo.png",
  "biome": "forest",
  "kind": "blend",
  "size": 2198193
 },
 {
  "id": "tx14",
  "file": "Parche de tierra y pasto pisoteado.png",
  "biome": "plains",
  "kind": "blend",
  "size": 2396189
 },
 {
  "id": "tx15",
  "file": "Parche montañoso rocoso con hierba.png",
  "biome": "mountain",
  "kind": "blend",
  "size": 1933568
 },
 {
  "id": "tx16",
  "file": "Textura de Acantilado llanura  CUERPO.png",
  "biome": "plains",
  "kind": "cliff",
  "size": 1853214
 },
 {
  "id": "tx17",
  "file": "Textura de Tierra Desértica Agrietada.png",
  "biome": "desert",
  "kind": "blend",
  "size": 2282093
 },
 {
  "id": "tx18",
  "file": "Textura de arena dorada ondulada.png",
  "biome": "desert",
  "kind": "blend",
  "size": 2294623
 },
 {
  "id": "tx19",
  "file": "WT_Pantano_Blend_A_Transparencia_Real_RGBA.png",
  "biome": "swamp",
  "kind": "blend",
  "size": 1950050
 },
 {
  "id": "tx20",
  "file": "acantilado bosque.png",
  "biome": "forest",
  "kind": "cliff",
  "size": 2479866
 },
 {
  "id": "tx21",
  "file": "suelo base boscoso pintado.png",
  "biome": "forest",
  "kind": "ground",
  "size": 1916779
 },
 {
  "id": "tx22",
  "file": "suelo base de desierto arena dorada.png",
  "biome": "desert",
  "kind": "ground",
  "size": 1962465
 },
 {
  "id": "tx23",
  "file": "suelo base de llanura_Cesped_Natural_8K_Seamless.png",
  "biome": "plains",
  "kind": "ground",
  "size": 32437086
 },
 {
  "id": "tx24",
  "file": "suelo base de montaña.png",
  "biome": "mountain",
  "kind": "ground",
  "size": 2708115
 },
 {
  "id": "tx25",
  "file": "suelo base de pantano Musgoso.png",
  "biome": "swamp",
  "kind": "ground",
  "size": 2333667
 }
];
// Llanura has one normal cliff image (CUERPO.png), plus dedicated
// CUERPO Color/Height assets for the optional heightmap generator.
// Deprecated "Cubierto de Hierba" assets are no longer offered or referenced.
export const PLAINS_CLIFF_TEXTURE_FILES=[
 {id:'tx28',file:'Textura de Acantilado llanura  CUERPO- COLOR.png',biome:'plains',kind:'cliff',role:'cliffBodyColor',size:934326},
 {id:'tx29',file:'Textura de Acantilado llanura CUERPO-HEIGTH.png',biome:'plains',kind:'heightmap',role:'cliffBodyHeight',size:457558}
];
REPO_TEXTURES.push(...PLAINS_CLIFF_TEXTURE_FILES);
export const textureUrl=texture=>'./assets/terrain/texturas/'+encodeURIComponent(texture.file);
// Llanura source files verified in assets/terrain/texturas.
// "cliff" is the original single-material cliff, restored to CUERPO.png.
// The optional procedural generator uses the other two dedicated images.
export const PLAINS_CLIFF_MAPS={
 base:textureUrl({file:'Textura de Acantilado llanura  CUERPO.png'}),
 bodyColor:textureUrl({file:'Textura de Acantilado llanura  CUERPO- COLOR.png'}),
 bodyHeight:textureUrl({file:'Textura de Acantilado llanura CUERPO-HEIGTH.png'})
};
export const TEXTURE_KINDS=[{id:'ground',name:'Texturas base'},{id:'blend',name:'Complementarias'},{id:'cliff',name:'Acantilados'},{id:'heightmap',name:'Heightmaps'}];
