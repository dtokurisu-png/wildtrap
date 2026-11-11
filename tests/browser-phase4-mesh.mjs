import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium no disponible');
const base=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const p=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=38000','--dump-dom',base+'tests/phase4-mesh-smoke.html'
],{encoding:'utf8',timeout:90000,maxBuffer:7e6});
const status=p.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const message=p.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO RESULT';
console.log('Chromium exit',p.status,status,message);
console.log('stderr',(p.stderr||'').slice(-1000));
assert.equal(p.status,0,'Chromium falló');
assert.equal(status,'PASS',message);
console.log('WILDTRAP PHASE 4 MESH AND INTANGIBLE PASS');
