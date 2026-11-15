import {REPO_TEXTURES,textureUrl,TEXTURE_KINDS} from './editor-texture-catalog.mjs?v=0.9.62';
// Biblioteca de materiales de bioma, fase 3.
// Sin pintar la malla: la aplicación procedural corresponde a la fase 4.
export const BIOMES=[
 {id:'mountain',name:'Montañoso / rocoso'},
 {id:'desert',name:'Desierto'},
 {id:'plains',name:'Llanura'},
 {id:'swamp',name:'Pantano'},
 {id:'forest',name:'Bosque / jungla'}
];
const SLOTS=[
 {id:'ground',name:'Textura base',type:'ground'},
 {id:'detail1',name:'Complementaria 1',type:'blend'},
 {id:'detail2',name:'Complementaria 2',type:'blend'},
 {id:'detail3',name:'Complementaria 3',type:'blend'},
 {id:'cliff',name:'Acantilado',type:'cliff'}
];
const MAX_IMAGE=380*1024,MAX_TOTAL=2600*1024;
const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
const defaults=()=>Object.fromEntries(BIOMES.map(b=>[b.id,{
 slots:Object.fromEntries(SLOTS.map(s=>[s.id,{name:'',image:'',scale:8,opacity:s.id==='ground'||s.id==='cliff'?1:.5}])),
 noise:{scale:20,seed:1},edgeBlend:4
}]));
export function normalizeBiomeMaterials(raw){
 const out=defaults();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 for(const biome of BIOMES){
  const src=raw[biome.id];if(!src||typeof src!=='object')continue;
  const dest=out[biome.id];
  for(const slot of SLOTS){
   const v=src.slots?.[slot.id];if(!v||typeof v!=='object')continue;
   const target=dest.slots[slot.id];
   target.name=typeof v.name==='string'?v.name.slice(0,130):'';
   // Only user-uploaded images, never externally supplied script/URLs.
   const src=typeof v.image==='string'?v.image:'';
   target.image=REPO_TEXTURES.some(t=>textureUrl(t)===src)?src:
    /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(src)&&src.length<=MAX_IMAGE*1.4?src:'';
   target.scale=cl(Number(v.scale)||8,.25,100);
   target.opacity=cl(Number.isFinite(Number(v.opacity))?Number(v.opacity):target.opacity,0,1);
  }
  dest.noise.scale=cl(Number(src.noise?.scale)||20,1,200);
  dest.noise.seed=cl(Math.round(Number(src.noise?.seed)||1),1,9999999);
  dest.edgeBlend=cl(Number.isFinite(Number(src.edgeBlend))?Number(src.edgeBlend):4,0,50);
 }
 return out;
}
export function createBiomeTextureEditor({live,snapshot,persist,toast,onChange=()=>{}}){
 const $=id=>document.getElementById(id);
 const root=$('texturePanel');if(!root)throw Error('Falta panel de texturizado');
 let biomeId=BIOMES[0].id,normalizedRef=null;
 function ensure(){
  if(live.biomeMaterials!==normalizedRef){
   live.biomeMaterials=normalizeBiomeMaterials(live.biomeMaterials);
   normalizedRef=live.biomeMaterials;
  }
  return normalizedRef;
 }
 function model(){return ensure()[biomeId]}
 function element(tag,cls,text){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;return e;
 }
 const select=$('textureBiome');
 select.replaceChildren(...[{id:'all',name:'Todos los biomas'},...BIOMES,{id:'untagged',name:'Sin asignar'}].map(b=>{const o=element('option','',b.name);o.value=b.id;return o}));
 select.value='all';
 select.onchange=()=>{if(BIOMES.some(b=>b.id===select.value))biomeId=select.value;render()};
 function mutate(fn){
  snapshot();fn(model());persist();render();onChange();
 }
 const slots=$('textureSlots');

 const catalogPanel=$('textureCatalog');
 function tags(){
  if(!live.textureCatalogTags||typeof live.textureCatalogTags!=='object'||Array.isArray(live.textureCatalogTags))
   live.textureCatalogTags={};
  return live.textureCatalogTags;
 }
 function tagFor(t){
  const value=tags()[t.id];
  return value===''?'':BIOMES.some(b=>b.id===value)?value:t.biome;
 }
 function renderCatalog(){
  if(!catalogPanel)return;
  catalogPanel.replaceChildren();
  const filter=select.value;
  let shown=0;
  for(const category of TEXTURE_KINDS){
   const files=REPO_TEXTURES.filter(t=>t.kind===category.id&&(filter==='all'||(filter==='untagged'?!tagFor(t):tagFor(t)===filter)));
   const group=element('section');
   group.style.cssText='border:1px solid #406c5c;border-radius:9px;padding:8px;margin:8px 0';
   group.append(element('h3','',category.name+' ('+files.length+')'));
   for(const t of files){
    shown++;
    const card=element('div');card.style.cssText='padding:7px;margin:7px 0;background:#1b3930;border:1px solid #406c5c;border-radius:8px';
    const picture=element('img');picture.src=textureUrl(t);picture.alt=t.file;picture.loading='lazy';
    picture.style.cssText='height:100px;width:100%;object-fit:cover;border-radius:6px';card.append(picture);
    const caption=element('small','',t.file);caption.style.cssText='display:block;margin:4px 0;overflow-wrap:anywhere';card.append(caption);
    const row=element('div');row.style.cssText='display:flex;align-items:center;gap:4px';
    const biome=element('select');biome.setAttribute('aria-label','Bioma de '+t.file);
    biome.style.cssText='min-width:0;flex:1;background:#1e4034;color:#fff;padding:6px';
    for(const b of [{id:'',name:'Sin bioma'},...BIOMES]){
     const option=element('option','',b.name);option.value=b.id;biome.append(option);
    }
    biome.value=tagFor(t);
    biome.onchange=()=>{snapshot();tags()[t.id]=biome.value;persist();renderCatalog()};
    row.append(biome);
    const slot=element('select');slot.setAttribute('aria-label','Ranura de '+t.file);
    slot.style.cssText='width:80px;min-width:0;background:#1e4034;color:#fff;padding:6px';
    const validSlots=t.kind==='ground'?['ground']:t.kind==='cliff'?['cliff']:['detail1','detail2','detail3'];
    for(const key of validSlots){const option=element('option','',SLOTS.find(s=>s.id===key).name);option.value=key;slot.append(option)}
    row.append(slot);
    const use=element('button','','Usar');use.type='button';
    use.onclick=()=>{
     if(!biome.value){toast('Selecciona un bioma');return}
     snapshot();const target=ensure()[biome.value].slots[slot.value];
     target.name=t.file;target.image=textureUrl(t);
     persist();render();onChange();toast('Textura asignada al escenario');
    };
    row.append(use);card.append(row);group.append(card);
   }
   if(!files.length)group.append(element('small','', 'Sin texturas para este filtro'));
   catalogPanel.append(group);
  }
  $('textureCatalogCount').textContent=shown+' de '+REPO_TEXTURES.length+' texturas';
 }

 function render(){
  if(!root.isConnected)return;
  const data=model();
  renderCatalog();
  slots.replaceChildren();
  const total=BIOMES.reduce((sum,b)=>sum+SLOTS.reduce((n,s)=>n+(ensure()[b.id]?.slots?.[s.id]?.image?.length||0),0),0);
  $('textureSize').textContent=(total/1024).toFixed(0)+' KB incrustados en JSON; las imágenes del repositorio se cargan por URL';
  $('textureNoise').value=data.noise.scale;
  $('textureNoiseValue').textContent=String(data.noise.scale);
  $('textureSeed').value=data.noise.seed;
  $('textureTransition').value=data.edgeBlend;
  $('textureTransitionValue').textContent=String(data.edgeBlend);
  for(const def of SLOTS){
   const item=data.slots[def.id];
   const card=element('div','');
   card.style.cssText='border:1px solid #3d6a56;border-radius:9px;padding:9px;margin:9px 0;background:#1c3b30';
   const heading=element('b','',def.name);card.append(heading);
   const preview=element('div');
   preview.style.cssText='min-height:64px;margin:7px 0;border-radius:6px;background:#294c3e;display:flex;align-items:center;justify-content:center;overflow:hidden';
   if(item.image){
    const img=element('img');img.alt=def.name;img.src=item.image;
    img.style.cssText='width:100%;height:100px;object-fit:cover';preview.append(img);
   }else preview.append(element('small','', 'Sin textura cargada'));
   card.append(preview);
   const name=element('small','',item.name||'Archivo pendiente');card.append(name);
   const upload=element('label','fileBtn','Importar PNG / JPG / WebP');
   upload.style.cssText='display:block;margin-top:7px';
   const input=element('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
   upload.append(input);card.append(upload);
   input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Formato no admitido');return;}
    if(file.size>MAX_IMAGE){toast('Imagen demasiado grande: máximo 380 KB por textura. Comprime la imagen antes de importar.');return;}
    const used=BIOMES.reduce((sum,b)=>sum+SLOTS.reduce((n,s)=>n+(ensure()[b.id].slots[s.id].image?.length||0),0),0);
    const predicted=Math.ceil(file.size*4/3)+32;
    if(used-(item.image?.length||0)+predicted>MAX_TOTAL){toast('Límite de imágenes incrustadas alcanzado: exporta o reduce el tamaño de tus texturas');return;}
    const reader=new FileReader();
    reader.onload=()=>{
     const url=String(reader.result||'');
     if(!/^data:image\/(png|jpeg|webp);base64,/.test(url)||url.length>MAX_IMAGE*1.4){toast('No se pudo validar la textura');return;}
     mutate(m=>{m.slots[def.id].image=url;m.slots[def.id].name=file.name.slice(0,130)});
    };
    reader.onerror=()=>toast('No se pudo leer el archivo');
    reader.readAsDataURL(file);
   };
   const clear=element('button','','Quitar textura');clear.style.margin='7px 0';
   clear.disabled=!item.image;
   clear.onclick=()=>mutate(m=>{m.slots[def.id].image='';m.slots[def.id].name=''});
   card.append(clear);
   const scaleLabel=element('label','', 'Repetición / escala: '+item.scale);
   const scale=element('input');scale.type='range';scale.min='.25';scale.max='60';scale.step='.25';scale.value=String(item.scale);
   scale.oninput=()=>{scaleLabel.firstChild.textContent='Repetición / escala: '+scale.value};
   scale.onchange=()=>mutate(m=>m.slots[def.id].scale=Number(scale.value));
   scaleLabel.append(scale);card.append(scaleLabel);
   if(def.type==='blend'){
    const intensity=element('label','', 'Intensidad: '+Math.round(item.opacity*100)+' %');
    const slider=element('input');slider.type='range';slider.min='0';slider.max='100';slider.step='5';slider.value=String(Math.round(item.opacity*100));
    slider.oninput=()=>{intensity.firstChild.textContent='Intensidad: '+slider.value+' %'};
    slider.onchange=()=>mutate(m=>m.slots[def.id].opacity=Number(slider.value)/100);
    intensity.append(slider);card.append(intensity);
   }
   slots.append(card);
  }
 }
 $('textureNoise').oninput=e=>$('textureNoiseValue').textContent=e.target.value;
 $('textureNoise').onchange=e=>mutate(m=>m.noise.scale=Number(e.target.value));
 $('textureSeed').onchange=e=>mutate(m=>m.noise.seed=cl(Math.round(Number(e.target.value)||1),1,9999999));
 $('textureTransition').oninput=e=>$('textureTransitionValue').textContent=e.target.value;
 $('textureTransition').onchange=e=>mutate(m=>m.edgeBlend=Number(e.target.value));
 $('textureResetBiome').onclick=()=>{
  if(!confirm('¿Restablecer las cinco ranuras y parámetros de '+BIOMES.find(b=>b.id===biomeId).name+'?'))return;
  mutate(()=>{ensure()[biomeId]=defaults()[biomeId]});
 };
 render();
 return {refresh:render};
}