import * as THREE from 'three';

// Subregiones de acantilado: triángulos de la malla base, sin cortar geometría.
export function createCliffRegions({scene,terrainGeo,view,camera,live,heightAt,snapshot,persist,toast,getZone,isActive,isBlocked}){
 const $=id=>document.getElementById(id);
 const overlay=new THREE.Group();overlay.name='EditorCliffRegions';overlay.userData.editorOnly=true;scene.add(overlay);
 const mesh=new THREE.Mesh(terrainGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 mesh.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 let drawing=false,points=[],hover=null,selectedId=null;
 const coords=e=>{const box=view.getBoundingClientRect();return [(e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2];};
 function getHit(e){
  const v=coords(e);pointer.set(v[0],v[1]);ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObject(mesh,false)[0];
  if(!hit)return null;
  const p=hit.point;
  if(Math.abs(p.x)>315||Math.abs(p.z)>315)return null;
  return {x:p.x,y:p.y,z:p.z,faceIndex:hit.faceIndex,screen:v};
 }
 function pointIn(poly,p){
  let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];
   if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;
  }
  return yes;
 }
 function inside2D(poly,p){
  let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }return yes;
 }
 function faceVertices(face){
  const index=terrainGeo.index,attr=terrainGeo.attributes.position;
  const a=index?index.getX(face*3):face*3,b=index?index.getX(face*3+1):face*3+1,c=index?index.getX(face*3+2):face*3+2;
  return [[attr.getX(a),attr.getY(a),attr.getZ(a)],[attr.getX(b),attr.getY(b),attr.getZ(b)],[attr.getX(c),attr.getY(c),attr.getZ(c)]];
 }
 const vector=v=>new THREE.Vector3(...v);
 function selectedFaces(zone,polygon,steepness){
  const screen=polygon.map(p=>p.screen);
  const pos=terrainGeo.attributes.position;
  const triCount=(terrainGeo.index?.count||pos.count)/3;
  const selected=[];
  const up=new THREE.Vector3(0,1,0);
  for(let face=0;face<triCount;face++){
   const v=faceVertices(face);
   const a=vector(v[0]),b=vector(v[1]),c=vector(v[2]);
   const centroid=a.clone().add(b).add(c).multiplyScalar(1/3);
   if(!pointIn(zone.points, {x:centroid.x,z:centroid.z}))continue;
   const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   const angle=Math.acos(Math.min(1,Math.abs(normal.dot(up))))*180/Math.PI;
   if(angle<steepness)continue;
   const projected=centroid.clone().project(camera);
   if(projected.z< -1||projected.z>1||!inside2D(screen,[projected.x,projected.y]))continue;
   // Visible surface only: don't mark triangles hidden behind a near cliff.
   const from=camera.position.clone(),direction=centroid.clone().sub(from).normalize();
   const checkRay=new THREE.Raycaster(from,direction,0,from.distanceTo(centroid)+.2);
   const hits=checkRay.intersectObject(mesh,false);
   if(hits.length&&hits[0].faceIndex!==face&&hits[0].distance<from.distanceTo(centroid)-.15)continue;
   selected.push(face);
  }
  return selected;
 }
 function dispose(){
  while(overlay.children.length){
   const obj=overlay.children[0];overlay.remove(obj);obj.geometry?.dispose();obj.material?.dispose();
  }
 }
 function line(pts,color,closed=false){
  if(pts.length<2)return;
  const verts=pts.map(p=>new THREE.Vector3(p.x,p.y+.35,p.z));
  if(closed)verts.push(verts[0].clone());
  const obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts),new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false}));
  obj.renderOrder=78;overlay.add(obj);
 }
 function render(){
  dispose();overlay.visible=isActive()&&!isBlocked();
  if(!overlay.visible)return;
  const zone=getZone();
  if(!zone)return;
  for(const cliff of zone.cliffs||[]){
   if(cliff.hidden)continue;
   const faces=(cliff.faces||[]).filter(f=>Number.isInteger(f)&&f>=0&&f<(terrainGeo.index?.count||terrainGeo.attributes.position.count)/3);
   if(faces.length){
    const buffer=[];
    for(const f of faces)for(const vertex of faceVertices(f)){
     buffer.push(vertex[0],vertex[1]+.4,vertex[2]);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(buffer,3));
    const obj=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({
     color:cliff.id===selectedId?0xffc66f:0xff986b,side:THREE.DoubleSide,
     depthTest:false,depthWrite:false,transparent:true,opacity:.52
    }));
    obj.renderOrder=72;overlay.add(obj);
   }
   if(cliff.points?.length)line(cliff.points,cliff.id===selectedId?0xffe2a7:0xff9562,true);
  }
  line(points,0xffe17c);
  if(hover&&points.length)line([points.at(-1),hover],0xffe17c);
  for(const p of points){
   const dot=new THREE.Mesh(new THREE.SphereGeometry(1.35,8,5),new THREE.MeshBasicMaterial({color:0xffe17c,depthTest:false}));
   dot.position.set(p.x,p.y+.4,p.z);dot.renderOrder=79;overlay.add(dot);
  }
 }
 function refreshPanel(){
  const zone=getZone();
  const list=$('zoneCliffList');list.replaceChildren();
  for(const cliff of zone?.cliffs||[]){
   const row=document.createElement('div');row.style.cssText='display:flex;gap:4px;margin:5px 0';
   const name=document.createElement('button');name.textContent=cliff.name||'Acantilado';name.style.flex='1';name.classList.toggle('active',cliff.id===selectedId);
   name.onclick=()=>{selectedId=cliff.id;refreshPanel();render();};
   const eye=document.createElement('button');eye.textContent=cliff.hidden?'◌':'◉';eye.title='Alternar visibilidad';
   eye.onclick=()=>{snapshot();cliff.hidden=!cliff.hidden;persist();refreshPanel();render();};
   row.append(name,eye);list.append(row);
  }
  const cliff=zone?.cliffs?.find(c=>c.id===selectedId);
  $('zoneCliffProperties').hidden=!cliff;
  if(cliff){$('zoneCliffName').value=cliff.name;$('zoneCliffFaces').textContent=(cliff.faces?.length||0)+' triángulos de terreno';}
  $('zoneCliffAdd').disabled=!zone;
  $('zoneCliffClose').disabled=!drawing||points.length<3;
  $('zoneCliffUndo').disabled=!points.length;
  $('zoneCliffAdd').classList.toggle('active',drawing);
  $('zoneCliffAdd').textContent=drawing?'✓ Marcando acantilado…':'+ Acantilado';
  $('zoneCliffHint').textContent=drawing?
   points.length+' puntos · dibuja sobre la pared y cierra sobre el primero':'Selecciona una zona y pulsa + Acantilado para marcar sus caras.';
 }
 function refresh(){refreshPanel();render();}
 function start(){
  if(!getZone())return;
  drawing=true;points=[];hover=null;selectedId=null;refresh();
 }
 function cancel(){drawing=false;points=[];hover=null;refresh();}
 function down(e){
  if(!drawing||!isActive()||isBlocked()||e.button!==0||e.altKey||e.ctrlKey)return false;
  const hit=getHit(e);if(!hit)return true;
  if(points.length>=3){
   const a=points[0].screen,b=hit.screen,box=view.getBoundingClientRect();
   if(Math.hypot((a[0]-b[0])*box.width/2,(a[1]-b[1])*box.height/2)<15){close();return true;}
  }
  if(points.length&&Math.hypot(hit.x-points.at(-1).x,hit.y-points.at(-1).y,hit.z-points.at(-1).z)<.2)return true;
  points.push(hit);hover=null;refresh();return true;
 }
 function move(e){
  if(!drawing||!isActive())return false;
  hover=getHit(e);render();return true;
 }
 function close(){
  const zone=getZone();if(!zone||points.length<3)return;
  const steep=Number($('zoneCliffSlope').value)||40;
  const faces=selectedFaces(zone,points,steep);
  if(!faces.length){toast('No se encontraron caras de acantilado: amplía el contorno o reduce la pendiente mínima');return;}
  if(!Array.isArray(zone.cliffs))zone.cliffs=[];
  snapshot();
  let i=1;while(zone.cliffs.some(c=>c.id===zone.id+'-cliff-'+i))i++;
  const cliff={id:zone.id+'-cliff-'+i,name:'Acantilado '+String(i).padStart(2,'0'),
   points:points.map(p=>({x:p.x,y:p.y,z:p.z})),faces,minimumSlope:steep,hidden:false};
  zone.cliffs.push(cliff);selectedId=cliff.id;drawing=false;points=[];hover=null;
  persist();refresh();toast(cliff.name+' registrado · '+faces.length+' caras');
 }
 $('zoneCliffAdd').onclick=start;
 $('zoneCliffClose').onclick=close;
 $('zoneCliffUndo').onclick=()=>{points.pop();hover=null;refresh();};
 $('zoneCliffCancel').onclick=cancel;
 $('zoneCliffName').onchange=e=>{const cliff=getZone()?.cliffs?.find(c=>c.id===selectedId);if(!cliff)return;snapshot();cliff.name=e.target.value.trim()||cliff.name;persist();refresh();};
 $('zoneCliffDelete').onclick=()=>{
  const zone=getZone(),cliff=zone?.cliffs?.find(c=>c.id===selectedId);if(!cliff)return;
  if(!confirm('¿Eliminar '+cliff.name+'?'))return;
  snapshot();zone.cliffs=zone.cliffs.filter(c=>c.id!==selectedId);selectedId=null;persist();refresh();
 };
 return {refresh,down,move,cancel,undo:()=>{points.pop();hover=null;refresh()},isDrawing:()=>drawing,onZoneChange:()=>{cancel();selectedId=null;refresh();}};
}