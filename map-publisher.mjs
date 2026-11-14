// Explicit, atomic publication from the local WildTrap editor into WildTrap Play.
// Credentials are held only in the password input for this operation. Never persist them.
export const PLAY_REPO='dtokurisu-png/wildtrap-play';
export const PLAY_BRANCH='main';

export function validatePublishedScene(scene){
 if(!scene||typeof scene!=='object')throw Error('No hay un escenario para publicar.');
 const {size,resolution,heights,nodes}=scene;
 if(!Number.isFinite(size)||size<=0||!Number.isInteger(resolution)||resolution<2||
  !Array.isArray(heights)||heights.length!==resolution*resolution||
  !heights.every(Number.isFinite)||!Array.isArray(nodes))
  throw Error('Escenario inválido: revisa tamaño, resolución, alturas y objetos.');
 if(!nodes.some(n=>n.kind==='playerSpawn'&&n.playerSlot===1))
  throw Error('Debes configurar Spawn del Jugador 1 antes de publicar.');
 if(JSON.stringify(scene).length>10_000_000)
  throw Error('El archivo excede el límite de publicación de 10 MB.');
 return {size,resolution,objects:nodes.length,spawns:nodes.filter(n=>n.kind==='playerSpawn').length,
  cuts:(scene.cuts3d||[]).length};
}

const API='https://api.github.com/repos/'+PLAY_REPO;
function decodeUTF8Base64(value){
 const bytes=Uint8Array.from(atob(value.replace(/\s/g,'')),ch=>ch.charCodeAt(0));
 return new TextDecoder().decode(bytes);
}
async function request(path,token,{method='GET',body}={}){
 const res=await fetch(API+path,{
  method,headers:{'Accept':'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28','Authorization':'Bearer '+token,
   ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'
 });
 const raw=await res.text();
 let result;try{result=raw?JSON.parse(raw):{}}catch{result={message:raw.slice(0,250)}}
 if(!res.ok)throw Error('GitHub '+res.status+': '+(result.message||'No se pudo completar la operación')+
  (res.status===403?' · Comprueba permiso Contents: Read and write para WildTrap Play.':''));
 return result;
}
export async function getPublishedManifest(token){
 const record=await request('/contents/maps/manifest.json?ref='+PLAY_BRANCH,token);
 if(!record.content)throw Error('No existe el manifiesto del mapa publicado.');
 return JSON.parse(decodeUTF8Base64(record.content));
}
export async function publishMap({scene,token,notes='',onProgress=()=>{}}){
 const secret=String(token||'').trim();
 if(!secret)throw Error('Introduce una credencial de GitHub autorizada para WildTrap Play.');
 const statistics=validatePublishedScene(scene);
 // A frozen copy prevents edits during the network publication.
 const payload=JSON.stringify(scene);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(payload)))).slice(0,6).map(n=>n.toString(16).padStart(2,'0')).join('');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const id='v'+stamp+'-'+hash;
 const versionPath='maps/versions/'+id+'.json';
 onProgress('Comprobando la versión publicada y la rama de destino…');
 const [ref,manifest]=await Promise.all([
  request('/git/ref/heads/'+PLAY_BRANCH,secret),
  getPublishedManifest(secret)
 ]);
 const head=ref.object?.sha;
 if(!head)throw Error('La rama principal de WildTrap Play no está disponible.');
 if((manifest.releases||[]).some(v=>v.id===id))
  throw Error('Esta versión ya existe; vuelve a intentar para generar otro ID.');
 const parent=await request('/git/commits/'+head,secret);
 const entry={id,path:versionPath,publishedAt:new Date().toISOString(),
  source:'WildTrap Editor',notes:String(notes||'').trim().slice(0,240),
  hash,objects:statistics.objects,spawns:statistics.spawns};
 const nextManifest={schemaVersion:1,activeVersion:id,activePath:versionPath,
  publishedAt:entry.publishedAt,releases:[...(manifest.releases||[]),entry]};
 onProgress('Preparando la copia inmutable y el historial…');
 // All three files are written to a SINGLE Git commit: no partially active map.
 const [snapshotBlob,currentBlob,manifestBlob]=await Promise.all([
  request('/git/blobs',secret,{method:'POST',body:{content:payload,encoding:'utf-8'}}),
  request('/git/blobs',secret,{method:'POST',body:{content:payload,encoding:'utf-8'}}),
  request('/git/blobs',secret,{method:'POST',body:{content:JSON.stringify(nextManifest,null,2)+'\n',encoding:'utf-8'}})
 ]);
 const tree=await request('/git/trees',secret,{method:'POST',body:{
  base_tree:parent.tree.sha,
  tree:[
   {path:versionPath,mode:'100644',type:'blob',sha:snapshotBlob.sha},
   {path:'maps/current.json',mode:'100644',type:'blob',sha:currentBlob.sha},
   {path:'maps/manifest.json',mode:'100644',type:'blob',sha:manifestBlob.sha}
  ]
 }});
 const commit=await request('/git/commits',secret,{method:'POST',body:{
  message:'Publish WildTrap map '+id,tree:tree.sha,parents:[head]
 }});
 onProgress('Confirmando la publicación en WildTrap Play…');
 // A concurrent update must NEVER be overwritten.
 await request('/git/refs/heads/'+PLAY_BRANCH,secret,{
  method:'PATCH',body:{sha:commit.sha,force:false}
 });
 onProgress('Mapa publicado correctamente: '+id);
 return {id,path:versionPath,commit:commit.sha,statistics,
  url:'https://github.com/'+PLAY_REPO+'/blob/'+PLAY_BRANCH+'/'+versionPath};
}

