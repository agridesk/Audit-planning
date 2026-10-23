import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const bridge=read('../../Swap20Bridge20.js'),entry=read('../../EntryV5.js');
const cloud=read('./server-r15.js'),html=read('./manager-portal.html'),ui=read('./manager-portal.js');
assert.match(html,/id="auditorSwapInbox20"/);
assert.match(ui,/auditorSwap20InboxDialog/);
assert.match(ui,/Confirm date change/);
assert.match(ui,/\/api\/v1\/auditor\/swap20\//);
assert.match(ui,/id="swap20Apply"/);
assert.match(ui,/if\(busy\|\|!submitted\|\|apply.hidden/);
assert.match(cloud,/async function swap20AuditorRequest/);
assert.match(cloud,/actor.role!=='auditor'/);
assert.match(cloud,/\/api\/v1\/auditor\/swap20\/respond/);
assert.match(cloud,/\/api\/v1\/manager\/swap20\/commit/);
assert.match(entry,/rawAction==='externalswap20'/);
assert.match(entry,/AUDITOR_OPERATION_FORBIDDEN/);
new Function(ui);
const dev='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const actors=[['Email','Role','Active'],['manager@example.test','Manager','YES'],['auditor@example.test','Auditor','YES']];
const prop={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:dev,AMS_SWAP20_COMMIT_ENABLED:'false'};
const proposal={operationId:'SWAP20_test123',auditA:'A',auditB:'B',
 status:'AWAITING_ACKNOWLEDGEMENT',createdBy:'manager@example.test',
 requiredAuditorUids:['uid-auditor'],acknowledgedAuditorUids:[],createdAt:'2026-10-22T10:00:00Z',
 blocksA:[{date:'2026-10-23',start:'09:00',end:'11:00'}],
 blocksB:[{date:'2026-10-24',start:'09:00',end:'11:00'}],
 ecasComment:'Move audits',internalReason:'Manager private reason',dateChanged:true};
prop['AMS_SWAP20_PROPOSAL_'+proposal.operationId]=JSON.stringify(proposal);
let calls=0,commitCalls=0;
const ctx={String,Number,Array,Object,JSON,Date,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>prop[k]||'',getProperties:()=>({...prop})})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>actors})})})},
 Swap20_resolveAuditorUidByEmail_:email=>email==='auditor@example.test'?'uid-auditor':null,
 Swap20Store_read_:id=>id===proposal.operationId?proposal:null,
 Swap20AuditorRespondAuthorized_:(input,actor)=>{
  assert.equal(actor.email,'auditor@example.test');
  assert.equal(input.operationId,proposal.operationId);
  calls++;return {success:true,operationId:input.operationId,status:'CONFIRMED'};
 },
 Swap20ManagerCommitAuthorized_:()=>{commitCalls++;return {success:false,code:'SWAP_ATOMIC_WRITE_DISABLED',readOnly:true};}
};
runInNewContext(bridge,ctx);
const pending=ctx.Swap20Bridge20_handleAuditor_({actorEmail:'auditor@example.test',operation:'listPending'});
assert.equal(pending.ok,true);
assert.equal(pending.items.length,1);
assert.equal(pending.items[0].auditA,'A');
assert.equal('internalReason' in pending.items[0],false);
assert.equal(ctx.Swap20Bridge20_handleAuditor_({actorEmail:'auditor@example.test',operation:'respond',
 operationId:proposal.operationId,decision:'ACKNOWLEDGE'}).status,'CONFIRMED');
assert.equal(calls,1);
assert.equal(ctx.Swap20Bridge20_handleAuditor_({actorEmail:'auditor@example.test',operation:'respond',
 operationId:proposal.operationId,decision:'INVALID'}).ok,false);
assert.throws(()=>ctx.Swap20Bridge20_handleAuditor_({actorEmail:'manager@example.test',operation:'listPending'}),/NOT_AUTHORIZED/);
const managerStatus=ctx.Swap20Bridge20_handle_({actorEmail:'manager@example.test',operation:'getProposal',operationId:proposal.operationId});
assert.equal(managerStatus.commitEnabled,false);
const commit=ctx.Swap20Bridge20_handle_({actorEmail:'manager@example.test',operation:'commit',operationId:proposal.operationId});
assert.equal(commit.ok,false);
assert.equal(commit.status,'SWAP_ATOMIC_WRITE_DISABLED');
assert.equal(commitCalls,1);
assert.throws(()=>ctx.Swap20Bridge20_handle_({actorEmail:'auditor@example.test',operation:'commit',
 operationId:proposal.operationId}),/NOT_AUTHORIZED/);
console.log('DEV Auditor SWAP inbox, ACK and manager commit flag guards: PASS');
