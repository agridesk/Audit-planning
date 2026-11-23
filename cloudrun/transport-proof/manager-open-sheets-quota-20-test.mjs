import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildPlanningValuesFromAudits20,scopeDefaultHours20} from './planning-firestore-grid-projection-20.js';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r9=readFileSync(new URL('./server-r9.js',import.meta.url),'utf8');
const route=r4.split('\n').find(line=>line.includes("if(u.pathname==='/api/v1/manager/open'&&req.method==='GET')"));
assert.ok(route,'manager open route is present');
const r4Functions=r4.slice(r4.indexOf('function managerR9PlanningSnapshot20('),r4.indexOf('async function managerEnrichmentSource20('));
const r9Helpers=r9.slice(r9.indexOf('function clean('),r9.indexOf('async function readRaw('));
const r9Enrichment=r9.slice(r9.indexOf('async function enrichManagerOpen('),r9.indexOf('function combinedRequest('));
const r9Proxy=r9.slice(r9.indexOf('function combinedRequest('),r9.indexOf('http.createServer('));
const secret='test-internal-secret-at-least-32-characters';
const clean=value=>String(value==null?'':value).trim();
const key=value=>clean(value).toLowerCase().replace(/\s+/g,'_');
const col=(headers,names)=>{
 const by={};
 headers.forEach((value,index)=>{const k=key(value);if(k&&by[k]===undefined)by[k]=index;});
 for(const name of names){const k=key(name);if(by[k]!==undefined)return by[k];}
 return -1;
};

const header=Array(52).fill('');
header[0]='Audit ID';header[3]='Planning JSON';header[51]='Outside AX';
const row=(id,planning)=>[id,'','',planning];
let planningRows=[header,row('visit-1','{"totalPlannedHours":3.25}'),
 row('visit-1','{"blocks":[{"hours":2}]}'),row('visit-2','invalid JSON')];
while(planningRows.length<482)planningRows.push([]);
planningRows.push(row('visit-483','{"totalPlannedHours":4.5}'));
planningRows.push(row('visit-484','{"totalPlannedHours":7}'));
const gridRows=['visit-1','visit-2','visit-483','visit-484'].map(auditId=>({auditId,hoursPlanned:'',scopes:[]}));

let sheetsReads=0,fallbackReads=0,forceSheetsError=false,identity=null,lastForwarded=null,responseOverride=null,gridAuditSource=null,lastPlanningValues=null;
const r4Context={
 process:{env:{AMS_RUNTIME_ENV:'DEV',K_SERVICE:'ams-fase12-dev'}},
 SESSION_SECRET:secret,BUILD:'test',Date:{now:()=>1000},URL,clean,key,col,console:{warn:()=>{}},
 firestoreGridAuditSource20:()=>gridAuditSource,buildPlanningValuesFromAudits20,scopeDefaultHours20,
 sessionConfigured:()=>secret.length>=32,safeEq:(a,b)=>a===b,
 scopeCatalog:()=>[],gridScopeStyles20:()=>({}),extensionMonthsForScopes:()=>0,
 directAuditorDisplayName:()=>'',managerOpen:values=>{lastPlanningValues=values;return {success:true,rows:structuredClone(gridRows)};},
 auditorOpenRead:async()=>({success:true,actorRole:'Auditor',rows:structuredClone(gridRows)}),
 sessionFromRequestValidated:async req=>req.identity,
 sheetsBatchGet:async ranges=>{
  sheetsReads++;
  if(gridAuditSource){
   assert.deepEqual(Array.from(ranges),['Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:Z256'],'Firestore Grid skips the Audit planning read');
   return [{values:[['SlotKey','Default_hours']]},{values:[]},{values:[]}];
  }
  assert.deepEqual(Array.from(ranges),['Audit planning!A1:BW2000','Config_Scopes!A1:Z128',
   'Companies!A1:AZ1024','Auditors!A1:Z256']);
  if(forceSheetsError)throw Error('SHEETS_API_429');
  return [{values:structuredClone(planningRows)},{values:[]},{values:[]},{values:[]}];
 },
 send:(res,status,body)=>{res.status=status;res.body=body;return body;}
};
vm.runInNewContext(r4Functions+`
 async function runRoute(req,res){const u=new URL(req.url,'http://localhost');${route}}
 this.runRoute=runRoute;
 this.managerR9PlanningSnapshot20=managerR9PlanningSnapshot20;
 this.managerGridSnapshotRequested20=managerGridSnapshotRequested20;
`,r4Context);

