import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSwapDevAuditSources,validateSwapRuntimeAuditIds} from './swap-dev-backfill-cli-20.mjs';

const ids=[
 'AUD_FernandezMoreno-Mate_HQ_1777531729292_30',
 'AUD_CULTIUSMOMPSL_1789994541934_D0H9',
 'AUD_HORTICULTURAVINY_1789994546083_KCHG'
];
assert.deepEqual(validateSwapRuntimeAuditIds(ids),ids);
assert.throws(()=>validateSwapRuntimeAuditIds([]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds([...ids,...ids,...ids,...ids]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds([ids[0],ids[0]]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds(['AUD_BAD/ID']),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});

const auditRows=[
 ['Audit ID','Status','Planning JSON','Assigned to'],
 ['AUD_A1','Accepted',JSON.stringify({blocks:[{date:'2026-10-25',start:'09:00',end:'11:00'}]}),'a@example.test'],
 ['AUD_A2','Approved',JSON.stringify({blocks:[{date:'2026-10-26',start:'09:00',end:'11:00'}]}),'a@example.test']
];
const availabilityRows=[
 ['Date','Auditor_Email','Audit_ID_1','Audit_ID_2','First_Audit_Start_Time','First_Audit_End_Time','Second_Audit_Start_Time','Second_Audit_End_Time'],
 ['2026-10-25','a@example.test','AUD_A1','','09:00','11:00','','']
];
async function inspect(auditIds,existingDocuments=new Set()){
 const originalFetch=globalThis.fetch,calls=[];
 const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method||'GET';
  calls.push({url:String(url),method});
  assert.equal(method,'GET','audit payload preview must not issue Firestore writes');
  if(String(url).includes('sheets.googleapis.com')){
   const range=decodeURIComponent(String(url).split('/values/')[1]);
   return response(200,{values:range.includes('Audit planning')?auditRows:availabilityRows});
  }
  const match=/\/documents\/(ams_swap20_dev_(?:audits|availability))\/([^/?]+)/.exec(String(url));
  assert.ok(match,'unexpected preview request: '+url);
  const key=match[1]+'/'+decodeURIComponent(match[2]);
  if(!existingDocuments.has(key))return response(404,{});
  return response(200,{name:'projects/audit-management-system-dev/databases/(default)/documents/'+key,
   fields:{payload:{stringValue:JSON.stringify({status:'Accepted',plannedBlocks:[],reservations:[]})}}});
 };
 try{
  return {result:await inspectSwapDevAuditSources({getToken:async()=>'service-token',project:'audit-management-system-dev',
   spreadsheet:'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',auditIds}),calls};
 }finally{globalThis.fetch=originalFetch;}
}

const preview=await inspect(['AUD_A1']);
const eligible=preview.result.audits[0];
assert.equal(eligible.eligible,true);
assert.deepEqual(eligible.payloadPreview,{
 status:'READY',reason:null,proposedDocuments:[
  {name:'projects/audit-management-system-dev/databases/(default)/documents/ams_swap20_dev_audits/AUD_A1',
   fields:{payload:{stringValue:JSON.stringify({auditId:'AUD_A1',status:'Accepted',assignedTo:'a@example.test',
    plannedBlocks:[{date:'2026-10-25',start:'09:00',end:'11:00'}]})}}},
  {name:'projects/audit-management-system-dev/databases/(default)/documents/ams_swap20_dev_availability/AUD_A1',
   fields:{payload:{stringValue:JSON.stringify({auditId:'AUD_A1',reservations:[{date:'2026-10-25',owner:'a@example.test',
    start:'09:00',end:'11:00',auditId:'AUD_A1',status:'Accepted'}]})}}}
 ],createOnly:true,writeAuthorized:false,executionAuthorized:false,writePerformed:false
});
assert.ok(preview.calls.every(call=>call.method==='GET'));
assert.equal(preview.result.readOnly,true);
assert.equal(preview.result.writeAuthorized,false);
assert.equal(preview.result.cutoverAuthorized,false);

const ineligible=(await inspect(['AUD_A2'])).result.audits[0];
assert.equal(ineligible.eligible,false);
assert.equal(ineligible.payloadPreview.reason,'AUDIT_NOT_ELIGIBLE');
assert.deepEqual(ineligible.payloadPreview.proposedDocuments,[]);

for(const existing of ['ams_swap20_dev_audits/AUD_A1','ams_swap20_dev_availability/AUD_A1']){
 const blocked=(await inspect(['AUD_A1'],new Set([existing]))).result.audits[0];
 assert.equal(blocked.payloadPreview.status,'BLOCKED');
 assert.equal(blocked.payloadPreview.reason,'DOCUMENT_ALREADY_EXISTS');
 assert.deepEqual(blocked.payloadPreview.proposedDocuments,[]);
}

const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const routeStart=server.indexOf("if(req.method==='GET'&&u.pathname==='/api/v1/manager/swap20/audit-reconciliation'){");
assert.notEqual(routeStart,-1,'manager audit reconciliation route must exist');
const route=server.slice(routeStart,server.indexOf("\n  if(req.method",routeStart+1));
assert.match(route,/if\(!runtime\.isDev\)/);
assert.match(route,/actor\?\.role!=='manager'/);
assert.match(route,/inspectSwapDevAuditSources\(\{getToken,project,spreadsheet,auditIds:u\.searchParams\.getAll\('auditId'\)\}\)/);
assert.match(route,/result=\{ok:true,revision:process\.env\.K_REVISION\|\|'UNAVAILABLE',\.\.\.inspection\}/);
assert.match(route,/res\.end\(JSON\.stringify\(result\)\)/);
console.log('SWAP runtime audit inspection validation, route passthrough, and read-only payload previews passed');
