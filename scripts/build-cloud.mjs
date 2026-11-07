import {execFileSync} from 'node:child_process';
import {exampleNotice} from '../src/prepared-scenario.mjs';
import {copyFileSync,writeFileSync} from 'node:fs';

execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit'});
copyFileSync('cloud/pages-worker.mjs','dist/_worker.js');
writeFileSync('dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));

const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
writeFileSync('dist/assets/relay-home-notice.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relay Home test notice · Recall Relay</title><style>body{font:16px/1.65 system-ui;color:#142337;background:#f5f7fa;margin:0}main{max-width:720px;margin:auto;padding:32px 20px}a{color:#2549c9;display:inline-block;padding:12px 0}li{margin:16px 0}h1{line-height:1.2}</style><main><a href="/">Recall Relay</a><h1>${escape(exampleNotice.title)}</h1><p><strong>Fictional test notice · ${exampleNotice.id} · version ${exampleNotice.version}</strong></p><p>${escape(exampleNotice.description)}</p><h2>Complete remedy instructions</h2><ol>${exampleNotice.remedies.map(q=>`<li>${escape(q)}</li>`).join('')}</ol><p>No external instructions, destruction, disposal, email submission or post-refund customer action is required by this fictional notice. Real notices must be reviewed independently.</p><a href="/setup?example=relay-home">Prepare this test scenario</a></main></html>`);
