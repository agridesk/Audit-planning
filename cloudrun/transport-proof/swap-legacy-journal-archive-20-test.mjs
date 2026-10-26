import assert from 'node:assert/strict';
import {classifySwapLegacyJournal,createSwapLegacyJournalArchive} from './swap-legacy-journal-archive-20.mjs';
const time='2026-10-26T17:00:00.000Z';
const row=(id,seq,stage)=>[id,String(seq),stage,time,JSON.stringify({stage})];
const ops=classifySwapLegacyJournal([
 row('swap_12345678',1,'PREPARED'),row('swap_12345678',2,'WRITING'),
 row('swap_12345678',3,'COMMITTED'),row('swap_87654321',1,'PREPARED')]);
assert.equal(ops.length,2);
assert.equal(ops[0].terminal,true);
assert.equal(ops[1].terminal,false);
assert.throws(()=>classifySwapLegacyJournal([row('swap_12345678',2,'WRITING')]),/SEQUENCE_OR_TRANSITION/);
assert.throws(()=>classifySwapLegacyJournal([row('swap_12345678',1,'COMMITTED')]),/SEQUENCE_OR_TRANSITION/);
assert.throws(()=>classifySwapLegacyJournal([['swap_12345678','1','PREPARED']]),/ROW_INCOMPLETE/);
let saved=null,writes=0;
const archive=createSwapLegacyJournalArchive({project:'ams-test-dev',getToken:async()=>'token',
 fetchImpl:async(url,init={})=>{
  if(init.method==='PATCH'){
   writes++;
   assert.match(url,/currentDocument.exists=false/);
   saved=JSON.parse(init.body).fields.payload.stringValue;
   return {ok:true,status:200,json:async()=>({updateTime:time})};
  }
  return saved?{ok:true,status:200,json:async()=>({fields:{payload:{stringValue:saved}}})}:{ok:false,status:404};
 }});
assert.equal((await archive.stage(ops[1])).code,'NONTERMINAL_NOT_ARCHIVED');
assert.equal((await archive.stage(ops[0])).staged,true);
assert.equal((await archive.stage(ops[0])).existing,true);
assert.equal(writes,1);
assert.equal(JSON.parse(saved).archiveState,'HISTORICAL_INACTIVE');
console.log('SWAP legacy journal archive: PASS');
