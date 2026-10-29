import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const root=['server-r4.js','server-r15.js','planning-atomic-firestore-store-20.js','planning-atomic-command-service-20.js','planning-lifecycle-atomic-service-20.js','planning-multi-lifecycle-service-20.js','planning-atomic-transfer-service-20.js','planning-atomic-recovery-20.js','planning-atomic-backfill-20.js','planning-atomic-parity-verifier-20.js','planning-lifecycle-writeset-20.js'];
const visited=new Set(),missing=[];
function scan(file){
 if(visited.has(file))return;visited.add(file);
 const path=resolve(here,file);
 if(!existsSync(path)){missing.push(file);return;}
 const source=readFileSync(path,'utf8');
 const refs=[...source.matchAll(/\b(?:from\s*|import\s*\()\s*['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g)].map(m=>m[1]);
 for(const reference of refs){
  const resolved=resolve(dirname(path),reference);
  if(!existsSync(resolved))missing.push(file+' -> '+reference);
  else if(resolved.startsWith(here+'/'))scan(resolved.slice(here.length+1));
 }
}
for(const module of root)scan(module);
assert.deepEqual(missing,[],'Missing module imports in DEV Cloud Run and P0 authority graph');
assert.ok(visited.size>=20,'Dependency closure too small: missing P0 references?');
// Local import resolution is insufficient when Docker omits source modules.
const dockerfile=readFileSync(resolve(here,'Dockerfile'),'utf8');
assert.match(dockerfile,/^COPY planning-\*\.js \.\/$/m,'Container must package atomic planning runtime modules');
for(const module of root.filter(x=>x.startsWith('planning-')))assert.ok(visited.has(module),'Missing planning module in runtime closure: '+module);
console.log('DEV transport + P0 import graph: '+visited.size+' local module files resolved');
