import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium no disponible');
const url=(process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/')+
 'tests/editor-camera-persistence-smoke.html';
const result=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=38000','--dump-dom',url
],{encoding:'utf8',timeout:105000,maxBuffer:9e6});
const status=result.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const message=result.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO RESULT';
console.log('Chrome:',result.status,status,message);
console.log('Chrome stderr tail:',(result.stderr||'').slice(-950));
assert.equal(result.status,0,'Chromium falló');
assert.equal(status,'PASS',message);
console.log('WILDTRAP 3D CAMERA AUTOSAVE & RESTORE PASS');
