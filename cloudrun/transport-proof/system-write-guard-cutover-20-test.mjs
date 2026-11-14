import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../SystemWriteGuard.js',import.meta.url),'utf8');
function decision({owner,action,swapEnabled='true',swapAuthority='GAS'}){
 const context={
  SYS_getConfig_:()=>({ALLOW_DEV_WRITES:'TRUE',DEV_WRITE_MODE:'ALLOW_ALL'}),
  SYS_getEnv_:()=> 'DEV',
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>({
   AMS_DEV_PLANNING_CANONICAL_OWNER_20:owner,
   AMS_SWAP20_COMMIT_ENABLED:swapEnabled,
   AMS_SWAP20_WRITE_AUTHORITY:swapAuthority
  })[key]??null})},
  Logger:{log(){}}
 };
 vm.runInNewContext(source,context,{timeout:2000});
 return context.SYS_WRITE_GUARD_DECIDE_(action,'AUD_REAL_SAMPLE');
}
for(const action of ['PLANNING_SWAP20_LEGACY','PLANNING_SAVE','STATUS_APPROVE','REJECT_AUDIT']){
 const d=decision({owner:'CLOUD_RUN',action});
 assert.equal(d.allowed,false,action);
 assert.equal(d.code,'DEV_LEGACY_PLANNING_WRITER_RETIRED',action);
}
assert.equal(decision({owner:null,action:'PLANNING_SWAP20_LEGACY'}).allowed,true);
assert.equal(decision({owner:'CLOUD_RUN',action:'NOTIFICATION_DIGEST'}).allowed,true);
console.log('GAS canonical owner: no legacy SWAP exception, non-planning intact PASS');
