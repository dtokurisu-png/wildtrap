// Persistent scene storage. IndexedDB supports substantially larger drafts than
// the small synchronous localStorage quota, especially with many GLB cut stamps.
const DB_NAME='wildtrap-scene-storage-v1';
const STORE='drafts';
let opening=null;
export function openDraftDatabase(){
 if(!('indexedDB' in window))return Promise.reject(Error('IndexedDB no disponible'));
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('No se pudo abrir IndexedDB'));
 }).catch(error=>{opening=null;throw error});
 return opening;
}
export async function putDraft(key,json){
 const db=await openDraftDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put({json,updatedAt:Date.now()},key);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('No se pudo guardar el proyecto'));
  tx.onabort=()=>reject(tx.error||Error('Guardado cancelado'));
 });
}
export async function getDraft(key){
 const db=await openDraftDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly');
  const request=tx.objectStore(STORE).get(key);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(request.error||Error('No se pudo leer el proyecto'));
 });
}
