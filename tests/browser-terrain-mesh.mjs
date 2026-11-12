import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium no está instalado');
const root=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const run=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=36000','--dump-dom',root+'tests/terrain-mesh-smoke.html'
],{encoding:'utf8',timeout:90000,maxBuffer:7e6});
const status=run.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const result=run.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO RESULT';
console.log('Chrome:',run.status,status,result);
console.log('stderr tail',(run.stderr||'').slice(-900));
assert.equal(run.status,0,'Chromium falló');
assert.equal(status,'PASS',result);
console.log('WILDTRAP TERRAIN MESH REGRESSION PASS');
