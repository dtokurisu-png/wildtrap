// WILDTRAP · Fase 2 — clasificación de objetos físicos colocados.
// El gestor excluye los generadores, las marcas de gameplay y la geometría
// procedimental; muestra solo instancias persistentes dibujadas en la escena.
export const SCENE_CATEGORIES=Object.freeze([
 {id:'caves',name:'Cuevas',icon:'◬'},
 {id:'mountains',name:'Montañas',icon:'▲'},
 {id:'cave-pieces',name:'Piezas de cueva',icon:'▧'},
 {id:'models',name:'Modelos colocados',icon:'◈'}
]);
const IGNORE=new Set(['anchor','tree','wallspawn','spawn','exit','path','wall','stairs','gate','wallspawn']);
export function categoryForNode(node){
 if(!node||!Number.isInteger(node.id))return null;
 if(IGNORE.has(node.kind))return null;
 if(node.kind==='cave')return 'caves';
 if(node.kind==='mountain')return 'mountains';
 if(node.kind==='cavePiece')return 'cave-pieces';
 if(node.kind==='prefab'){
  if(['rocky-cave','stone-cave','stylized-cave'].includes(node.prefabId))return 'caves';
  if(node.prefabId==='mountain')return 'mountains';
  return 'models';
 }
 return null;
}
export function sceneObjectName(node,lookup=()=>null){
 const userName=typeof node?.name==='string'?node.name.trim():'';
 if(userName)return userName.slice(0,90);
 let title;
 if(node.kind==='prefab')title=lookup(node.prefabId)?.name||'Modelo 3D';
 else if(node.kind==='cavePiece')title='Pieza de cueva';
 else if(node.kind==='cave')title='Cueva';
 else if(node.kind==='mountain')title='Montaña';
 else title='Modelo';
 return title+' '+node.id;
}
export function cleanObjectGroups(groups){
 const seen=new Set();
 return (Array.isArray(groups)?groups:[]).filter(group=>{
  if(!group||typeof group.id!=='string'||!/^group-[a-zA-Z0-9-]{1,40}$/.test(group.id)||
    typeof group.name!=='string'||!group.name.trim()||seen.has(group.id))return false;
  seen.add(group.id);return true;
 }).map(group=>({id:group.id,name:group.name.trim().slice(0,65)}));
}
export function objectTree(nodes,groups=[],lookup=()=>null){
 const listed=(Array.isArray(nodes)?nodes:[]).filter(node=>categoryForNode(node));
 const allowed=cleanObjectGroups(groups);
 const groupIds=new Set(allowed.map(g=>g.id));
 const buckets=allowed.map(group=>({
  id:'manual:'+group.id,groupId:group.id,name:group.name,manual:true,icon:'▣',objects:[]
 }));
 const byGroup=new Map(buckets.map(x=>[x.groupId,x]));
 const types=SCENE_CATEGORIES.map(category=>({
  id:'type:'+category.id,groupId:null,name:category.name,manual:false,icon:category.icon,objects:[]
 }));
 const byType=new Map(types.map((x,i)=>[SCENE_CATEGORIES[i].id,x]));
 for(const node of listed){
  const info={id:node.id,label:sceneObjectName(node,lookup),
   type:categoryForNode(node),hidden:node.editorHidden===true,intangible:node.editorIntangible===true};
  const custom=groupIds.has(node.groupId)?byGroup.get(node.groupId):null;
  (custom||byType.get(info.type)).objects.push(info);
 }
 return [...buckets.filter(bucket=>bucket.objects.length),...types.filter(bucket=>bucket.objects.length)];
}
export function sceneObjectCount(nodes){
 return (Array.isArray(nodes)?nodes:[]).filter(node=>categoryForNode(node)).length;
}
