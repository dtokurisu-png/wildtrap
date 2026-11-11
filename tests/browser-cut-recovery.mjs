import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const chrome=['google-chrome','google-chrome-stable','chromium'].find(name=>spawnSync('which',[name]).status===0);
assert.ok(chrome,'Chrome no disponible');
const origin=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const dir=mkdtempSync(join(tmpdir(),'wildtrap-recovery-'));
const port=9229;
const proc=spawn(chrome,[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--no-first-run','--disable-extensions','--remote-allow-origins=*',
 '--remote-debugging-port='+port,'--user-data-dir='+dir,'about:blank'
],{stdio:'ignore'});
let ws=null,sequence=0;
const pending=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(check,ms=25000){
 const started=Date.now();let last;
 while(Date.now()-started<ms){
  try{last=await check();if(last)return last}catch(e){last=e.message}
  await delay(200);
 }
 throw Error('Tiempo agotado: '+String(last));
}
function cdp(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++sequence;
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},15000);
  pending.set(id,{resolve(value){clearTimeout(timeout);resolve(value)},reject(err){clearTimeout(timeout);reject(err)}});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.result.exceptionDetails)throw Error('Browser JS: '+JSON.stringify(result.result.exceptionDetails));
 return result.result.result.value;
}
async function navigate(url){
 await cdp('Page.navigate',{url});
 await wait(()=>evaluate("document.readyState==='complete'"));
}
try{
 const page=await wait(async()=>{
  const res=await fetch('http://127.0.0.1:'+port+'/json/list');
  const all=await res.json();return all.find(p=>p.type==='page'&&p.webSocketDebuggerUrl);
 });
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 });
 ws.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id)return;
  const slot=pending.get(msg.id);
  if(!slot)return;
  pending.delete(msg.id);
  if(msg.error)slot.reject(Error(msg.error.message));
  else slot.resolve(msg);
 });
 await cdp('Page.enable');
 await cdp('Runtime.enable');
 await navigate(origin);
 await wait(()=>evaluate("document.querySelector('#boot')?.hidden===true"));

 const injected=await evaluate(`(async()=>{
   const draft=await fetch('./assets/terrain/wildtrap-world.json').then(r=>r.json());
   const index=(Math.floor(draft.resolution/2)*draft.resolution+Math.floor(draft.resolution/2));
   const height=draft.heights[index];
   draft.cuts3d=Array.from({length:85},(_,i)=>({
    center:[Math.sin(i*.63)*4,height,Math.cos(i*.79)*4],
    normal:[0,1,0],radius:5+i%3,depth:3,
    shape:i%4===0?'rectangle':'circle',dir:'north',op:i%18===17?'restore':'cut'
   }));
   localStorage.setItem('wildtrap-editor-draft-v1',JSON.stringify(draft));
   return {count:draft.cuts3d.length,height,size:JSON.stringify(draft).length};
 })()`);
 assert.equal(injected.count,85);
 console.log('Borrador sintético con recortes:',injected);
 await cdp('Page.reload',{ignoreCache:true});
 const rebuilt=await wait(()=>evaluate(`(()=>{
   const boot=document.querySelector('#boot');
   const counter=document.querySelector('#holeCounter')?.textContent||'';
   const stats=document.querySelector('#holeMeshStats')?.textContent||'';
   return boot?.hidden&&counter.includes('81 cortes 3D')&&counter.includes('4 restauraciones')?{counter,stats}:false;
 })()`),35000);
 console.log('ARRANQUE CON RECORTES OK:',rebuilt);

 await navigate(origin+'?recover=1');
 const recovery=await wait(()=>evaluate(`(()=>{
   const boot=document.querySelector('#boot');
   const panel=document.querySelector('#recoveryPanel');
   const stats=document.querySelector('#holeMeshStats')?.textContent||'';
   return boot?.hidden&&panel&&!panel.hidden&&stats.includes('RECUPERACIÓN')?
     {stats,original:JSON.parse(localStorage.getItem('wildtrap-editor-draft-v1')).cuts3d.length,
      backup:typeof window.__backupOriginalDraft}:false;
 })()`),20000);
 assert.equal(recovery.original,85);
 assert.equal(recovery.backup,'function');
 console.log('RESCATE SIN PÉRDIDA DE DATOS OK:',recovery);
}finally{
 try{ws?.close()}catch(_){}
 try{proc.kill('SIGTERM')}catch(_){}
 await delay(250);
 try{rmSync(dir,{force:true,recursive:true,maxRetries:8,retryDelay:250})}
 catch(error){console.warn('Directorio temporal de Chrome pendiente de limpiar:',error.message)}
}
