import * as THREE from 'three';
import {createCliffRegions} from './editor-cliffs.mjs?v=0.9.24';

// Zonas lógicas: no perforan ni modifican la geometría de terreno.
export function createZoneEditor({scene,terrainGeo,view,camera,live,heightAt,snapshot,persist,toast,isActive,isBlocked,onChange=()=>{}}){
 const $=id=>document.getElementById(id);
 const commit=()=>{persist();onChange();};
 const layer=new THREE.Group();layer.name='EditorZoneBoundaries';scene.add(layer);
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
 let pending=[],hover=null,selected=null,dragging=null,editVertices=false;
 const cliffTool=createCliffRegions({scene,terrainGeo,view,camera,live,heightAt,snapshot,persist:commit,toast,
   getZone:()=>items().find(z=>z.id===selected),isActive,isBlocked});
 const max=315;
 const norm=p=>({x:Math.max(-max,Math.min(max,Number(p.x)||0)),z:Math.max(-max,Math.min(max,Number(p.z)||0))});
 const items=()=>{if(!Array.isArray(live.zones))live.zones=[];return live.zones};
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const onSegment=(a,b,p)=>Math.min(a.x,b.x)-1e-6<=p.x&&p.x<=Math.max(a.x,b.x)+1e-6&&Math.min(a.z,b.z)-1e-6<=p.z&&p.z<=Math.max(a.z,b.z)+1e-6;
 function intersects(a,b,c,d){
  const s1=cross(a,b,c),s2=cross(a,b,d),s3=cross(c,d,a),s4=cross(c,d,b);
  return (s1*s2<0&&s3*s4<0)||(Math.abs(s1)<1e-7&&onSegment(a,b,c))||(Math.abs(s2)<1e-7&&onSegment(a,b,d))||(Math.abs(s3)<1e-7&&onSegment(c,d,a))||(Math.abs(s4)<1e-7&&onSegment(c,d,b));
 }
 function valid(points){
  if(points.length<3)return false;
  let area=0;
  for(let i=0;i<points.length;i++){let a=points[i],b=points[(i+1)%points.length];area+=a.x*b.z-b.x*a.z;if(Math.hypot(a.x-b.x,a.z-b.z)<.25)return false;}
  if(Math.abs(area)<1)return false;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
   if(j===i+1||(i===0&&j===points.length-1))continue;
   if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return false;
  }
  return true;
 }
 function y(p){return heightAt(p.x,p.z)+1.4;}
 function line(points,color,closed=false){
  if(points.length<2)return;
  const vertices=points.map(p=>new THREE.Vector3(p.x,y(p),p.z));
  if(closed)vertices.push(vertices[0].clone());
  const geometry=new THREE.BufferGeometry().setFromPoints(vertices);
  const obj=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));
  obj.renderOrder=60;layer.add(obj);
 }
 function dot(p,color,r=1.7){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),new THREE.MeshBasicMaterial({color,depthTest:false}));
  mesh.position.set(p.x,y(p)+.25,p.z);mesh.renderOrder=61;layer.add(mesh);
 }
 function clearLayer(){
  while(layer.children.length){let o=layer.children[0];layer.remove(o);o.geometry?.dispose();o.material?.dispose();}
 }
 function refresh(){
  clearLayer();
  const visible=isActive();
  layer.visible=visible;
  if(!visible)return;
  cliffTool?.refresh();
  items().forEach((zone,i)=>{
   if(zone.hidden)return;
   const pts=(zone.points||[]).map(norm);
   const active=zone.id===selected;
   if(pts.length>=3&&valid(pts)){
    const shape=pts.map(p=>new THREE.Vector2(p.x,p.z));
    const tris=THREE.ShapeUtils.triangulateShape(shape,[]);
    const verts=[];
    for(const tri of tris)for(const index of tri){const p=pts[index];verts.push(p.x,heightAt(p.x,p.z)+.8,p.z);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:active?0x00ffdf:0x4dbad0,side:THREE.DoubleSide,transparent:true,opacity:active?.22:.11,depthWrite:false,depthTest:false}));
    mesh.renderOrder=55;layer.add(mesh);
   }
   line(pts,active?0x00ffdf:0x78b9d3,true);
   if(active)pts.forEach(p=>dot(p,0xffffff,2));
  });
  line(pending,0xffd57c);
  pending.forEach((p,i)=>dot(p,i===0?0x00ffdf:0xffd57c));
  if(hover&&pending.length)line([pending[pending.length-1],hover],0xffd57c);
 }
 function renderPanel(){
  const list=$('zoneList');list.replaceChildren();
  for(const zone of items()){
   const row=document.createElement('div');row.className='zone-entry';row.style.cssText='display:flex;gap:5px;align-items:center;margin:5px 0';
   const select=document.createElement('button');select.textContent=zone.name||'Zona';select.style.flex='1';select.classList.toggle('active',zone.id===selected);
   select.onclick=()=>{selected=zone.id;pending=[];hover=null;editVertices=false;cliffTool.onZoneChange();renderPanel();refresh();};
   const eye=document.createElement('button');eye.textContent=zone.hidden?'◌':'◉';eye.title=zone.hidden?'Mostrar':'Ocultar';
   eye.onclick=()=>{snapshot();zone.hidden=!zone.hidden;commit();renderPanel();refresh()};
   row.append(select,eye);list.append(row);
  }
  const zone=items().find(z=>z.id===selected);
  $('zoneProperties').hidden=!zone;
  if(zone){$('zoneName').value=zone.name||'';$('zonePointCount').textContent=zone.points.length+' vértices';$('zoneBiome').value=zone.biomeId||'';}
  $('zonePendingCount').textContent=pending.length?pending.length+' puntos pendientes · pulsa el primero para cerrar':'Haz clic en el terreno para comenzar';
  $('zoneClose').disabled=pending.length<3;
  $('zoneUndoPoint').disabled=!pending.length;
  $('zoneEditVertices').disabled=!zone;
  $('zoneEditVertices').classList.toggle('active',editVertices);
  $('zoneEditVertices').textContent=editVertices?'✓ Editando vértices':'Editar vértices';
 }
 function refreshAll(){renderPanel();refresh();}
 function pointerPoint(e){
  const rect=view.getBoundingClientRect();
  mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(mouse,camera);
  const pt=ray.ray.at(0,new THREE.Vector3());
  const t=ray.ray.direction.y===0?NaN:(-ray.ray.origin.y)/ray.ray.direction.y;
  if(!Number.isFinite(t)||t<0)return null;
  ray.ray.at(t,pt);
  // Resolve the ray against the live height field by iteration (sloping terrain).
  for(let i=0;i<8;i++){
   const h=heightAt(pt.x,pt.z),den=ray.ray.direction.y;
   const next=(h-ray.ray.origin.y)/den;
   if(!Number.isFinite(next)||next<0)return null;
   ray.ray.at(next,pt);
  }
  if(Math.abs(pt.x)>max||Math.abs(pt.z)>max)return null;
  return norm(pt);
 }
 function screenDistance(p,e){
  const q=new THREE.Vector3(p.x,y(p),p.z).project(camera),r=view.getBoundingClientRect();
  return Math.hypot((q.x+1)*r.width/2-(e.clientX-r.left),(1-q.y)*r.height/2-(e.clientY-r.top));
 }
 function close(){
  if(!valid(pending)){toast('Zona inválida: revisa cruces, vértices repetidos o superficie demasiado pequeña');return;}
  snapshot();
  const ids=new Set(items().map(z=>z.id));let i=1;while(ids.has('zone-'+i))i++;
  const zone={id:'zone-'+i,name:'Zona '+String(i).padStart(2,'0'),points:pending.map(norm),hidden:false,cliffs:[]};
  items().push(zone);selected=zone.id;pending=[];hover=null;editVertices=false;cliffTool.onZoneChange();
  commit();refreshAll();toast(zone.name+' creada y guardada');
 }
 function cancel(){pending=[];hover=null;dragging=null;cliffTool.cancel();refreshAll();}
 function down(e){
  if(!isActive()||isBlocked()||e.button!==0||e.ctrlKey||e.altKey)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(cliffTool.down(e))return;
  if(editVertices&&selected){
   const z=items().find(z=>z.id===selected);
   const index=z?.points.findIndex(p=>screenDistance(p,e)<15)??-1;
   if(index>=0){snapshot();dragging={id:selected,index,pointer:e.pointerId,original:z.points.map(norm)};try{view.setPointerCapture(e.pointerId)}catch(_){}return;}
   return; // Editing a zone cannot accidentally begin another polygon.
  }
  const p=pointerPoint(e);if(!p)return;
  if(pending.length>=3&&screenDistance(pending[0],e)<16){close();return;}
  if(pending.length>=2&&Math.hypot(p.x-pending.at(-1).x,p.z-pending.at(-1).z)<.3)return;
  pending.push(p);hover=null;refreshAll();
 }
 function move(e){
  if(!isActive()||isBlocked())return;
  e.stopImmediatePropagation();
  if(cliffTool.move(e))return;
  const p=pointerPoint(e);
  if(dragging&&dragging.pointer===e.pointerId){
   if(!p)return;
   const zone=items().find(z=>z.id===dragging.id);
   if(zone){zone.points[dragging.index]=p;refresh();}
   return;
  }
  hover=p;refresh();
 }
 function up(e){
  if(!dragging||dragging.pointer!==e.pointerId)return;
  e.stopImmediatePropagation();
  const zone=items().find(z=>z.id===dragging.id);
  if(zone&&!valid(zone.points)){zone.points=dragging.original;toast('Movimiento inválido: se restauran los vértices anteriores');}
  commit();dragging=null;refreshAll();
 }
 view.addEventListener('pointerdown',down,true);
 view.addEventListener('pointermove',move,true);
 window.addEventListener('pointerup',up,true);
 $('zoneClose').onclick=close;
 $('zoneUndoPoint').onclick=()=>{pending.pop();hover=null;refreshAll()};
 $('zoneCancel').onclick=cancel;
 $('zoneName').onchange=e=>{const z=items().find(z=>z.id===selected);if(!z)return;snapshot();z.name=e.target.value.trim()||z.name;commit();refreshAll()};
 $('zoneDelete').onclick=()=>{if(!selected)return;const z=items().find(z=>z.id===selected);if(!z||!confirm('¿Eliminar '+z.name+'?'))return;snapshot();live.zones=items().filter(x=>x.id!==selected);selected=null;editVertices=false;cliffTool.onZoneChange();commit();refreshAll()};
 $('zoneEditVertices').onclick=()=>{editVertices=!editVertices;pending=[];hover=null;cliffTool.cancel();refreshAll();};
 $('zoneBiome').onchange=e=>{const zone=items().find(z=>z.id===selected);if(!zone)return;snapshot();zone.biomeId=e.target.value||null;commit();refreshAll();};
 refreshAll();
 return {refresh,refreshAll,cancel,undoPoint:()=>{if(cliffTool.isDrawing())cliffTool.undo();else{pending.pop();hover=null;refreshAll()}},hasPending:()=>pending.length>0||cliffTool.isDrawing(),onModeChange:()=>{pending=[];hover=null;dragging=null;editVertices=false;cliffTool.cancel();refreshAll();}};
}