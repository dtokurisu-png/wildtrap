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
   target.image=typeof v.image==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v.image)
    &&v.image.length<=MAX_IMAGE*1.4?v.image:'';
   target.scale=cl(Number(v.scale)||8,.25,100);
   target.opacity=cl(Number.isFinite(Number(v.opacity))?Number(v.opacity):target.opacity,0,1);
  }
  dest.noise.scale=cl(Number(src.noise?.scale)||20,1,200);
  dest.noise.seed=cl(Math.round(Number(src.noise?.seed)||1),1,9999999);
  dest.edgeBlend=cl(Number.isFinite(Number(src.edgeBlend))?Number(src.edgeBlend):4,0,50);
 }
 return out;
}
export function createBiomeTextureEditor({live,snapshot,persist,toast}){
 const $=id=>document.getElementById(id);
 const root=$('texturePanel');if(!root)throw Error('Falta panel de texturizado');
 let biomeId=BIOMES[0].id;
 function ensure(){
  if(!live.biomeMaterials||typeof live.biomeMaterials!=='object')live.biomeMaterials=defaults();
  for(const b of BIOMES)if(!live.biomeMaterials[b.id]?.slots)live.biomeMaterials[b.id]=defaults()[b.id];
  return live.biomeMaterials;
 }
 function model(){return ensure()[biomeId]}
 function element(tag,cls,text){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;return e;
 }
 const select=$('textureBiome');
 select.replaceChildren(...BIOMES.map(b=>{const o=element('option','',b.name);o.value=b.id;return o}));
 select.value=biomeId;
 select.onchange=()=>{biomeId=select.value;render()};
 function mutate(fn){
  snapshot();fn(model());persist();render();
 }
 const slots=$('textureSlots');
 function render(){
  if(!root.isConnected)return;
  const data=model();
  slots.replaceChildren();
  const total=BIOMES.reduce((sum,b)=>sum+SLOTS.reduce((n,s)=>n+(ensure()[b.id]?.slots?.[s.id]?.image?.length||0),0),0);
  $('textureSize').textContent=(total/1024).toFixed(0)+' KB de imágenes incorporadas al JSON (máx. '+Math.floor(MAX_TOTAL/1024)+' KB)';
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