import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(c=>spawnSync('which',[c],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chrome / Chromium required');
const root=process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/';
const r=spawnSync(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-extensions',
 '--virtual-time-budget=66000','--dump-dom',root+'tests/sun-shadow-smoke.html'],
 {encoding:'utf8',timeout:120000,maxBuffer:10e6});
const status=r.stdout?.match(/<body[^>]*data-result="([^"]+)"/)?.[1];
const message=r.stdout?.match(/<div id="result">([^<]*)/)?.[1]||'';
console.log('Sun shadows:',r.status,status,message);
assert.equal(r.status,0);
assert.equal(status,'PASS',message);
