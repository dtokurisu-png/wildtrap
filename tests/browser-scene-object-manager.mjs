import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium no está instalado en la máquina de pruebas');
const site=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const result=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=27000','--dump-dom',site+'tests/scene-object-manager-smoke.html'
],{encoding:'utf8',timeout:70000,maxBuffer:7e6});
const status=result.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const details=result.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO MESSAGE';
console.log('Chrome:',result.status,status,details);
console.log('stderr:',(result.stderr||'').slice(-700));
assert.equal(result.status,0,'Chrome falló');
assert.equal(status,'PASS',details);
console.log('SCENE OBJECT MANAGER PHASE 2 PASS');
