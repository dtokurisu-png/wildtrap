import * as THREE from 'three';

const AREA_TYPES=[
 ['trees','Árboles'],['grass','Hierbas y monte'],['plants','Plantas'],['rocks','Rocas'],
 ['objects','Objetos'],['river','Río'],['swamp','Pantano'],['lake','Lago'],
 ['oasis','Oasis'],['dune','Duna'],['mountain','Montaña']
];
const SPECIAL=new Set(['river','swamp','lake','oasis','dune','mountain']);
const BIOMES=[['any','Todos los biomas'],['forest','Bosque'],['plains','Llanura'],['desert','Desierto'],['swamp','Pantano'],['mountain','Montañoso']];
const $=id=>document.getElementById(id);
const norm=p=>({x:Math.max(-315,Math.min(315,p.x)),z:Math.max(-315,Math.min(315,p.z))});
function valid(points){
 if(points.length<3)return false;
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.z-b.x*a.z;if(Math.hypot(a.x-b.x,a.z-b.z)<.3)return false}
 if(Math.abs(area)<1)return false;
 function cross(a,b,c){return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)}
 function between(a,b,c){return Math.min(a.x,b.x)-1e-6<=c.x&&c.x<=Math.max(a.x,b.x)+1e-6&&Math.min(a.z,b.z)-1e-6<=c.z&&c.z<=Math.max(a.z,b.z)+1e-6}
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  if(j===i+1||(i===0&&j===points.length-1))continue;
  const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
  const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
  if((x*y<0&&z*w<0)||(!x&&between(a,b,c))||(!y&&between(a,b,d))||(!z&&between(c,d,a))||(!w&&between(c,d,b)))return false;
 }
 return true;
}
function contains(poly,p){
 let odd=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)odd=!odd;
 }return odd;
}
export function createSpawnAreasEditor({scene,terrain,view,camera,live,heightAt,snapshot,persist,toast,isActive,onPointChanged=()=>{}}){
 const layer=new THREE.Group();layer.name='SpawnAreaEditorOverlay';layer.userData.editorOnly=true;scene.add(layer);
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),mark=new THREE.Vector3();
 let pending=[],selected=null,hover=null,pressed=null,mode='area';
 const list=$('spawnAreaList'),pointList=$('spawnPointList');
 const typeInput=$('spawnAreaType'),biomeInput=$('spawnAreaBiome'),densityInput=$('spawnAreaDensity');
 const pointType=$('spawnPointType'),npcInput=$('spawnNpcType');
 const items=()=>Array.isArray(live.spawnAreas)?live.spawnAreas:(live.spawnAreas=[]);
 const characters=()=>live.nodes.filter(n=>n.kind==='playerSpawn'||n.kind==='characterSpawn');
 const points=()=>live.nodes.filter(n=>n.kind==='playerSpawn').sort((a,b)=>a.id-b.id);
 const label=(id)=>AREA_TYPES.find(x=>x[0]===id)?.[1]||id;
 const selectedArea=()=>items().find(a=>a.id===selected);
 const selectedPoint=()=>characters().find(n=>n.id===selected);
 function make(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el}
 function clearVisual(){for(const obj of layer.children.slice()){layer.remove(obj);obj.geometry?.dispose();obj.material?.dispose()}}
 function line(vertices,color,closed=false){
  if(vertices.length<2)return;
  const v=vertices.map(p=>new THREE.Vector3(p.x,heightAt(p.x,p.z)+1.5,p.z));
  if(closed)v.push(v[0].clone());
  const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(v),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));
  o.renderOrder=78;o.raycast=()=>{};layer.add(o);
 }
 function dot(p,color,r=2){
  const o=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),new THREE.MeshBasicMaterial({color,depthTest:false}));
  o.position.set(p.x,heightAt(p.x,p.z)+2,p.z);o.renderOrder=79;o.raycast=()=>{};layer.add(o);
 }
 function refreshVisual(){
  clearVisual();layer.visible=isActive();
  if(!isActive())return;
  for(const area of items()){
   if(area.hidden||!Array.isArray(area.points)||!valid(area.points))continue;
   const active=selected===area.id;
   const tint=active?0x00ffdf:SPECIAL.has(area.type)?0xffbc6e:0x64cc89;
   const tris=THREE.ShapeUtils.triangulateShape(area.points.map(p=>new THREE.Vector2(p.x,p.z)),[]);
   const vertices=[];
   for(const tri of tris)for(const i of tri){const p=area.points[i];vertices.push(p.x,heightAt(p.x,p.z)+.75,p.z)}
   const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:tint,side:THREE.DoubleSide,transparent:true,opacity:active?.24:.12,depthWrite:false,depthTest:false}));
   mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
   mesh.renderOrder=75;mesh.raycast=()=>{};layer.add(mesh);
   line(area.points,tint,true);
   if(active)for(const p of area.points)dot(p,0xffffff,1.3);
  }
  for(const n of characters()){
   dot({x:n.x,z:n.z},selected===n.id?0x00ffdf:n.kind==='playerSpawn'?0x69b8ff:0xeb99d0,2.8);
  }
  line(pending,0xffd277);for(let i=0;i<pending.length;i++)dot(pending[i],i===0?0x00ffdf:0xffd277,1.9);
  if(hover&&pending.length)line([pending.at(-1),hover],0xffd277);
 }
 function syncPlayerSlots(){
  const sorted=points();for(let i=0;i<sorted.length;i++)sorted[i].playerSlot=i+1;
  onPointChanged();
 }
 function refreshPanel(){
  list.replaceChildren();
  for(const area of items()){
   const row=make('div');row.style.cssText='display:flex;gap:5px;margin:5px 0';
   const b=make('button',(area.name||'Área')+' · '+label(area.type));
   b.style.flex='1';b.classList.toggle('active',selected===area.id);
   b.onclick=()=>{selected=area.id;pending=[];mode='area';refresh()};
   const eye=make('button',area.hidden?'◌':'◉');eye.title=area.hidden?'Mostrar área':'Ocultar área';
   eye.onclick=()=>{snapshot();area.hidden=!area.hidden;persist();refresh()};
   row.append(b,eye);list.append(row);
  }
  pointList.replaceChildren();
  for(const n of characters().sort((a,b)=>a.id-b.id)){
   const name=n.kind==='playerSpawn'?'Jugador '+(n.playerSlot||1):'NPC'+(n.npcId?' · '+n.npcId:'');
   const b=make('button',name);b.style.width='100%';b.style.margin='3px 0';b.classList.toggle('active',selected===n.id);
   b.onclick=()=>{selected=n.id;pending=[];mode='point';refresh()};pointList.append(b);
  }
  const area=selectedArea(),point=selectedPoint();
  $('spawnAreaProperties').hidden=!area;$('spawnPointProperties').hidden=!point;
  if(area){
   $('spawnAreaName').value=area.name||'';
   typeInput.value=area.type||'trees';
   biomeInput.value=area.biome||'any';
   densityInput.value=area.density??40;
   $('spawnAreaDensityValue').textContent=densityInput.value+'%';
  }
  if(point){
   pointType.value=point.kind==='playerSpawn'?'player':'npc';
   $('spawnNpcPicker').hidden=point.kind==='playerSpawn';
   // No NPC registry exists yet; leave the picker empty without fictitious characters.
   npcInput.replaceChildren();
   const opt=make('option','No hay NPC registrados');opt.value='';npcInput.append(opt);npcInput.disabled=true;
  }
  $('spawnDrawingStatus').textContent=pending.length?pending.length+' puntos · pulsa el primero para cerrar':items().length+' áreas · '+characters().length+' personajes';
 }
 function refresh(){refreshPanel();refreshVisual()}
 function pick(e){
  const rect=view.getBoundingClientRect();
  mouse.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
  ray.setFromCamera(mouse,camera);
  const hit=ray.intersectObject(terrain,false)[0];
  return hit?norm(hit.point):null;
 }
 function screenDistance(p,e){
  mark.set(p.x,heightAt(p.x,p.z)+1.6,p.z).project(camera);
  const rect=view.getBoundingClientRect();
  return Math.hypot(rect.left+(mark.x+1)*rect.width/2-e.clientX,rect.top+(1-mark.y)*rect.height/2-e.clientY);
 }
 function click(e){
  const p=pick(e);if(!p)return;
  if(mode==='point'){
   const nearest=characters().map(n=>({n,d:screenDistance(n,e)})).sort((a,b)=>a.d-b.d)[0];
   if(nearest&&nearest.d<16){selected=nearest.n.id;refresh();return}
   snapshot();
   const playerCount=points().length;
   if(playerCount>=6){toast('Ya hay seis spawns de jugador; cambia alguno a NPC o elimina uno');return}
   const node={id:live.nextId++,kind:'playerSpawn',playerSlot:playerCount+1,x:p.x,z:p.z};
   live.nodes.push(node);selected=node.id;syncPlayerSlots();persist();refresh();return;
  }
  if(pending.length>=3&&screenDistance(pending[0],e)<17){
   if(!valid(pending)){toast('El contorno tiene cruces o es demasiado pequeño');return}
   snapshot();
   const id='spawn-area-'+live.nextId++;
   const area={id,name:'Área '+(items().length+1),type:'trees',biome:'any',density:40,hidden:false,points:pending.slice()};
   items().push(area);selected=id;pending=[];persist();refresh();return;
  }
  if(!pending.length){
   // Select existing area by clicking inside its footprint; clicking on empty
   // terrain starts a new polygon.
   for(const a of items().slice().reverse())if(!a.hidden&&contains(a.points||[],p)){
    selected=a.id;refresh();return;
   }
   selected=null;
  }
  if(pending.length&&Math.hypot(p.x-pending.at(-1).x,p.z-pending.at(-1).z)<.3)return;
  pending.push(p);refresh();
 }
 function down(e){
  if(!isActive()||e.button!==0||e.ctrlKey||e.altKey)return;
  pressed={x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false};
 }
 function move(e){
  if(!isActive())return;
  if(pressed&&pressed.pointer===e.pointerId&&Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y)>5)pressed.moved=true;
  if(mode==='area'&&pending.length){hover=pick(e);refreshVisual()}
 }
 function up(e){
  if(!pressed||pressed.pointer!==e.pointerId)return;
  const was=pressed;pressed=null;
  if(!isActive()||was.moved||Math.hypot(e.clientX-was.x,e.clientY-was.y)>5)return;
  click(e);
 }
 view.addEventListener('pointerdown',down,true);
 view.addEventListener('pointermove',move,true);
 window.addEventListener('pointerup',up,true);
 window.addEventListener('pointercancel',()=>{pressed=null},true);
 $('spawnCreateArea').onclick=()=>{pending=[];selected=null;mode='area';refresh();toast('Marca el contorno y pulsa el primer punto para cerrarlo')};
 $('spawnCreatePoint').onclick=()=>{pending=[];selected=null;mode='point';refresh();toast('Haz clic para colocar o seleccionar un spawn de personaje')};
 $('spawnCancelArea').onclick=()=>{pending=[];hover=null;refresh()};
 $('spawnDeleteSelected').onclick=()=>{
  if(selected===null)return;
  snapshot();live.spawnAreas=items().filter(a=>a.id!==selected);
  live.nodes=live.nodes.filter(n=>n.id!==selected);selected=null;pending=[];syncPlayerSlots();persist();refresh();
 };
 $('spawnAreaName').onchange=e=>{const a=selectedArea();if(!a)return;snapshot();a.name=e.target.value.trim().slice(0,80)||a.name;persist();refresh()};
 for(const [input,key] of [[typeInput,'type'],[biomeInput,'biome'],[densityInput,'density']]){
  input.onchange=()=>{const a=selectedArea();if(!a)return;snapshot();a[key]=key==='density'?Number(input.value):input.value;persist();refresh()};
 }
 densityInput.oninput=()=>{$('spawnAreaDensityValue').textContent=densityInput.value+'%'};
 pointType.onchange=()=>{
  const n=selectedPoint();if(!n)return;
  if(pointType.value==='player'&&n.kind!=='playerSpawn'&&points().length>=6){toast('Máximo seis jugadores');refresh();return}
  snapshot();
  n.kind=pointType.value==='player'?'playerSpawn':'characterSpawn';
  if(n.kind==='characterSpawn'){delete n.playerSlot;n.npcId=n.npcId||''}else delete n.npcId;
  syncPlayerSlots();persist();refresh();
 };
 function setVisible(){if(!isActive()){pending=[];hover=null;pressed=null}refresh()}
 refresh();
 return {refresh,setVisible};
}
