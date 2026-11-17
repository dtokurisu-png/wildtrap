import {REPO_TEXTURES,textureUrl,TEXTURE_KINDS,isPublishedTextureUrl} from './editor-texture-catalog.mjs?v=0.9.123';
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
 {id:'detail3',name:'Complementaria 3',type:'blend'}
];
const MAX_IMAGE=380*1024,MAX_TOTAL=2600*1024;
const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
const defaults=()=>{
 const data=Object.fromEntries(BIOMES.map(b=>[b.id,{
  slots:Object.fromEntries(SLOTS.map(s=>[s.id,{name:'',image:'',scale:8,opacity:s.id==='ground'?1:.5}])),
  noise:{scale:20,seed:1},edgeBlend:4
 }]));
 return data;
};
// Keep explicit user overrides, but seed empty slots with the available ground and complementary PNGs.
// The exported JSON stores URLs, never base64 copies of repo textures.
export function ensureBiomeTextureDefaults(raw){
 const out=normalizeBiomeMaterials(raw);
 for(const biome of BIOMES){
  const catalog=REPO_TEXTURES.filter(t=>t.biome===biome.id);
  const keys=[['ground',catalog.find(t=>t.kind==='ground')]];
  catalog.filter(t=>t.kind==='blend').forEach((t,i)=>keys.push(['detail'+(i+1),t]));
  for(const [slot,file] of keys){
   if(!file||!out[biome.id]?.slots?.[slot])continue;
   const target=out[biome.id].slots[slot];
   if(target.image)continue;
   target.name=file.file;target.image=textureUrl(file);
   if(slot.startsWith('detail'))target.opacity=.5;
  }
 }
 return out;
}
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
   const originalSource=typeof v.image==='string'?v.image:'';
   const imageSource=originalSource;
    // Preserve old same-origin PNG paths when files have been removed:
   // show a missing warning rather than silently rewriting the user's map.
   target.image=(REPO_TEXTURES.some(t=>textureUrl(t)===imageSource)||
    /^\.\/assets\/terrain\/texturas\/[^?#]{1,300}\.(png|jpe?g|webp)$/i.test(imageSource))?imageSource:
    /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(imageSource)&&imageSource.length<=MAX_IMAGE*1.4?imageSource:'';
   target.scale=cl(Number(v.scale)||8,.25,1000);
   target.opacity=cl(Number.isFinite(Number(v.opacity))?Number(v.opacity):target.opacity,0,1);
  }
  dest.noise.scale=cl(Number(src.noise?.scale)||20,1,200);
  dest.noise.seed=cl(Math.round(Number(src.noise?.seed)||1),1,9999999);
  dest.edgeBlend=cl(Number.isFinite(Number(src.edgeBlend))?Number(src.edgeBlend):4,0,50);
 }
 return out;
}
export function createBiomeTextureEditor({live,snapshot,persist,toast,onChange=()=>{},getTextureAssetUrl=url=>url}){
 const $=id=>document.getElementById(id);
 const root=$('texturePanel');if(!root)throw Error('Falta panel de texturizado');
 let biomeId=BIOMES[0].id,normalizedRef=null;
 function ensure(){
  if(live.biomeMaterials!==normalizedRef){
   live.biomeMaterials=ensureBiomeTextureDefaults(live.biomeMaterials);
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
 let previewController=null;
 async function openEditor(t,biome,slot){
  if(!biome){toast('Primero selecciona un bioma para editar la textura');return}
  const record=ensure()[biome]?.slots?.[slot];
  if(!record){toast('No se encontró la ranura de la textura');return}
  try{
   if(!previewController){
    const {createTextureScalePreview}=await import('./editor-texture-scale-preview.mjs?v=0.9.116');
    previewController=createTextureScalePreview({toast,getTextureAssetUrl,onApply:next=>{
     snapshot();
     const current=ensure()[next.biome]?.slots?.[next.slot];
     if(!current)return;
     current.name=next.name;current.image=next.url;current.scale=next.scale;
     // Store the chosen repeat count for this exact repository texture.
     if(!live.textureCatalogScale||typeof live.textureCatalogScale!=='object')live.textureCatalogScale={};
     live.textureCatalogScale[next.id]=next.scale;
     persist();render();onChange();
     toast('Escala aplicada: '+next.scale+' repeticiones en el mapa');
    }});
   }
   const url=textureUrl(t);
   const prev=Number(live.textureCatalogScale?.[t.id]);
   previewController.open({id:t.id,name:t.file,url,biome,slot,scale:record.image===url?record.scale:(Number.isFinite(prev)?prev:8)});
  }catch(error){toast('No se pudo abrir editor de textura: '+error.message)}
 }

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
  for(const category of TEXTURE_KINDS.filter(c=>!c.id.startsWith('cliff-'))){
   const files=REPO_TEXTURES.filter(t=>t.kind===category.id&&(filter==='all'||(filter==='untagged'?!tagFor(t):tagFor(t)===filter)));
   const group=element('section');
   group.style.cssText='border:1px solid #406c5c;border-radius:9px;padding:8px;margin:8px 0';
   group.append(element('h3','',category.name+' ('+files.length+')'));
   for(const t of files){
    shown++;
    const card=element('div');card.style.cssText='padding:7px;margin:7px 0;background:#1b3930;border:1px solid #406c5c;border-radius:8px';
    const picture=element('img');picture.src=getTextureAssetUrl(textureUrl(t));picture.alt=t.file;picture.loading='lazy';
    picture.style.cssText='height:100px;width:100%;object-fit:cover;border-radius:6px';card.append(picture);
    const caption=element('small','',t.file);caption.style.cssText='display:block;margin:4px 0;overflow-wrap:anywhere';card.append(caption);
    if(t.kind.startsWith('cliff-')){
     const note=element('small','',t.kind==='cliff-height'?'Mapa de alturas: controla la geometría desde Relieve geométrico de acantilados.':'Imagen original de color: conservada en biblioteca; no se aplica aún a la pared.');
     note.style.cssText='display:block;margin-top:6px;color:#b5e8db';card.append(note);group.append(card);continue;
    }
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
    const validSlots=t.kind==='ground'?['ground']:['detail1','detail2','detail3'];
    for(const key of validSlots){const option=element('option','',SLOTS.find(s=>s.id===key).name);option.value=key;slot.append(option)}
    row.append(slot);
    const edit=element('button','','Editar');edit.type='button';
    edit.title='Ver la textura junto al Explorador 1 WT y ajustar tamaño con Shift + arrastrar';
    edit.onclick=()=>{void openEditor(t,biome.value,slot.value)};
    row.append(edit);card.append(row);group.append(card);
   }
   if(!files.length)group.append(element('small','', 'Sin texturas para este filtro'));
   catalogPanel.append(group);
  }
  $('textureCatalogCount').textContent=shown+' de '+REPO_TEXTURES.length+' texturas';
 }

 const target=$('textureTarget'),repeat=$('textureUnifiedRepeats'),intensity=$('textureUnifiedIntensity'),
  details=$('textureTargetDetails');
 const targets=[];
 for(const biome of BIOMES){
  targets.push({value:'cliff:'+biome.id,label:biome.name+' · Acantilado',biome:biome.id,cliff:true});
  for(const slot of SLOTS)targets.push({value:'slot:'+biome.id+':'+slot.id,label:biome.name+' · '+slot.name,
   biome:biome.id,slot:slot.id,cliff:false});
 }
 for(const entry of targets){
  const option=document.createElement('option');option.value=entry.value;option.textContent=entry.label;
  target.append(option);
 }
 target.value='cliff:plains';
 const current=()=>targets.find(t=>t.value===target.value)||targets[0];
 function cliffSettings(biome){
  if(!live.cliffHeightSettings||typeof live.cliffHeightSettings!=='object')live.cliffHeightSettings={};
  if(!live.cliffHeightSettings.biomes||typeof live.cliffHeightSettings.biomes!=='object')
   live.cliffHeightSettings.biomes={};
  if(!live.cliffHeightSettings.biomes[biome])live.cliffHeightSettings.biomes[biome]={};
  return live.cliffHeightSettings.biomes[biome];
 }
 function cliffRepeats(biome){
  const own=Number(live.cliffHeightSettings?.biomes?.[biome]?.repeats);
  if(Number.isFinite(own)&&own>=3.5&&own<=315)return own;
  const prior=Number(live.cliffHeightSettings?.period);
  if(biome==='plains'&&prior>=2&&prior<=180)return 630/prior;
  const saved=Number(live.textureCatalogScale?.['cliff-'+biome+'-color']);
  return Number.isFinite(saved)&&saved>=3.5&&saved<=315?saved:26.25;
 }
 function render(){
  if(!root.isConnected)return;
  const data=model();renderCatalog();
  const entry=current(),record=entry.cliff?cliffSettings(entry.biome):ensure()[entry.biome].slots[entry.slot];
  repeat.value=String(Math.round((entry.cliff?cliffRepeats(entry.biome):record.scale)*100)/100);
  repeat.min=entry.cliff?'3.5':'.25';repeat.max=entry.cliff?'315':'1000';
  intensity.value=String(Math.round((entry.cliff?(record.intensity??1):record.opacity)*100));
  details.replaceChildren();
  if(entry.cliff){
   const hint=document.createElement('small');hint.textContent='Color y heightmap comparten repeticiones. Los parámetros geométricos aparecen arriba.';
   details.append(hint);
  }else{
   const info=document.createElement('div');info.style.cssText='display:flex;gap:8px;align-items:center;margin-top:7px';
   if(record.image){
    const img=document.createElement('img');img.src=getTextureAssetUrl(record.image);img.alt=record.name||entry.slot;
    img.style.cssText='width:56px;height:56px;object-fit:cover;border-radius:7px';info.append(img);
   }
   const title=document.createElement('small');title.textContent=record.name||'Sin textura asignada';info.append(title);
   details.append(info);
   const attach=document.createElement('label');attach.className='fileBtn';attach.textContent='Cambiar imagen';
   attach.style.cssText='display:inline-block;margin:7px 6px 4px 0';
   const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
   attach.append(input);details.append(attach);
   input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_IMAGE){
     toast('Formato o tamaño no admitido (máximo 380 KB)');return;
    }
    const reader=new FileReader();
    reader.onload=()=>{
     const url=String(reader.result||'');if(!/^data:image\/(png|jpeg|webp);base64,/.test(url))return;
     const total=BIOMES.reduce((sum,b)=>sum+SLOTS.reduce((n,sl)=>n+(ensure()[b.id].slots[sl.id].image?.length||0),0),0);
     if(total-(record.image?.length||0)+url.length>MAX_TOTAL){toast('Límite de imágenes incrustadas alcanzado');return}
     snapshot();record.image=url;record.name=file.name.slice(0,130);persist();render();onChange();
    };
    reader.readAsDataURL(file);
   };
   const clear=document.createElement('button');clear.textContent='Quitar imagen';clear.disabled=!record.image;
   clear.onclick=()=>{snapshot();record.image='';record.name='';persist();render();onChange()};
   details.append(clear);
  }
  $('textureActiveSlotsTitle')?.replaceChildren();
  $('textureSize').textContent='Imágenes del repositorio se cargan por URL';
  $('textureNoise').value=data.noise.scale;
  $('textureNoiseValue').textContent=String(data.noise.scale);
  $('textureSeed').value=data.noise.seed;
  $('textureTransition').value=data.edgeBlend;
  $('textureTransitionValue').textContent=String(data.edgeBlend);
 }
 target.onchange=()=>{render();target.dispatchEvent(new CustomEvent('cliffTargetChanged'))};
 repeat.onchange=()=>{
  const entry=current();snapshot();
  const value=cl(Number(repeat.value)||8,entry.cliff?3.5:.25,entry.cliff?315:1000);
  if(entry.cliff){
   cliffSettings(entry.biome).repeats=value;
   if(!live.textureCatalogScale||typeof live.textureCatalogScale!=='object')live.textureCatalogScale={};
   live.textureCatalogScale['cliff-'+entry.biome+'-color']=value;
  }else ensure()[entry.biome].slots[entry.slot].scale=value;
  persist();render();onChange();
 };
 intensity.onchange=()=>{
  const entry=current();snapshot();const value=cl(Number(intensity.value)/100||0,0,1);
  if(entry.cliff)cliffSettings(entry.biome).intensity=value;
  else ensure()[entry.biome].slots[entry.slot].opacity=value;
  persist();render();onChange();
 };
 $('textureNoise').oninput=e=>$('textureNoiseValue').textContent=e.target.value;
 $('textureNoise').onchange=e=>mutate(m=>m.noise.scale=Number(e.target.value));
 $('textureSeed').onchange=e=>mutate(m=>m.noise.seed=cl(Math.round(Number(e.target.value)||1),1,9999999));
 $('textureTransition').oninput=e=>$('textureTransitionValue').textContent=e.target.value;
 $('textureTransition').onchange=e=>mutate(m=>m.edgeBlend=Number(e.target.value));
 $('textureResetBiome').onclick=()=>{
  const selected=current();if(selected.cliff)return toast('Selecciona primero una textura de suelo o complementaria');
  if(!confirm('¿Restablecer materiales de '+selected.biome+'?'))return;
  snapshot();ensure()[selected.biome]=defaults()[selected.biome];persist();render();onChange();
 };
 render();
 target.dispatchEvent(new Event('change'));
 return {refresh:render,refreshAssets:()=>{
  // Repaint every visible thumbnail without changing saved slot paths or
  // material scales, then update an already-open 3D preview.
  render();
  previewController?.refreshTexture?.();
 }};
}