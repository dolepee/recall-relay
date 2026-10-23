import {execFileSync} from 'node:child_process';
import {copyFileSync,writeFileSync} from 'node:fs';

execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit'});
copyFileSync('cloud/pages-worker.mjs','dist/_worker.js');
writeFileSync('dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));
