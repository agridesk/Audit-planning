import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
const patterns=docker.split(/\r?\n/).filter(x=>/^COPY\s+/.test(x)).flatMap(x=>x.trim().split(/\s+/).slice(1,-1));
const files=fs.readdirSync(root);
const included=new Set(patterns.flatMap(pattern=>pattern.includes('*')?files.filter(f=>new RegExp('^'+pattern.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(f)):[pattern]));
const missing=new Set();
const visited=new Set();
function check(file){
 if(visited.has(file))return;
 visited.add(file);
 if(!included.has(file)){missing.add(file);return;}
 if(!/\.(mjs|js|cjs)$/.test(file))return;
 const content=fs.readFileSync(path.join(root,file),'utf8');
 const re=/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)['"]([^'"]+)['"]/g;
 for(const match of content.matchAll(re)){
  const spec=match[1];
  if(!spec.startsWith('./')&&!spec.startsWith('../'))continue;
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));
  if(resolved.startsWith('../')){missing.add(resolved+' (outside build context)');continue;}
  check(resolved);
 }
}
check('server-r15.js');
if(missing.size){console.error('Docker image missing required imports:\n'+[...missing].sort().join('\n'));process.exitCode=1;}
else console.log('Docker entrypoint dependency closure: PASS ('+visited.size+' files)');
