import assert from 'node:assert/strict';
import {buildNewModelCObligationWithHours20} from './model-c-new-obligation-provenance-20.js';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';
const headers=['Obligation_ID','Company_UID','ScopeCode','Obligation_State','Formal_Hours','Formal_Hours_Source','Scope_Version_ID','Company_Hours_Override_ID','Company_Hours_Override_Revision','Hours_Resolved_At'];
const obligation={Obligation_ID:'OBL-SUCCESSOR-001',Company_UID:'C-01',ScopeCode:'SCOPE-CODE-09',Obligation_State:'OPEN'};
const make=(overrides=[])=>buildNewModelCObligationWithHours20({
 headers,obligation,companyId:'C-01',scopeCode:'SCOPE-CODE-09',effectiveDate:'2027-01-15',now:'2026-10-31T13:00:00.000Z',
 companyScopes:[{Company_UID:'C-01',ScopeCode:'SCOPE-CODE-09',Active:'YES'}],
 scopeVersions:[{ScopeCode:'SCOPE-CODE-09',Status:'CURRENT',VersionId:'SCOPE-VERSION-2027',Hours_to_plan:'8',Effective_From:'2027-01-01'}],overrides
});
const baseline=make(),overridden=make([{OverrideId:'OV-C01-09',Company_UID:'C-01',ScopeCode:'SCOPE-CODE-09',Status:'ACTIVE',Revision:'3',Hours:'6'}]);
assert.equal(overridden.snapshot.Formal_Hours,6);
assert.equal(baseline.snapshot.Formal_Hours,8);
const sheetRows=[headers],calls=[];
const mockFetch=async(url,init={})=>{
 const u=new URL(url),method=init.method||'GET';calls.push({method,url:u.toString()});
 if(method==='GET')return {ok:true,json:async()=>({values:structuredClone(sheetRows)})};
 if(method==='POST'){assert.equal(u.searchParams.get('valueInputOption'),'RAW');sheetRows.push(...JSON.parse(init.body).values);return {ok:true,json:async()=>({updates:{updatedRows:1}})};}
 throw Error('UNEXPECTED_METHOD');
};
let fence=0;
const projector=createPlanningSheetsAppendProjector({spreadsheetId:'fixture',getToken:async()=> 'mock',fetchImpl:mockFetch,verifyFence:async()=>{fence++}});
const intent=[{range:'Audit_Obligations!A:J',values:[overridden.row]}];
assert.equal((await projector.inspect(intent)).state,'MISSING');
assert.equal((await projector.apply({operationId:'op-succ',gateToken:'token',intents:intent})).confirmed,true);
assert.equal((await projector.apply({operationId:'op-succ',gateToken:'token',intents:intent})).replayed,true);
assert.equal(calls.filter(x=>x.method==='POST').length,1);
assert.deepEqual(sheetRows[1],overridden.row);
assert.equal(sheetRows[1][headers.indexOf('Scope_Version_ID')],'SCOPE-VERSION-2027');
assert.equal(sheetRows[1][headers.indexOf('Company_Hours_Override_Revision')],'3');
assert.equal(sheetRows[1][headers.indexOf('Hours_Resolved_At')],'2026-10-31T13:00:00.000Z');
assert.ok(fence>3);
console.log('Model C new-obligation provenance flows through gated RAW outbox exactly once and retains snapshot');
