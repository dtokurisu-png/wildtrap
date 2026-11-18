import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const chrome=['google-chrome','google-chrome-stable','chromium'].find(c=>
 spawnSync('which',[c],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chromium browser not found');
const url=(process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/')+'tests/handpaint-overlay-smoke.html';
const r=spawnSync(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-extensions',
 '--virtual-time-budget=100000','--dump-dom',url],
 {encoding:'utf8',timeout:150000,maxBuffer:12e6});
const status=r.stdout?.match(/<body[^>]*data-result="([^"]+)"/)?.[1];
const message=r.stdout?.match(/<div id="result">([^<]*)/)?.[1]||'';
console.log('10K Hard-Light:',r.status,status,message);
assert.equal(r.status,0,r.stderr?.slice(-1000));
assert.equal(status,'PASS',message);
