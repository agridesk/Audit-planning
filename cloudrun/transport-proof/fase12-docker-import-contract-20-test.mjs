import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
for(const file of ['model-c-scope-visit-preview-20.mjs','rotation-uid-reconciliation-20.mjs']){
 assert.ok(server.includes("from './"+file+"'"),file+' import');
 assert.ok(docker.includes('COPY '+file+' ./'),file+' Docker copy');
}
console.log('Docker imported modules contract OK');
