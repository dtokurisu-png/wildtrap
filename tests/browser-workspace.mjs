import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/editor-workspace\.css\?v=0\.9\.(?:9|10|11|12)/);
assert.match(html,/editor-workspace\.js\?v=0\.9\.(?:9|10|11|12)/);
assert.ok(html.indexOf('editor-workspace.js')<html.indexOf("import('./editor.mjs"),'La interfaz debe iniciar antes del motor');
const chrome=['google-chrome','google-chrome-stable','chromium'].find(cmd=>spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(chrome,'Chrome/Chromium no está instalado');
const url=(process.env.WILDTRAP_SMOKE_URL||'http://127.0.0.1:8123/')+'tests/workspace-smoke.html';
const r=spawnSync(chrome,[
 '--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
 '--disable-background-networking','--disable-extensions',
 '--virtual-time-budget=25000','--dump-dom',url
],{encoding:'utf8',timeout:70000,maxBuffer:7e6});
console.log('Chromium exit',r.status,r.signal||'');
console.log('UI status:',r.stdout.match(/<body[^>]*data-result="([^"]+)"/)?.[1]||'NO STATUS');
console.log('Result:',r.stdout.match(/<div id="result">([^<]*)/)?.[1]||'NO RESULT');
console.log('Chrome stderr tail',(r.stderr||'').slice(-700));
assert.equal(r.status,0,'El navegador falló durante prueba de interfaz');
assert.match(r.stdout,/<body[^>]*data-result="PASS"/,'La interfaz no pasó la validación 3 paneles');
console.log('WILDTRAP WORKSPACE 3-PANE READY');
