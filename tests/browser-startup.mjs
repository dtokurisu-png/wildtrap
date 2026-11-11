import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>{
 const r=spawnSync('which',[cmd],{encoding:'utf8'});return r.status===0;
});
if(!chrome)throw Error('Chrome no está instalado en el runner de prueba.');
const site='https://dtokurisu-png.github.io/wildtrap/';
for(const [mode,url] of [
 ['normal',site],
 ['seguro',site+'?safe=1']
]){
 const run=spawnSync(chrome,[
  '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--disable-background-networking','--disable-extensions',
  '--virtual-time-budget=18000','--dump-dom',url
 ],{encoding:'utf8',timeout:55000,maxBuffer:6e6});
 const html=run.stdout||'';
 const boot=html.match(/<div id="boot"[^>]*>/)?.[0]||'no se encontró #boot';
 const msg=html.match(/<p id="bootMsg"[^>]*>([^<]*)/)?.[1]||'sin texto';
 console.log('Modo:',mode,'Chrome:',chrome,'status:',run.status,'signal:',run.signal);
 console.log('Boot:',boot,'Mensaje:',msg);
 console.log('Errores recientes:',(run.stderr||'').slice(-1000));
 assert.ok(run.status===0,'Chrome falló o el navegador quedó bloqueado ('+mode+')');
 assert.match(boot,/\bhidden\b/,'La ventana de carga no desapareció ('+mode+')');
 assert.ok(!html.includes('No se pudo abrir: '),'El navegador reportó un error ('+mode+')');
 console.log('ARRANQUE 3D OK — '+mode);
}
