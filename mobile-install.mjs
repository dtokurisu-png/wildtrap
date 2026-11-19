// Mobile installation and published-version notifications.
const $=id=>document.getElementById(id);
const button=$('installButton'),banner=$('updateBanner'),tip=$('installHint');
const KEY='wildtrap-mobile-deployed-build-v1';
let installPrompt=null,available='',lastChecked=0;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const read=()=>{try{return localStorage.getItem(KEY)}catch(_){return null}};
const save=x=>{try{localStorage.setItem(KEY,x)}catch(_){}};
function hint(text){$('installHintText').textContent=text;tip.hidden=false}
$('installHintClose').onclick=()=>tip.hidden=true;
function refreshButton(){button.hidden=standalone();button.textContent=installPrompt?'Instalar':'Instalar…'}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;refreshButton()});
addEventListener('appinstalled',()=>{installPrompt=null;refreshButton();tip.hidden=true});
button.onclick=async()=>{
 if(!installPrompt){hint('En Chrome, abre el menú ⋮ y elige Instalar aplicación o Agregar a pantalla de inicio.');return}
 const current=installPrompt;installPrompt=null;
 try{await current.prompt();await current.userChoice}catch(e){hint('Instalación no disponible: '+e.message)}
 refreshButton();
};
$('landscapeButton').onclick=async()=>{
 try{
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
  if(screen.orientation?.lock)await screen.orientation.lock('landscape');
  else hint('El navegador no permite forzar la orientación. Abre el juego desde su icono instalado.');
 }catch(_){hint('El navegador bloqueó el giro. La aplicación instalada solicita orientación horizontal al iniciar.')}
};
refreshButton();
if(standalone())screen.orientation?.lock?.('landscape').catch(()=>{});
if('serviceWorker' in navigator)addEventListener('load',()=>{
 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(e=>console.warn('PWA',e));
});
async function checkVersion(){
 if(!navigator.onLine||document.hidden||Date.now()-lastChecked<60000)return;
 lastChecked=Date.now();
 try{
  const r=await fetch('./version.json?nocache='+Date.now(),{cache:'no-store'});
  if(!r.ok)return;
  const data=await r.json();
  if(typeof data.build!=='string'||!data.build)return;
  available=data.build;
  const old=read();
  if(!old)save(available);
  else if(old!==available)banner.hidden=false;
 }catch(_){/* The root editor may not have a deployed build marker. */}
}
$('updateLater').onclick=()=>banner.hidden=true;
$('updateNow').onclick=async()=>{
 if(!available)return;
 $('updateNow').disabled=true;$('updateNow').textContent='Actualizando…';
 try{
  await Promise.all((await caches.keys()).filter(k=>k.startsWith('wildtrap-mobile-shell-')).map(k=>caches.delete(k)));
  const reg=await navigator.serviceWorker?.getRegistration('./');await reg?.update();
 }catch(e){console.warn('Cache reset',e)}
 save(available);
 const url=new URL(location.href);url.searchParams.set('build',available.slice(0,16));location.replace(url.href);
};
addEventListener('focus',()=>void checkVersion());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkVersion()});
addEventListener('online',()=>void checkVersion());
setInterval(()=>void checkVersion(),180000);
void checkVersion();
