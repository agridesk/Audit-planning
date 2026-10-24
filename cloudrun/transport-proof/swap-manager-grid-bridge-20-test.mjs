import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const bridge=read('../../Swap20Bridge20.js');
const ui=read('./manager-portal.js');
const html=read('./manager-portal.html');
const server=read('./server-r15.js');
const entry=read('../../EntryV5.js');
assert.match(html,/id="selectionSwap20"/);
assert.match(html,/id="managerSwapInbox20"/);
assert.match(html,/id="auditorSwapBadge20"/);
assert.match(html,/id="managerSwapBadge20"/);
assert.match(ui,/function swap20RefreshAttention/);
assert.match(ui,/applyActorUi\(\);swap20RefreshAttention\(\);/);
assert.match(ui,/var swap20ListCache=/);
assert.match(ui,/Date\.now\(\)-cached\.at<12000/);
assert.match(ui,/swap20ListPending\[role\]/);
assert.doesNotMatch(ui,/refresh\.textContent="Refresh status"/);

assert.match(ui,/managerSwap20InboxDialog/);
assert.match(server,/\/api\/v1\/manager\/swap20\/list/);
assert.match(ui,/gridSelected\.size!==2/);
assert.match(ui,/String\(r\.statusKey\|\|""\)\.toUpperCase\(\)!=="ACCEPTED"/);
assert.match(ui,/\/api\/v1\/manager\/swap20\//);
assert.match(ui,/swap20InternalReason/);
assert.match(ui,/swap20EcasComment/);
assert.match(ui,/The audit dates have not been changed/);
assert.match(server,/async function notificationGasCallOnce/);
assert.match(server,/\['preview','getProposal','listPending','listIndexSeed'\]\.includes\(operation\)/);
assert.match(server,/SWAP20_READONLY_GAS_RETRY/);
assert.match(server,/return notificationGasCallOnce\(actor,operation,payload,gasAction\)/);
assert.match(server,/async function swapRoster\(/);
assert.match(server,/async function swap20ReadList\(/);
assert.match(server,/swap20ListInflight\.has\(key\)/);
assert.match(server,/swap20InvalidateLists\(\)/);
assert.match(server,/async function swap20ManagerRequest/);
assert.match(server,/if\(!runtime\.isDev\)/);
assert.match(server,/await session\(req\)/);
assert.match(server,/originOk/);
assert.match(server,/gasAction==='externalswap20'/);
assert.match(entry,/rawAction==='externalswap20'/);
assert.match(entry,/V5_ENTRY_externalBridgeBody_\(e\)/);
assert.match(entry,/Swap20Bridge20_handle_/);
let env='DEV',roles=['Manager'],created=null;
const props={getProperty:k=>k==='AMS_ENV'?env:k==='V5_SSOT_SPREADSHEET_ID'?'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs':'NO',getProperties:()=>Object.fromEntries(Object.keys(stored).map(k=>['AMS_SWAP20_PROPOSAL_'+k,JSON.stringify(stored[k])]))};
const auditors=[['Email','Role','Active'],['manager@example.test','Manager','YES']];
const pair={eligible:true,
 auditA:{auditId:'A',revision:'rev-A',assignedTo:'a@example.test',blocks:[{date:'2026-11-01',start:'09:00',end:'11:00'}]},
 auditB:{auditId:'B',revision:'rev-B',assignedTo:'b@example.test',blocks:[{date:'2026-11-02',start:'09:00',end:'11:00'}]}};
const stored={};
const ctx={String,JSON,Date,Error,Array,Object,
 PropertiesService:{getScriptProperties:()=>props},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>auditors})})})},
 Swap20_readCanonicalPair:()=>pair,
 Swap20_scheduleExchange_:()=>({blocksA:pair.auditB.blocks,blocksB:pair.auditA.blocks,dateChanged:true,requiresAcknowledgement:true}),
 Swap20CanonicalCommitGuard:()=>({ok:true}),
 Swap20_recoveryStatus_:id=>({operationId:id,stage:'NOT_STARTED',sequence:0,requiresManualReview:false}),
 Swap20Store_read_:id=>stored[id]||null,
 Swap20_resolveAuditorUidForAudit_:id=>'auditor-'+id,
 Swap20ManagerCreateProposalAuthorized_:(input,actor)=>{
  created={...input,createdBy:actor.email,status:'AWAITING_ACKNOWLEDGEMENT'};
  stored[input.operationId]=created;
  return {success:true,operationId:input.operationId,status:created.status};
 },
 Swap20ManagerCommitAuthorized_:()=>({success:false,code:'SWAP_ATOMIC_WRITE_DISABLED',readOnly:true}),
 Swap20ManagerWithdrawProposalAuthorized_:()=>({success:true,status:'WITHDRAWN'})
};
runInNewContext(bridge,ctx);
const preview=ctx.Swap20Bridge20_handle_({actorEmail:'manager@example.test',operation:'preview',auditA:'A',auditB:'B'});
assert.equal(preview.ok,true);
assert.equal(preview.eligible,true);
assert.equal(preview.requiresAcknowledgement,true);
assert.equal(preview.readOnly,true);
assert.equal(created,null);
const req={actorEmail:'manager@example.test',operation:'propose',auditA:'A',auditB:'B',
 operationId:'SWAP20_test123',internalReason:'Planning shift',ecasComment:'ECAS updated slots'};
assert.equal(ctx.Swap20Bridge20_handle_({...req,ecasComment:''}).error,'SWAP_REASONS_REQUIRED');
const saved=ctx.Swap20Bridge20_handle_(req);
assert.equal(saved.ok,true);
assert.equal(saved.status,'AWAITING_ACKNOWLEDGEMENT');
assert.equal(saved.canonicalChanged,false);
assert.equal(created.createdBy,'manager@example.test');
assert.equal(ctx.Swap20Bridge20_handle_(req).idempotent,true);
assert.equal(ctx.Swap20Bridge20_handle_({actorEmail:req.actorEmail,operation:'getProposal',operationId:req.operationId}).status,'AWAITING_ACKNOWLEDGEMENT');
assert.equal(ctx.Swap20Bridge20_handle_({actorEmail:req.actorEmail,operation:'withdraw',operationId:req.operationId}).status,'WITHDRAWN');
assert.equal(ctx.Swap20Bridge20_handle_({...req,operation:'commit'}).status,'SWAP_ATOMIC_WRITE_DISABLED');
const managerList=ctx.Swap20Bridge20_handle_({actorEmail:'manager@example.test',operation:'listPending'});
assert.equal(managerList.ok,true);
assert.equal(managerList.items.length,1);
assert.equal(managerList.items[0].status,'AWAITING_ACKNOWLEDGEMENT');
assert.equal(managerList.attentionCount,0);
assert.throws(()=>ctx.Swap20Bridge20_handle_({...req,auditB:'A'}),/NOT_DISTINCT/);
auditors[1][1]='Auditor';
assert.throws(()=>ctx.Swap20Bridge20_handle_(req),/NOT_AUTHORIZED/);
auditors[1][1]='Manager';
env='PROD';
assert.throws(()=>ctx.Swap20Bridge20_handle_(req),/SWAP_DEV_ENV_OR_SSOT_MISMATCH/);
console.log('SWAP Manager Grid signed preview/proposal bridge: PASS');
