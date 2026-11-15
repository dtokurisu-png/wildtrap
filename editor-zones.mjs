import * as THREE from 'three';

// Zonas lógicas: no perforan ni modifican la geometría de terreno.
export function createZoneEditor({scene,terrainGeo,view,camera,live,heightAt,snapshot,persist,toast,isActive,isBlocked,onChange=()=>{},nextHistorySerial=()=>Date.now(),onPendingHistoryChange=()=>{},onPendingEdit=()=>{}}){
 const $=id=>document.getElementById(id);
 const commit=()=>{persist();onChange();};
 const layer=new THREE.Group();layer.name='EditorZoneBoundaries';scene.add(layer);
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
 // Raycast against the actual terrain triangles at the height of the white
 // marker center, so its projected screen position stays under the mouse.
 // Do not add this picking-only mesh to the scene.
 const markerLift=1.65;
 const pickingSurface=new THREE.Mesh(terrainGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 pickingSurface.position.y=markerLift;
 pickingSurface.updateMatrixWorld(true);
 let pending=[],hover=null,selected=null,dragging=null,editVertices=false,addingVertex=false,clickCandidate=null;
 const pendingRedo=[];
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
   line(pts,zone.isCliff?0xffb46d:active?0x00ffdf:0x78b9d3,true);
   if(active)pts.forEach(p=>dot(p,0xffffff,2));
  });
  line(pending,0xffd57c);
  pending.forEach((p,i)=>dot(p,i===0?0x00ffdf:0xffd57c));
  if(hover&&pending.length)line([pending[pending.length-1],hover],0xffd57c);
 }
 function renderPanel(){
  const list=$('zoneList');list.replaceChildren();
  for(const zone of items()){
   const row=document.createElement('div');row.className='zone-entry';
   row.style.cssText='display:flex;gap:5px;align-items:center;margin:5px 0';
   const select=document.createElement('button');
   select.textContent=zone.name||'Zona';select.title=zone.name||'Zona';select.style.flex='1';
   select.classList.toggle('active',zone.id===selected);
   select.onclick=()=>{
    selected=zone.id;pending=[];pendingRedo.length=0;hover=null;editVertices=false;
    addingVertex=false;renderPanel();refresh();onPendingHistoryChange();
   };
   const cliff=document.createElement('button');
   cliff.textContent=zone.isCliff?'⛰ ✓':'⛰';
   cliff.title=zone.isCliff?'Acantilado asociado · pulsar para desmarcar':'Marcar como acantilado y elegir región principal';
   cliff.setAttribute('aria-label',cliff.title);
   cliff.classList.toggle('active',zone.isCliff===true);
   cliff.onclick=()=>toggleCliff(zone.id);
   const eye=document.createElement('button');eye.textContent=zone.hidden?'◌':'◉';eye.title=zone.hidden?'Mostrar':'Ocultar';
   eye.onclick=()=>{snapshot();zone.hidden=!zone.hidden;commit();renderPanel();refresh()};
   row.append(select,cliff,eye);list.append(row);
  }
  const zone=items().find(z=>z.id===selected);
  $('zoneProperties').hidden=!zone;
  $('zoneDelete').disabled=!zone;
  if(zone){
   $('zoneName').value=zone.name||'';
   $('zonePointCount').textContent=zone.points.length+' vértices';
   const parent=items().find(z=>z.id===zone.cliffParentId);
   const biome=zone.isCliff?(parent?.biomeId||null):(zone.biomeId||null);
   const titles={mountain:'Montaña',desert:'Desierto',plains:'Llanura',swamp:'Pantano',forest:'Bosque'};
   $('zoneTypeHint').textContent=zone.isCliff?
    '⛰ Acantilado · Región: '+(parent?.name||'Sin asociación')+' · Bioma heredado: '+(titles[biome]||'pendiente'):
    'Región principal · Bioma procedural: '+(titles[biome]||'pendiente')+' · Nombre independiente del bioma';
  }
  $('zonePendingCount').textContent=pending.length?pending.length+' puntos pendientes · pulsa el primero para cerrar':'Haz clic en el terreno para comenzar';
  $('zoneEditVertices').disabled=!zone;
  $('zoneEditVertices').classList.toggle('active',editVertices);
  $('zoneEditVertices').textContent=editVertices?'✓ Terminar edición':'Editar zona';
  const add=$('zoneAddVertex');
  add.disabled=!zone||!editVertices;
  add.classList.toggle('active',addingVertex&&editVertices);
  add.textContent=addingVertex&&editVertices?'✓ Añadiendo puntos':'Añadir vértice';
 }
 function toggleCliff(id){
  const zone=items().find(z=>z.id===id);
  if(!zone)return;
  if(zone.isCliff){
   snapshot();zone.isCliff=false;zone.cliffParentId=null;
   commit();refreshAll();return;
  }
  const candidates=items().filter(z=>z.id!==id&&!z.isCliff);
  if(!candidates.length){toast('Crea otra región principal para asociarle este acantilado');return;}
  const dialog=$('zoneCliffDialog'),select=$('zoneCliffParent');
  select.replaceChildren(...candidates.map(z=>{
   const option=document.createElement('option');option.value=z.id;option.textContent=z.name||z.id;return option;
  }));
  dialog.dataset.zoneId=id;
  if(!dialog.open)dialog.showModal();
 }
 const dialog=$('zoneCliffDialog');
 dialog.addEventListener('close',()=>{
  if(dialog.returnValue!=='confirm')return;
  const zone=items().find(z=>z.id===dialog.dataset.zoneId);
  const parent=items().find(z=>z.id===$('zoneCliffParent').value&&!z.isCliff);
  if(!zone||!parent||zone.id===parent.id)return;
  snapshot();zone.isCliff=true;zone.cliffParentId=parent.id;
  commit();refreshAll();
 });
 function refreshAll(){renderPanel();refresh();}
 function pointerPoint(e){
  const rect=view.getBoundingClientRect();
  mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  camera.updateMatrixWorld(true);
  ray.setFromCamera(mouse,camera);
  // Intersection is calculated from the very same geometry used to display
  // the terrain; old iteration on the height function could overshoot badly
  // around steep slopes and at oblique camera angles.
  pickingSurface.updateMatrixWorld(true);
  const hit=ray.intersectObject(pickingSurface,false)[0];
  if(!hit)return null;
  if(Math.abs(hit.point.x)>max||Math.abs(hit.point.z)>max)return null;
  return norm(hit.point);
 }
 function closestZoneEdge(zone,e){
  if(!zone?.points?.length)return null;
  const rect=view.getBoundingClientRect();
  const pointerX=e.clientX-rect.left,pointerY=e.clientY-rect.top;
  let best=null;
  for(let i=0;i<zone.points.length;i++){
   const p=zone.points[i],q=zone.points[(i+1)%zone.points.length];
   const projectedA=new THREE.Vector3(p.x,y(p)+.25,p.z).project(camera);
   const projectedB=new THREE.Vector3(q.x,y(q)+.25,q.z).project(camera);
   if(projectedA.z< -1||projectedA.z>1||projectedB.z< -1||projectedB.z>1)continue;
   const ax=(projectedA.x+1)*rect.width/2,ay=(1-projectedA.y)*rect.height/2;
   const bx=(projectedB.x+1)*rect.width/2,by=(1-projectedB.y)*rect.height/2;
   const length2=(bx-ax)**2+(by-ay)**2;
   if(length2<1e-6)continue;
   const t=Math.max(0,Math.min(1,((pointerX-ax)*(bx-ax)+(pointerY-ay)*(by-ay))/length2));
   const distance=Math.hypot(pointerX-ax-t*(bx-ax),pointerY-ay-t*(by-ay));
   if(!best||distance<best.distance)best={index:i,distance};
  }
  return best;
 }
 function insertZonePoint(e){
  const zone=items().find(z=>z.id===selected);
  if(!editVertices||!zone||zone.hidden)return false;
  const edge=closestZoneEdge(zone,e);
  // Ordinary clicks only insert on a visible boundary. In explicit Add
  // mode, users can click anywhere on the terrain: the nearest boundary
  // segment is split, preserving the polygon's vertex ordering.
  if(!edge||(!addingVertex&&edge.distance>18))return false;
  const p=pointerPoint(e);
  if(!p){toast('El punto debe quedar sobre el terreno');return false}
  const candidate=zone.points.map(norm);
  candidate.splice(edge.index+1,0,p);
  if(!valid(candidate)){
   toast('No se puede añadir ahí: el contorno se cruzaría o tendría puntos demasiado próximos');
   return false;
  }
  snapshot();zone.points=candidate;
  commit();refreshAll();
  toast('Vértice añadido · '+zone.points.length+' puntos en la zona');
  return true;
 }
 function screenDistance(p,e){
  const q=new THREE.Vector3(p.x,y(p)+.25,p.z).project(camera),r=view.getBoundingClientRect();
  return Math.hypot((q.x+1)*r.width/2-(e.clientX-r.left),(1-q.y)*r.height/2-(e.clientY-r.top));
 }
 function close(){
  if(!valid(pending)){toast('Zona inválida: revisa cruces, vértices repetidos o superficie demasiado pequeña');return;}
  snapshot();
  const ids=new Set(items().map(z=>z.id));let i=1;while(ids.has('zone-'+i))i++;
  const zone={id:'zone-'+i,name:'Zona '+String(i).padStart(2,'0'),points:pending.map(norm),hidden:false,cliffs:[]};
  items().push(zone);selected=zone.id;pending=[];pendingRedo.length=0;onPendingHistoryChange();hover=null;editVertices=false;addingVertex=false;
  commit();refreshAll();toast(zone.name+' creada y guardada');
 }
 function cancel(){pending=[];pendingRedo.length=0;onPendingHistoryChange();hover=null;dragging=null;clickCandidate=null;refreshAll();}
 function placePoint(e){
  if(editVertices&&selected){insertZonePoint(e);return;}
  const p=pointerPoint(e);if(!p)return;
  if(pending.length>=3&&screenDistance(pending[0],e)<16){close();return}
  if(pending.length>=2&&Math.hypot(p.x-pending.at(-1).x,p.z-pending.at(-1).z)<.3)return;
  pendingRedo.length=0;onPendingEdit();pending.push(p);hover=null;refreshAll();onPendingHistoryChange();
 }
 function down(e){
  if(!isActive()||isBlocked()||e.button!==0||e.ctrlKey||e.altKey)return;
  if(editVertices&&selected&&!addingVertex){
   const z=items().find(z=>z.id===selected);
   const index=z?.points.findIndex(p=>screenDistance(p,e)<15)??-1;
   if(index>=0){
    // Only direct vertex editing takes exclusive control of the pointer.
    e.preventDefault();e.stopImmediatePropagation();
    snapshot();dragging={id:selected,index,pointer:e.pointerId,original:z.points.map(norm)};
    try{view.setPointerCapture(e.pointerId)}catch(_){}
    return;
   }
  }
  // OrbitControls receives the same pointerdown. A short stationary click
  // places a point on release; a drag rotates the camera without painting.
  clickCandidate={pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
 }
 function move(e){
  if(!isActive()||isBlocked())return;
  if(dragging&&dragging.pointer===e.pointerId){
   e.preventDefault();e.stopImmediatePropagation();
   const p=pointerPoint(e);
   if(!p)return;
   const zone=items().find(z=>z.id===dragging.id);
   if(zone){zone.points[dragging.index]=p;refresh()}
   return;
  }
  if(clickCandidate&&clickCandidate.pointer===e.pointerId&&
   Math.hypot(e.clientX-clickCandidate.x,e.clientY-clickCandidate.y)>5)
   clickCandidate.moved=true;
  // The camera's rotate/pan/zoom listeners must receive all ordinary moves.
  hover=pointerPoint(e);refresh();
 }
 function up(e){
  if(dragging&&dragging.pointer===e.pointerId){
   e.stopImmediatePropagation();
   const zone=items().find(z=>z.id===dragging.id);
   if(zone&&!valid(zone.points)){zone.points=dragging.original;toast('Movimiento inválido: se restauran los vértices anteriores')}
   commit();dragging=null;refreshAll();
   try{if(view.hasPointerCapture(e.pointerId))view.releasePointerCapture(e.pointerId)}catch(_){}
   return;
  }
  if(!clickCandidate||clickCandidate.pointer!==e.pointerId)return;
  const candidate=clickCandidate;clickCandidate=null;
  if(!isActive()||isBlocked()||candidate.moved||Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)>5)return;
  placePoint(e);
 }
 function cancelPointer(e){
  if(clickCandidate?.pointer===e.pointerId)clickCandidate=null;
  if(dragging?.pointer===e.pointerId){
   const zone=items().find(z=>z.id===dragging.id);
   if(zone)zone.points=dragging.original;
   dragging=null;refreshAll();
  }
 }
 view.addEventListener('pointerdown',down,true);
 view.addEventListener('pointermove',move,true);
 window.addEventListener('pointerup',up,true);
 window.addEventListener('pointercancel',cancelPointer,true);
 function undoPending(){
  if(!pending.length)return false;
  const point=pending.pop();
  pendingRedo.push({point,order:nextHistorySerial()});
  hover=null;refreshAll();onPendingHistoryChange();return true;
 }
 function redoPending(){
  if(!pendingRedo.length)return false;
  const item=pendingRedo.pop();
  pending.push(item.point);hover=null;refreshAll();onPendingHistoryChange();return true;
 }
 $('zoneCancel').onclick=cancel;
 $('zoneName').onchange=e=>{const z=items().find(z=>z.id===selected);if(!z)return;snapshot();z.name=e.target.value.trim()||z.name;commit();refreshAll()};
 $('zoneDelete').onclick=()=>{
  if(!selected)return;
  const z=items().find(x=>x.id===selected);
  if(!z||!confirm('¿Eliminar '+z.name+'?'))return;
  snapshot();
  live.zones=items().filter(x=>x.id!==selected);
  // Dependents are retained but become unmarked, never silently deleted.
  for(const dep of live.zones)if(dep.cliffParentId===selected){dep.isCliff=false;dep.cliffParentId=null;}
  selected=null;editVertices=false;addingVertex=false;commit();refreshAll();
 };
 $('zoneEditVertices').onclick=()=>{
  if(!items().some(z=>z.id===selected))return;
  editVertices=!editVertices;addingVertex=false;
  pending=[];pendingRedo.length=0;clickCandidate=null;
  onPendingHistoryChange();hover=null;
  refreshAll();
  toast(editVertices?'Editar zona: arrastra puntos blancos; haz clic en una arista para añadir un punto. También puedes activar Añadir vértice.':'Edición de zona finalizada');
 };
 $('zoneAddVertex').onclick=()=>{
  if(!editVertices||!items().some(z=>z.id===selected))return;
  addingVertex=!addingVertex;clickCandidate=null;
  refreshAll();
  toast(addingVertex?'Añadir vértice: haz clic en el terreno; se insertará en la arista más cercana. Arrastra para girar la cámara.':'Inserción finalizada');
 };
 refreshAll();
 return {refresh,refreshAll,cancel,undoPoint:undoPending,redoPoint:redoPending,
  hasPending:()=>pending.length>0,hasRedoPending:()=>pendingRedo.length>0,
  pendingRedoOrder:()=>pendingRedo.at(-1)?.order||0,
  onModeChange:()=>{pending=[];pendingRedo.length=0;onPendingHistoryChange();hover=null;dragging=null;clickCandidate=null;editVertices=false;addingVertex=false;refreshAll();}};
}