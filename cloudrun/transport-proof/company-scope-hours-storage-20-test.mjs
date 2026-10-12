import assert from 'node:assert/strict';
import {companyHoursStorage20 as storage,COMPANY_SCOPE_HOURS_HEADERS as headers} from './company-scope-hours-storage-20.js';
let requests=[],metadata={sheets:[]};
globalThis.fetch=async(url,options={})=>{
 if(url.includes('?fields='))return{ok:true,json:async()=>metadata};
 if(url.endsWith(':batchUpdate')){requests=JSON.parse(options.body).requests;return{ok:true,json:async()=>({replies:[{addSheet:{properties:{sheetId:requests[0].addSheet.properties.sheetId}}}]})};}
 throw Error('UNEXPECTED_NETWORK_REQUEST');
};
const deps={SID:'dev-only',accessToken:async()=> 'token',sheetsBatchGet:async()=>[{values:[headers]}]};
assert.equal((await storage({...deps,method:'GET'})).ready,false);
await assert.rejects(storage({...deps,method:'POST',body:{}}),/CONFIRMATION_REQUIRED/);
const created=await storage({...deps,method:'POST',body:{confirmation:'CREATE_COMPANY_SCOPE_HOURS_TAB'}});
assert.equal(created.created,true);assert.equal(requests.length,2);assert.equal(requests[0].addSheet.properties.title,'Company_Scope_Hours');
assert.equal(requests[1].updateCells.rows[0].values.length,13);
metadata={sheets:[{properties:{title:'Company_Scope_Hours',sheetId:99}}]};
assert.equal((await storage({...deps,method:'GET'})).ready,true);
await assert.rejects(storage({...deps,method:'GET',sheetsBatchGet:async()=>[{values:[['Wrong']]}]}),/SCHEMA_MISMATCH/);
console.log('company-scope-hours-storage-20: 7 checks passed');
