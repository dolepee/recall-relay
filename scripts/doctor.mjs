import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
let failures=0;
function check(name,ok,help){console.log(`${ok?'OK':'MISSING'} ${name}${!ok?' — '+help:''}`);if(!ok)failures++;}
const [major,minor]=process.versions.node.split('.').map(Number);
check('Node with built-in SQLite',major>22||major===22&&minor>=13,'Install Node 22.13 or newer.');
check('Built interface',existsSync('dist/index.html'),'Run npm ci and npm run build.');
try{process.loadEnvFile('.env');}catch{}
check('Sandbox application credentials',!!process.env.PAYPAL_SANDBOX_CLIENT_ID&&!!process.env.PAYPAL_SANDBOX_CLIENT_SECRET,'Copy .env.example to .env and configure your Sandbox application; values are never printed.');
check('Apple Silicon AI platform',process.platform==='darwin'&&process.arch==='arm64','The bundled MLX runtime currently supports Apple Silicon Macs only.');
const manifest=JSON.parse(readFileSync('scripts/ai-model-manifest.json','utf8'));
check('Model files',Object.keys(manifest.files).every(f=>existsSync(resolve('.local/ai-model',f))),'Run python3 scripts/setup-ai.py.');
const runtime=resolve('.local/ai-venv/bin/python');
check('Local inference runtime',existsSync(runtime)&&spawnSync(runtime,['-c','import mlx_lm, mlx.core'],{stdio:'ignore'}).status===0,'Run python3 scripts/setup-ai.py.');
console.log('Local checks only; no PayPal transaction or external inference was performed.');
process.exitCode=failures?1:0;
