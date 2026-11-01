import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {basename,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const entries=readdirSync(root).filter(name=>/^(?:server-r(?:4|5|6|7|8|9|10|11|12|15)\.js|assignment-validation-v211\.js|model-c-new-obligation-provenance-20\.js)$/.test(name));
const docker=readFileSync(resolve(root,'Dockerfile'),'utf8');
const patterns=docker.split('\n').map(x=>/^COPY\s+(\S+)\s+\.\/$/.exec(x)?.[1]).filter(Boolean);
function matches(name,pattern){
 const escaped=pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
 return new RegExp('^'+escaped+'$').test(name);
}
const sourceFiles=readdirSync(root);
const packaged=new Set(sourceFiles.filter(name=>patterns.some(p=>matches(name,p))));
const visited=new Set(),missing=[];
function walk(name,parent){
 if(visited.has(name))return;
 visited.add(name);
 if(!existsSync(resolve(root,name))){missing.push('SOURCE_MISSING '+name+' <- '+parent);return}
 if(!packaged.has(name))missing.push('DOCKER_MISSING '+name+' <- '+parent);
 const source=readFileSync(resolve(root,name),'utf8');
 for(const m of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]\.\/([^'"]+)['"]/g)){
  const dep=m[1];
  if(dep.includes('/')){missing.push('NESTED_UNSUPPORTED '+dep+' <- '+name);continue}
  walk(dep,name);
 }
 for(const m of source.matchAll(/import\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)/g))walk(m[1],name);
}
entries.forEach(entry=>walk(entry,'entry'));
assert.deepEqual(missing,[],'All ESM runtime dependencies must be packaged in Cloud Run Docker image');
for(const module of ['auditor-scope-qualifications-20.js','auditor-scope-qualifications-migration-20.js','auditor-scope-qualifications-firestore-lock-20.js','auditor-scope-qualifications-migration-sheets-20.js','model-c-new-obligation-provenance-20.js','company-scope-hours-snapshot-20.js'])assert.ok(packaged.has(module),'Missing critical staged module: '+module);
console.log('Runtime Docker import closure verified: '+visited.size+' modules including Fase 2.5 and Model C');
