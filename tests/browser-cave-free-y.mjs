import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(c=>
 spawnSync('which',[c],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium no disponible');
const base=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const run=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=38000','--dump-dom',base+'tests/cave-free-y-smoke.html'
],{encoding:'utf8',timeout:85000,maxBuffer:7e6});
const status=run.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const message=run.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO MESSAGE';
console.log('Chrome:',run.status,status,message);
console.log('stderr tail',(run.stderr||'').slice(-1000));
assert.equal(run.status,0,'Chromium falló');
assert.equal(status,'PASS',message);
console.log('WILDTRAP FREE CAVE Y/DEPTH DRAG PASS');