function originalR9Rows(values){
 const result=values.slice(0,483).map(x=>x.slice(0,50));
 while(result.length&&!result.at(-1).some(value=>value!==''&&value!=null))result.pop();
 return result;
}
function response(status,payload,contentType='application/json'){
 const bytes=Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload));
 return {ok:status>=200&&status<300,status,
  headers:{forEach(fn){fn(contentType,'content-type');},get:()=>contentType,getSetCookie:()=>[]},
  arrayBuffer:async()=>bytes};
}
const r9Context={
 process:{env:{AMS_RUNTIME_ENV:'DEV',K_SERVICE:'ams-fase12-dev',AMS_SESSION_SIGNING_SECRET:secret}},
 URL,Buffer,BUILD:'test',INNER_PORT:3000,
 auditPlanningRows:async()=>{fallbackReads++;return originalR9Rows(planningRows);},
 fetch:async(target,init)=>{
  lastForwarded=init;
  assert.equal(init.method,'GET');
  if(responseOverride)return responseOverride;
  const inner={};
  await r4Context.runRoute({url:new URL(target).pathname,method:init.method,headers:init.headers,identity},inner);
  return response(inner.status,inner.body);
 }
};
vm.runInNewContext(r9Helpers+r9Enrichment+r9Proxy+';this.proxy=proxy;',r9Context);

async function request({mode='DEV',service='ams-fase12-dev',actor={role:'Manager',email:'manager@example.test'},override=null}={}){
 sheetsReads=0;fallbackReads=0;forceSheetsError=false;identity=actor;responseOverride=override;
 r4Context.process.env.AMS_RUNTIME_ENV=mode;r4Context.process.env.K_SERVICE=service;
 r9Context.process.env.AMS_RUNTIME_ENV=mode;r9Context.process.env.K_SERVICE=service;
 const result={};
 const res={writeHead(status,headers){result.status=status;result.headers=headers;},
  end(body){result.raw=String(body);result.body=JSON.parse(result.raw);}};
 await r9Context.proxy({url:'/api/v1/manager/open',method:'GET',headers:{
  cookie:'session=test','x-ams-r9-grid-snapshot':'forged','x-ams-internal-secret':'forged'
 }},res,'');
 return {...result,sheetsReads,fallbackReads,forwarded:lastForwarded};
}

const dev=await request();
assert.equal(dev.status,200);
assert.equal(dev.sheetsReads,1);
assert.equal(dev.fallbackReads,0,'The manager grid must not reread planning from Sheets');
assert.equal(dev.forwarded.headers.cookie,'session=test');
assert.equal(dev.forwarded.headers['x-ams-r9-grid-snapshot'],'1');
assert.equal(dev.forwarded.headers['x-ams-internal-secret'],secret);
assert.ok(!dev.raw.includes('_r9PlanningRows20'));
assert.ok(!dev.raw.includes(secret));
assert.equal(dev.body.rows[0].hoursPlanned,2,'Duplicate IDs retain the existing last-row behavior');
assert.equal(dev.body.rows[1].hoursPlanned,'');
assert.equal(dev.body.rows[2].hoursPlanned,4.5);
assert.equal(dev.body.rows[3].hoursPlanned,'','Rows after 483 remain outside the legacy enrichment');

const legacy=await request({mode:'PROD'});
assert.equal(legacy.sheetsReads,1);
assert.equal(legacy.fallbackReads,1);
assert.equal(legacy.forwarded.headers['x-ams-r9-grid-snapshot'],undefined);
assert.equal(legacy.forwarded.headers['x-ams-internal-secret'],undefined);
assert.deepEqual(dev.body,legacy.body,'The same Sheets snapshot must produce the existing grid payload');

planningRows[2]=row('visit-1','{"totalPlannedHours":8}');
const fresh=await request();
assert.equal(fresh.body.rows[0].hoursPlanned,8,'Each manager request must read fresh source data');
assert.equal(fresh.sheetsReads,1);
assert.equal(fresh.fallbackReads,0);

const auditor=await request({actor:{role:'Auditor',email:'auditor@example.test'}});
assert.equal(auditor.body.actorRole,'Auditor');
assert.equal(auditor.sheetsReads,0);
assert.equal(auditor.fallbackReads,1,'Auditor reads retain the previous path');
assert.ok(!auditor.raw.includes('_r9PlanningRows20'));
const otherService=await request({service:'another-dev-service'});
assert.equal(otherService.fallbackReads,1,'The optimization is limited to the intended DEV service');