export function createMapPublisher({getScene}){
 const el=id=>document.getElementById(id);
 const status=el('publishStatus'),preview=el('publishPreview'),button=el('publishNow');
 const key=el('publishToken'),notes=el('publishNotes'),agree=el('publishConfirm');
 const meta=el('publishMeta'),link=el('publishedMapLink');
 const say=message=>{status.textContent=message;};
 function snapshot(){return structuredClone(getScene());}
 preview.addEventListener('click',async()=>{
  try{
   const stats=validatePublishedScene(snapshot());
   meta.textContent='Mapa listo: '+stats.size+' × '+stats.size+' · '+stats.objects+
    ' objetos · '+stats.spawns+' spawns · '+stats.cuts+' recortes';
   // This public read doesn't need any token.
   const response=await fetch('https://raw.githubusercontent.com/'+PLAY_REPO+
    '/'+PLAY_BRANCH+'/maps/manifest.json?t='+Date.now(),{cache:'no-store'});
   if(response.ok){
    const current=await response.json();
    meta.textContent+=' · publicado actualmente: '+(current.activeVersion||'sin versión');
   }
   say('Vista previa validada. La publicación solo se hace al confirmar.');
  }catch(err){say('Error: '+err.message);}
 });
 button.addEventListener('click',async()=>{
  if(!agree.checked){say('Marca la confirmación antes de publicar.');return;}
  if(!key.value.trim()){say('Introduce un token autorizado para WildTrap Play.');return;}
  if(!confirm('¿Publicar una COPIA del mapa actual en WildTrap Play?'+
   '\nEsto actualizará el mapa para PARTIDAS NUEVAS, conservando todas las versiones anteriores.'))return;
  preview.disabled=true;button.disabled=true;agree.disabled=true;
  try{
   const result=await publishMap({scene:snapshot(),token:key.value,notes:notes.value,onProgress:say});
   key.value='';agree.checked=false;
   meta.textContent='Versión '+result.id+' · '+result.statistics.objects+' objetos · commit '+result.commit.slice(0,8);
   link.href=result.url;link.hidden=false;
  }catch(err){say('No se publicó: '+err.message);}
  finally{preview.disabled=false;button.disabled=false;agree.disabled=false;}
 });
}
