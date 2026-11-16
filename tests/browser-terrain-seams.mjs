import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>
 spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium not installed');
const root=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const run=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=16000','--dump-dom',root+'tests/terrain-seams-smoke.html'
],{encoding:'utf8',timeout:70000,maxBuffer:7e6});
const status=run.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'UNKNOWN';
const result=run.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO RESULT';
console.log('Chrome:',run.status,status,result,'stdout bytes',run.stdout?.length,'signal',run.signal,'error',run.error?.message);
console.log('stdout head',(run.stdout||'').slice(0,500));
console.log('stdout tail',(run.stdout||'').slice(-700));
console.log('stderr tail',(run.stderr||'').slice(-1200));
assert.equal(run.status,0,'Chromium failed');
assert.equal(status,'PASS',result);