const privateHeaders={'x-ams-r9-grid-snapshot':'1','x-ams-internal-secret':secret};
const direct=async(actor,headers=privateHeaders)=>{
 const result={};
 await r4Context.runRoute({url:'/api/v1/manager/open',method:'GET',headers,identity:actor},result);
 return result;
};
r4Context.process.env.AMS_RUNTIME_ENV='DEV';r4Context.process.env.K_SERVICE='ams-fase12-dev';
let result=await direct(null);
assert.equal(result.status,401);
result=await direct({role:'Viewer',email:'viewer@example.test'});
assert.equal(result.status,403);
result=await direct({role:'Manager',email:'manager@example.test'},{...privateHeaders,'x-ams-internal-secret':'wrong'});
assert.ok(!Object.hasOwn(result.body,'_r9PlanningRows20'));
result=await direct({role:'Auditor',email:'auditor@example.test'});
assert.ok(!Object.hasOwn(result.body,'_r9PlanningRows20'));
result=await direct({role:'Manager',email:'manager@example.test'});
assert.ok(Array.isArray(result.body._r9PlanningRows20));
r4Context.process.env.AMS_RUNTIME_ENV='PROD';
result=await direct({role:'Manager',email:'manager@example.test'});
assert.ok(!Object.hasOwn(result.body,'_r9PlanningRows20'));

const pastAx=Array(51).fill('');pastAx[0]='Audit ID';pastAx[50]='Planning JSON';
const pastAxData=Array(51).fill('');pastAxData[0]='visit';pastAxData[50]='{"totalPlannedHours":9}';
const limited=r4Context.managerR9PlanningSnapshot20([pastAx,pastAxData]);
assert.equal(limited[1][1],'','Planning JSON beyond AX must not enter the legacy enrichment');
const beyondOnly=Array(51).fill('');beyondOnly[50]='outside range';
assert.equal(r4Context.managerR9PlanningSnapshot20([['Audit ID'],beyondOnly]).length,1);
assert.throws(()=>r4Context.managerR9PlanningSnapshot20([['Audit ID'],null]),/MANAGER_GRID_SNAPSHOT_SOURCE_INVALID/);

// Firestore Grid source (DEV flag in r15): rows come from Firestore snapshots; any failure falls back to Sheets.
r4Context.process.env.AMS_RUNTIME_ENV='DEV';
gridAuditSource=async()=>[{auditId:'fs-1',revision:0,snapshot:{auditId:'fs-1',sourceRow:3,headers:['Audit ID','Status'],row:['fs-1','Approved']}}];
result=await direct({role:'Manager',email:'manager@example.test'},{});
assert.equal(result.body.gridSource,'FIRESTORE');
assert.deepEqual(lastPlanningValues,[['Audit ID','Status'],[],['fs-1','Approved']],'Firestore rows keep their sheet position');
gridAuditSource=async()=>{throw Error('GRID_FIRESTORE_SCAN_TRUNCATED');};
const fallbackSource=gridAuditSource;
r4Context.sheetsBatchGet=(original=>async ranges=>{if(ranges.length===3)return original(ranges);gridAuditSource=null;try{return await original(ranges);}finally{gridAuditSource=fallbackSource;}})(r4Context.sheetsBatchGet);
result=await direct({role:'Manager',email:'manager@example.test'},{});
assert.equal(result.body.gridSource,'SHEETS_FALLBACK');
assert.equal(lastPlanningValues[0][0],'Audit ID');assert.equal(lastPlanningValues.length,planningRows.length);
gridAuditSource=null;

await assert.rejects(()=>request({override:response(200,{success:true,rows:gridRows})}),/MANAGER_GRID_SNAPSHOT_REQUIRED/);
await assert.rejects(()=>request({override:response(200,{success:true,rows:gridRows,_r9PlanningRows20:{}})}),/MANAGER_GRID_SNAPSHOT_INVALID/);
await assert.rejects(()=>request({override:response(200,'null')}),/MANAGER_GRID_SNAPSHOT_RESPONSE_INVALID/);
const failure=await request({override:response(500,{ok:false,error:'OPEN_GRID_READ_FAILED',detail:'SHEETS_API_429'})});
assert.equal(failure.status,500);
assert.equal(failure.fallbackReads,0,'A failed first read must not trigger another Sheets request');
console.log('PASS DEV manager open reuses one fresh Sheets batch, preserves payload and guards internal data');
