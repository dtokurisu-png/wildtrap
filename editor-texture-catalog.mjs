export const REPO_TEXTURES=[
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

// GitHub assets may be replaced, removed or added without a JS commit.
// Keep the running catalog in sync with the repository tree. This catalogue
// only lists images; it NEVER changes the current world's saved selections.
let publishedFiles=null;
const classifyTexture=file=>{
 const name=file.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const kind=/suelo base|piso base/.test(name)?'ground':'blend';
 const biome=/llanura|pradera/.test(name)?'plains':
  /desiert|arena/.test(name)?'desert':
  /pantan/.test(name)?'swamp':
  /bosco|bosqu|forest|jungla/.test(name)?'forest':
  /montan|monta[nñ]|rocoso/.test(name)?'mountain':'';
 return {kind,biome};
};
export function syncPublishedTextureFiles(entries){
 if(!Array.isArray(entries))return {added:0,removed:0,total:REPO_TEXTURES.length};
 const valid=entries.filter(x=>typeof x.file==='string'&&!/acantilado|cliff|heigth|heightmap|desplazamiento/i.test(x.file)&&
  /\.(png|jpe?g|webp)$/i.test(x.file)&&x.file.length<=240);
 const old=new Map(REPO_TEXTURES.map(x=>[x.file,x]));
 const list=[],seen=new Set();
 let added=0;
 for(const entry of valid){
  if(seen.has(entry.file))continue;
  seen.add(entry.file);
  const previous=old.get(entry.file);
  if(previous)list.push({...previous,size:Number(entry.size)||previous.size||0});
  else{
   const tags=classifyTexture(entry.file);
   list.push({id:'repo-'+encodeURIComponent(entry.file),file:entry.file,
    biome:tags.biome,kind:tags.kind,size:Number(entry.size)||0});
   added++;
  }
 }
 const removed=[...old.keys()].filter(name=>!seen.has(name));
 REPO_TEXTURES.splice(0,REPO_TEXTURES.length,...list);
 publishedFiles=seen;
 return {added,removed:removed.length,removedNames:removed,total:list.length};
}
export function isPublishedTextureUrl(url){
 if(publishedFiles===null||typeof url!=='string'||!url.startsWith('./assets/terrain/texturas/'))
  return true;
 const filename=url.slice('./assets/terrain/texturas/'.length).split(/[?#]/)[0];
 try{return publishedFiles.has(decodeURIComponent(filename))}
 catch(_){return false}
}
export const TEXTURE_TREE_API=
 'https://api.github.com/repos/dtokurisu-png/wildtrap/git/trees/main?recursive=1';
export async function syncPublishedTextureCatalog(request=fetch){
 const response=await request(TEXTURE_TREE_API,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
 if(!response.ok)throw Error('HTTP '+response.status);
 const data=await response.json();
 if(!Array.isArray(data?.tree)||data.truncated)throw Error('Catálogo incompleto');
 const prefix='assets/terrain/texturas/';
 return syncPublishedTextureFiles(data.tree.filter(t=>t.type==='blob'&&t.path.startsWith(prefix))
  .map(t=>({file:t.path.slice(prefix.length),size:t.size})));
}
export const TEXTURE_KINDS=[{id:'ground',name:'Texturas base'},{id:'blend',name:'Complementarias'}];
