import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const dir=path.dirname(fileURLToPath(import.meta.url));
const required=['server-r15.js','availability-resolver-20.js','availability-mutations-20.js','availability-storage-service-20.js','availability-firestore-adapter-20.js','availability-http-api-20.js','availability-manager-overview-20.js','availability-manager-calendar-20.html','availability-my-calendar-20.html','availability-committed-overlay-20.js','availability-audit-planning-bridge-20.js','availability-planning-overlay-service-20.js','availability-planning-read-cache-20.js'];
const files=new Set(await readdir(dir));let failures=0;
for(const file of required){if(!files.has(file)){console.error('MISSING '+file);failures++;continue;}const source=await readFile(path.join(dir,file),'utf8');if(!source.trim()){console.error('EMPTY '+file);failures++;}}
for(const htmlName of ['availability-my-calendar-20.html','availability-manager-calendar-20.html']){const html=await readFile(path.join(dir,htmlName),'utf8');const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];if(!scripts.length){console.error('MISSING_CLIENT_SCRIPT '+htmlName);failures++;}for(const [,source] of scripts){try{new vm.Script(source,{filename:htmlName});console.log('PASS_CLIENT_SYNTAX '+htmlName)}catch(e){console.error('FAIL_CLIENT_SYNTAX '+htmlName+' '+e.message);failures++;}}}
const server=await readFile(path.join(dir,'server-r15.js'),'utf8');
for(const guard of ['/api/v1/session','CANONICAL_PLANNING_INCOMPLETE','availability-manager-calendar-20.html','availability-my-calendar-20.html'])if(!server.includes(guard)){console.error('MISSING_GUARD '+guard);failures++;}
const runtime=await readFile(path.join(dir,'runtime-environment-20.mjs'),'utf8');if(!runtime.includes('AVAILABILITY_DEV_PROJECT_ONLY')||!server.includes('resolveAmsRuntimeConfig')){console.error('MISSING_RUNTIME_DEV_PROJECT_GUARD');failures++;}
const scripts=[...files].filter(f=>f.endsWith('-test.mjs')).sort();
for(const file of [...required.filter(f=>f.endsWith('.js')),...scripts]){const result=spawnSync(process.execPath,[...(file.endsWith('-test.mjs')?[]:['--check']),path.join(dir,file)],{encoding:'utf8',timeout:30000});if(result.status!==0){console.error('FAIL '+file+'\n'+(result.stderr||result.stdout).slice(-1500));failures++;}else console.log('PASS '+file);}
console.log(`PREFLIGHT ${failures?'FAILED':'PASSED'}; ${required.length} required files, ${scripts.length} test suites, ${failures} errors`);
process.exitCode=failures?1:0;