import {objectTree,sceneObjectCount,categoryForNode} from './scene-object-catalog.mjs?v=0.9.10';

// Editor-only outliner. This component NEVER mutates live world data directly:
// its host callbacks use the normal snapshot / draw / persist pipeline.
export function createSceneObjectManager({
 root,hierarchyRoot,getNodes,getGroups,getSelection,lookup,select,setVisibility,group,ungroup,rename,
 terrainIsVisible=()=>true,setTerrainVisibility=()=>{}
}){
 if(!root||!hierarchyRoot)throw new Error('No se encontraron las ventanas Objetos y Jerarquía');
 const create=(tag,className,text)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const COLLAPSE_KEY='wildtrap-scene-object-folders-v1';
 let collapsed={};
 try{
  const state=JSON.parse(localStorage.getItem(COLLAPSE_KEY)||'{}');
  if(state&&typeof state==='object'&&!Array.isArray(state))collapsed=state;
 }catch(_){}
 let anchor=null,signature='';
 const header=create('div','scene-manager-header');
 const heading=create('div','scene-manager-title','Objetos de la escena');
 const counter=create('span','scene-manager-count','0');
 heading.append(counter);
 const actionBar=create('div','scene-manager-actions');
 const groupButton=create('button','scene-manager-action','Agrupar');
 const ungroupButton=create('button','scene-manager-action','Desagrupar');
 const renameButton=create('button','scene-manager-action','Renombrar');
 for(const button of [groupButton,ungroupButton,renameButton]){
  button.type='button';actionBar.append(button);
 }
 const note=create('p','hint scene-manager-note','Solo modelos colocados: spawns y marcadores lógicos no aparecen.');
 header.append(heading,actionBar,note);
 const terrainSection=create('section','scene-group scene-terrain-group');
 const terrainRow=create('div','scene-group-header');
 const terrainLabel=create('span','scene-terrain-name','▤  Escenario · Terreno');
 const terrainEye=create('button','scene-group-eye','◉');
 terrainEye.type='button';
 terrainEye.addEventListener('click',()=>setTerrainVisibility(!terrainIsVisible()));
 terrainRow.append(terrainLabel,terrainEye);terrainSection.append(terrainRow);
 const treeRoot=create('div','scene-tree');
 root.replaceChildren(header,terrainSection,treeRoot);
 const hierarchyTitle=create('h2','', 'Jerarquía de la escena');
 const hierarchyBody=create('div','scene-hierarchy-body');
 hierarchyRoot.replaceChildren(hierarchyTitle,hierarchyBody);
 const savedCollapse=()=>{
  try{localStorage.setItem(COLLAPSE_KEY,JSON.stringify(collapsed))}catch(_){}
 };
 const selectedStatic=()=>getSelection().filter(id=>getNodes().some(n=>n.id===id&&categoryForNode(n)));
 const findObject=id=>getNodes().find(n=>n.id===id);
 function syncSelection(){
  const terrainVisible=terrainIsVisible();
  terrainEye.textContent=terrainVisible?'◉':'◌';
  terrainEye.title=terrainVisible?'Ocultar terreno (solo en el editor)':'Mostrar terreno';
  terrainEye.setAttribute('aria-label',terrainEye.title);
  terrainEye.classList.toggle('is-hidden',!terrainVisible);
  const selected=new Set(getSelection());
  for(const button of treeRoot.querySelectorAll('[data-object-id]')){
   const active=selected.has(Number(button.dataset.objectId));
   button.classList.toggle('selected',active);
   button.setAttribute('aria-pressed',String(active));
  }
  const ids=selectedStatic();
  groupButton.disabled=ids.length<2;
  ungroupButton.disabled=!ids.some(id=>findObject(id)?.groupId);
  renameButton.disabled=ids.length!==1;
  counter.textContent=sceneObjectCount(getNodes());
 }
 groupButton.addEventListener('click',()=>{
  const ids=selectedStatic();if(ids.length<2)return;
  const proposed='Grupo '+(getGroups().length+1);
  const name=window.prompt('Nombre del grupo de objetos',proposed);
  if(name===null||!name.trim())return;
  group(ids,name.trim());
 });
 ungroupButton.addEventListener('click',()=>{
  const ids=selectedStatic();if(ids.length)ungroup(ids);
 });
 renameButton.addEventListener('click',()=>{
  const ids=selectedStatic();if(ids.length!==1)return;
  const obj=findObject(ids[0]);if(!obj)return;
  const name=window.prompt('Nuevo nombre del objeto',obj.name?.trim()||('Objeto '+obj.id));
  if(name===null||!name.trim())return;
  rename(obj.id,name.trim());
 });
 function handleSelect(id,event,items){
  const selected=new Set(getSelection());
  if(event.shiftKey&&anchor!==null){
   const positions=items.map(item=>item.id);
   const a=positions.indexOf(anchor),b=positions.indexOf(id);
   if(a!==-1&&b!==-1){
    if(!event.ctrlKey&&!event.metaKey)selected.clear();
    for(const item of positions.slice(Math.min(a,b),Math.max(a,b)+1))selected.add(item);
   }else{selected.clear();selected.add(id);}
  }else if(event.ctrlKey||event.metaKey){
   if(selected.has(id))selected.delete(id);else selected.add(id);
  }else{selected.clear();selected.add(id);}
  anchor=id;select([...selected]);
 }
 function build(){
  const buckets=objectTree(getNodes(),getGroups(),lookup);
  const count=sceneObjectCount(getNodes());
  if(!count){
   const placeholder=create('div','scene-manager-empty','No hay modelos colocados. Abre Estructuras para colocar una cueva, montaña u otro modelo.');
   treeRoot.replaceChildren(placeholder);
   hierarchyBody.replaceChildren(create('p','hint','Sin modelos permanentes en esta escena.'));
   return;
  }
  const fragment=document.createDocumentFragment();
  const hierarchy=document.createDocumentFragment();
  for(const bucket of buckets){
   const section=create('section','scene-group');
   section.dataset.sceneGroup=bucket.id;
   const heading=create('div','scene-group-header');
   const expand=create('button','scene-group-toggle');
   expand.type='button';expand.setAttribute('aria-expanded',String(!collapsed[bucket.id]));
   const arrow=create('span','scene-group-chevron',collapsed[bucket.id]?'▸':'▾');
   const symbol=create('span','scene-group-symbol',bucket.icon);
   const name=create('span','scene-group-name',bucket.name);
   const tally=create('span','scene-group-number',String(bucket.objects.length));
   expand.append(arrow,symbol,name,tally);
   expand.addEventListener('click',()=>{
    collapsed[bucket.id]=!collapsed[bucket.id];savedCollapse();render(true);
   });
   const eye=create('button','scene-group-eye',bucket.objects.every(obj=>obj.hidden)?'◌':'◉');
   eye.type='button';
   const allHidden=bucket.objects.every(obj=>obj.hidden);
   eye.title=allHidden?'Mostrar todos los objetos del grupo':'Ocultar todos los objetos del grupo';
   eye.setAttribute('aria-label',eye.title);
   eye.addEventListener('click',()=>setVisibility(bucket.objects.map(obj=>obj.id),allHidden));
   heading.append(expand,eye);section.append(heading);
   if(!collapsed[bucket.id]){
    const list=create('div','scene-group-items');
    for(const obj of bucket.objects){
     const item=create('div','scene-object-item');
     item.dataset.sceneRow=String(obj.id);
     const pick=create('button','scene-object-pick');
     pick.type='button';pick.dataset.objectId=String(obj.id);
     const dot=create('span','scene-object-marker',obj.hidden?'◌':'◇');
     const label=create('span','scene-object-name',obj.label);
     const id=create('span','scene-object-index','#'+obj.id);
     pick.append(dot,label,id);
     pick.title='Seleccionar '+obj.label+' (Ctrl o Shift para selección múltiple)';
     pick.addEventListener('click',event=>handleSelect(obj.id,event,bucket.objects));
     const visible=create('button','scene-object-eye',obj.hidden?'◌':'◉');
     visible.type='button';
     visible.setAttribute('aria-label',(obj.hidden?'Mostrar ':'Ocultar ')+obj.label);
     visible.title=(obj.hidden?'Mostrar ':'Ocultar ')+obj.label;
     visible.dataset.visibilityId=String(obj.id);
     visible.classList.toggle('is-hidden',obj.hidden);
     visible.addEventListener('click',()=>setVisibility([obj.id],obj.hidden));
     item.append(pick,visible);list.append(item);
    }
    section.append(list);
   }
   fragment.append(section);
   const hrow=create('div','scene-hierarchy-group');
   const hname=create('span','',bucket.icon+' '+bucket.name);
   const hnum=create('span','scene-manager-count',String(bucket.objects.length));
   hrow.append(hname,hnum);hierarchy.append(hrow);
  }
  treeRoot.replaceChildren(fragment);hierarchyBody.replaceChildren(hierarchy);
 }
 function render(force=false){
  const state={
   buckets:objectTree(getNodes(),getGroups(),lookup),
   collapsed,terrainVisible:terrainIsVisible(),
  };
  const next=JSON.stringify(state);
  if(force||signature!==next){
   const scroll=treeRoot.closest('.dock-view')?.scrollTop||0;
   build();signature=next;
   if(treeRoot.closest('.dock-view'))treeRoot.closest('.dock-view').scrollTop=scroll;
  }
  syncSelection();
 }
 render(true);
 return {render,refreshSelection:syncSelection,getState:()=>({
  count:sceneObjectCount(getNodes()),
  groups:objectTree(getNodes(),getGroups(),lookup).map(b=>({id:b.id,name:b.name,ids:b.objects.map(o=>o.id)}))
 })};
}
