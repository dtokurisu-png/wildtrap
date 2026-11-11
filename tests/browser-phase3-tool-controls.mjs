import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chrome/Chromium no está disponible');
const base=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const result=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=32000','--dump-dom',base+'tests/phase3-tool-controls-smoke.html'
],{encoding:'utf8',timeout:70000,maxBuffer:7e6});
const status=result.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const message=result.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO MESSAGE';
console.log('Chrome:',result.status,status,message);
console.log('stderr tail:',(result.stderr||'').slice(-900));
assert.equal(result.status,0,'Falló Chromium');
assert.equal(status,'PASS',message);
console.log('WILDTRAP PHASE 3 OK');
