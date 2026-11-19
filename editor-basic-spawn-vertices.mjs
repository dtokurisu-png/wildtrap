import * as THREE from 'three';

// Persistent basic spawn markers snapped to actual terrain vertex indices.
// No density brush, no world objects created until a future ecosystem pass.
export function createBasicSpawnVertexTool({scene,terrain,terrainGeo,camera,view,live,snapshot,persist,toast,isActive}){
 const $=id=>document.getElementById(id);
 const selector=$('basicSpawnCategory'),status=$('basicSpawnStatus');
 const clear=$('basicSpawnClear'),erase=$('basicSpawnErase');
 const TYPES={
  trees:{color:0x44cd88,name:'Árboles'},
  grass:{color:0xb5d85c,name:'Hierbas y pasto'},
  rocks:{color:0xb9aca1,name:'Rocas'},
  plants:{color:0x67aee4,name:'Plantas y raíces'},
  dunes:{color:0xf0c070,name:'Dunas'}
 };
 const color=new THREE.Color();
 const material=new THREE.PointsMaterial({size:12,sizeAttenuation:false,vertexColors:true,depthTest:false,depthWrite:false});
 const points=new THREE.Points(new THREE.BufferGeometry(),material);
 points.name='BasicSpawnVertices';points.userData.editorOnly=true;points.raycast=()=>{};
 points.renderOrder=85;points.frustumCulled=false;scene.add(points);
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),p=new THREE.Vector3();
 function records(){
  if(!Array.isArray(live.basicSpawnVertices))live.basicSpawnVertices=[];
  return live.basicSpawnVertices;
 }
 function refresh(){
  const recordsList=records();
  const attr=terrainGeo.getAttribute('position'),coords=[],colors=[];
  for(const item of recordsList){
   if(!TYPES[item.category]||!Number.isInteger(item.vertex)||item.vertex<0||item.vertex>=attr.count)continue;
   coords.push(attr.getX(item.vertex),attr.getY(item.vertex)+.4,attr.getZ(item.vertex));
   color.setHex(TYPES[item.category].color);colors.push(color.r,color.g,color.b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  points.geometry.dispose();points.geometry=geometry;
  points.visible=isActive();
  status.textContent=recordsList.length+' vértices marcados · '+recordsList.filter(x=>x.category===selector.value).length+' de '+(TYPES[selector.value]?.name||'esta categoría');
 }
 function closestVertex(event){
  const rect=view.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  ndc.set((event.clientX-rect.left)*2/rect.width-1,1-(event.clientY-rect.top)*2/rect.height);
  ray.setFromCamera(ndc,camera);
  const hit=ray.intersectObject(terrain,false)[0];
  if(!hit)return null;
  const attr=terrainGeo.getAttribute('position');
  let best=-1,bestDistance=Infinity;
  for(let i=0;i<attr.count;i++){
   const d=(attr.getX(i)-hit.point.x)**2+(attr.getY(i)-hit.point.y)**2+(attr.getZ(i)-hit.point.z)**2;
   if(d<bestDistance){bestDistance=d;best=i}
  }
  if(best<0)return null;
  p.set(attr.getX(best),attr.getY(best),attr.getZ(best)).project(camera);
  if(p.z<-1||p.z>1)return null;
  const sx=rect.left+(p.x+1)*rect.width/2,sy=rect.top+(1-p.y)*rect.height/2;
  if(Math.hypot(event.clientX-sx,event.clientY-sy)>18)return null;
  return best;
 }
 function pointerdown(e){
  if(!isActive()||e.button!==0||e.ctrlKey||e.altKey)return false;
  e.preventDefault();e.stopImmediatePropagation();
  const vertex=closestVertex(e);
  if(vertex===null){toast('Acércate a un vértice visible de la malla para marcarlo');return true}
  const category=selector.value;
  if(!TYPES[category])return true;
  const entries=records(),found=entries.findIndex(r=>r.vertex===vertex&&r.category===category);
  if(erase.checked){
   if(found<0)return true;
   snapshot();entries.splice(found,1);
  }else{
   if(found>=0)return true;
   snapshot();entries.push({vertex,category});
  }
  persist();refresh();return true;
 }
 selector.onchange=refresh;
 erase.onchange=refresh;
 clear.onclick=()=>{
  const category=selector.value,items=records();
  if(!items.some(item=>item.category===category))return;
  if(!confirm('¿Eliminar los puntos de '+TYPES[category].name+'?'))return;
  snapshot();live.basicSpawnVertices=items.filter(item=>item.category!==category);persist();refresh();
 };
 function sync(){points.visible=isActive();refresh()}
 refresh();
 return {pointerdown,refresh,sync};
}
