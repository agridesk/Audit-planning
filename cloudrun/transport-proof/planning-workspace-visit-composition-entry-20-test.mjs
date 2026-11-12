import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import {managerVisitCompositionPage20} from './visit-composition-manager-page-20.mjs';
const root=new URL('../../',import.meta.url);
const server=readFileSync(new URL('PlanningWorkspaceVisitComposition20.js',root),'utf8');
const rpc=readFileSync(new URL('PlanningWorkspaceRpc.js',root),'utf8');
const html=readFileSync(new URL('PlanningWorkspace.html',root),'utf8');
const client=readFileSync(new URL('PlanningWorkspaceVisitComposition20.js.html',root),'utf8');
assert.match(html,/pwVisitComposition20/);
assert.match(html,/PlanningWorkspaceVisitComposition20\.js/);
assert.match(rpc,/function PlanningWorkspaceRpc_visitCompositionPreview/);
assert.match(client,/PlanningWorkspaceRpc_visitCompositionPreview/);
assert.match(client,/ams:visit-composition-selected/);
const runtime=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('./visit-composition-manager-page-20.mjs',import.meta.url),'utf8');
const existingWorkspace=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
assert.match(existingWorkspace,/id="visitCompositionLink"/);
assert.match(existingWorkspace,/actorRole\.toLowerCase\(\)==='manager'/);
assert.match(existingWorkspace,/compositionLink\.href='\/visit-composition\?auditId='/);
assert.match(runtime,/u\.pathname==='\/visit-composition'/);
assert.match(runtime,/u\.pathname==='\/api\/v1\/planning\/visit-composition-editor-context'/);
assert.match(runtime,/actor\?\.role!=='manager'/);
assert.match(runtime,/compositionWriteRequested\?createVisitCompositionAtomicService20/);
assert.match(runtime,/AMS_DEV_VISIT_COMPOSITION_WRITE_ENABLED/);
assert.match(editor,/visit-composition-atomic/);
assert.match(editor,/credentials:'same-origin'/);
assert.match(editor,/sourceRevisionAtomic/);
assert.match(editor,/scopeAllocations/);
assert.match(editor,/mode==='TOGETHER'\?'\/api\/v1\/planning\/direct-commit'/);
const rendered=managerVisitCompositionPage20();
const inline=/<script>([\s\S]*?)<\/script>/.exec(rendered);
assert.ok(inline);
new Script(inline[1],{filename:'visit-composition-editor-inline.js'});
assert.match(rendered,/source\.scopes\.reduce/);
assert.match(rendered,/Not recorded in Model C/);
assert.doesNotMatch(rendered,/undefined formal hours/);
const functionText=/function usableIsoDate\(x\)\{[\s\S]*?\n\}/.exec(inline[1])?.[0];
assert.ok(functionText,'Date normalization function must be present in rendered editor');
const dateVm={Date,Number,String};
runInNewContext(functionText+';this.normalizeDate=usableIsoDate',dateVm);
assert.equal(dateVm.normalizeDate('10/02/2027'),'2027-02-10');
assert.equal(dateVm.normalizeDate('2027-02-10'),'2027-02-10');
assert.equal(dateVm.normalizeDate('31/02/2027'),'');


assert.match(client,/Continue to secure Cloud Run planning/);
assert.match(client,/visit-composition\?auditId=/);
assert.doesNotMatch(client,/fetch\s*\([^)]*commit|PlanningWorkspaceRpc_batchCommit/);
const planning=[['Audit ID','Company_UID','Status'],['A1','C1','Pending Planning']];
const obligations=[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To'],
 ['OB1','C1','ABC','8','2027-07-01','2027-01-01','2027-06-30'],
 ['OB2','C1','GRASP','3','2027-07-01','2027-01-01','2027-06-30']];
const links=[['Audit_ID','Obligation_ID','Link_State'],['A1','OB1','ACTIVE'],['A1','OB2','ACTIVE']];
const scopes=[['ScopeCode','DisplayName'],['ABC','MPS-ABC'],['GRASP','GRASP']];
const tables={'Audit planning':planning,'Audit_Obligations':obligations,
 'Audit_Visit_Obligations':links,'Config_Scopes':scopes};
const context={
 Set,Map,Number,String,Array,Object,Error,RegExp,isNaN,
 V5_ENTRY_isDevEnv_:()=>true,
 V5_AUTH:{validateTrustedTokenByRole:(token,role,device)=>({
  ok:token==='signed-manager'&&role==='Manager'&&device==='device-1',email:'manager@example.test'})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='AMS_DEV_CLOUD_RUN_ORIGIN'?'https://ams-test.a.run.app':''})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>
  tables[name]?{getDataRange:()=>({getValues:()=>tables[name]})}:null})},
 PlanningRevisionTokenService_get:()=>({revision:'PRT1-'+''.padStart(40,'a')}),
 Utilities:{formatDate:x=>x.toISOString().slice(0,10)},
 Session:{getScriptTimeZone:()=> 'Europe/Amsterdam'}
};
runInNewContext(server,context,{filename:'PlanningWorkspaceVisitComposition20.js'});
const input={auditId:'A1',actorEmail:'manager@example.test',
 trustedToken:'signed-manager',deviceFingerprint:'device-1'};
let good=context.PlanningWorkspaceVisitComposition20_preview(input);
assert.equal(good.readOnly,true);
assert.equal(good.cloudOrigin,'https://ams-test.a.run.app');
assert.equal(good.canCommit,false);
assert.deepEqual(Array.from(good.compositionOptions),['TOGETHER','SEPARATELY']);
assert.equal(good.totalFormalHours,11);
assert.equal(good.scopes.length,2);
assert.throws(()=>context.PlanningWorkspaceVisitComposition20_preview({...input,trustedToken:'bad'}),
 /MANAGER_AUTH_REQUIRED/);
assert.throws(()=>context.PlanningWorkspaceVisitComposition20_preview({...input,actorEmail:'other@example.test'}),
 /MANAGER_IDENTITY_MISMATCH/);
context.V5_ENTRY_isTestBypass_=(email,role,token,device)=>email==='manager@example.test'&&
 role==='Manager'&&token==='dev-test-manager'&&device==='device-1';
const bypass=context.PlanningWorkspaceVisitComposition20_preview({...input,trustedToken:'dev-test-manager'});
assert.equal(bypass.readOnly,true);assert.equal(bypass.canCommit,false);
assert.throws(()=>context.PlanningWorkspaceVisitComposition20_preview({...input,trustedToken:'dev-test-manager',
 actorEmail:'other@example.test'}),/MANAGER_AUTH_REQUIRED/);
links.push(['ANOTHER','OB1','ACTIVE']);
assert.throws(()=>context.PlanningWorkspaceVisitComposition20_preview(input),/ACTIVE_LINK_CONFLICT/);
links.pop();
obligations[2][3]='';
let blocked=context.PlanningWorkspaceVisitComposition20_preview(input);
assert.equal(blocked.formalHoursComplete,false);
assert.equal(blocked.totalFormalHours,null);
console.log('VISIT_COMPOSITION_GAS_WORKSPACE_ENTRY_20_PASS: authenticated focused source, no boot read/write, correct scope identity and hours');
