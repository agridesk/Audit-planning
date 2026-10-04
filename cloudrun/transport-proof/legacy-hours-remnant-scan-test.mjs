import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('../..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const exts=new Set(['.js','.mjs','.html','.json','.txt','.md']);
const needles=[
  /scheduledHours/i,
  /schedulingHours/i,
  /Scheduling_hours/i,
  /scheduled hours/i,
  /scheduling hours/i,
  /Scheduling target/i,
  /scheduled_hours/i,
  /scheduling_hours/i
];

const allowed=[
  {
    path:'ConfigScopesService.js',
    why:'one-time legacy Config_Scopes migration input only',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/scheduling-delta-test.mjs',
    why:'regression test asserting legacy semantics are absent',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/contract-test.mjs',
    why:'regression test asserting legacy semantics are absent',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/combined-visit-contract-test.mjs',
    why:'regression test asserting legacy semantics are absent',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/planning-toolkit-v210-contract-test.mjs',
    why:'regression test asserting legacy semantics are absent',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/complete-v29-contract-test.mjs',
    why:'negative regression assertion only',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/open-audits-grid2-contract-test.mjs',
    why:'negative regression assertions only',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/open-audits-grid2-gas-contract-test.mjs',
    why:'negative regression assertions only',
    lines:[/.*/]
  },
  {
    path:'docs/AMS_MASTER_ROADMAP_V2.8_FINAL_2026-09-26.txt',
    why:'superseded historical roadmap; never current truth',
    lines:[/.*/]
  },
  {
    path:'cloudrun/transport-proof/legacy-hours-remnant-scan-test.mjs',
    why:'this scanner contains the search terms',
    lines:[/.*/]
  }
];

function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules'].includes(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full,out);
    else if(exts.has(path.extname(ent.name).toLowerCase()))out.push(full);
  }
  return out;
}
function rel(full){return path.relative(root,full).replaceAll('\\','/');}
function isAllowed(file,line){
  return allowed.some(a=>a.path===file&&a.lines.some(r=>r.test(line)));
}

const matches=[];
for(const full of walk(root)){
  const file=rel(full);
  const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
  lines.forEach((line,i)=>{
    if(needles.some(r=>r.test(line))){
      matches.push({file,line:i+1,text:line.trim(),allowed:isAllowed(file,line)});
    }
  });
}
const active=matches.filter(x=>!x.allowed);
console.log(JSON.stringify({
  success:active.length===0,
  scannedFiles:walk(root).length,
  totalMatches:matches.length,
  allowedLegacyMatches:matches.length-active.length,
  activeMatches:active
},null,2));
assert.equal(active.length,0,'Active scheduled/scheduling-hours remnants remain');
console.log('legacy-hours-remnant-scan-test passed');
