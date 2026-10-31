import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../ModelCAnnualCycleRuntime.js',import.meta.url),'utf8');
const slots=Array.from({length:20},(_,i)=>({slotKey:'SCOPE_'+String(i+1).padStart(2,'0'),scope:'Scope '+(i+1),flagCol0:i<8?2+i*2:null,hourCol0:i<8?3+i*2:null}));
const norm=s=>String(s).trim().toLowerCase();
const env={
 m5t_scopeSlotDefs_:()=>slots,
 m5t_scopeCanonicalName_:(ss,x)=>x==='NEW-09'?'Scope 9':x,
 ModelCFoundation_headerMap_:h=>Object.fromEntries(h.map((v,i)=>[norm(v),i])),
 ModelCFoundation_normHeader_:norm
};
runInNewContext(src,env);
const headers=['Audit ID','Status',...Array(16).fill('legacy'),'Scopes_List','Total audit time in hours','Planning window from','Planning window to','Assigned to'];
const row=['AUD-ORIGINAL','Accepted',...Array(16).fill(''),'',0,'','','prior@example.com'];
const group={planningWindowFrom:'2027-01-01',planningWindowTo:'2027-06-30',obligations:[{scopeCode:'NEW-09',formalHours:8,companyScopeId:'CS-09',baseExpiry:'2027-05-31'}]};
env.ModelCAnnualCycle_prepareLegacySuccessorRow_({},headers,row,group,[],'AUD-NEXT');
assert.equal(row[0],'AUD-NEXT');
assert.equal(row[1],'Pending Planning');
assert.equal(row[headers.indexOf('Scopes_List')],'Scope 9');
assert.equal(row[headers.indexOf('Total audit time in hours')],8);
assert.equal(row[headers.indexOf('Assigned to')],'');
assert.equal(row[2],'','Scope 09 must not be projected into legacy Scope 01');
assert.equal(row[3],'','Scope 09 must not be projected into legacy Duration 01');
assert.equal(row[headers.indexOf('Planning window from')],'2027-01-01');
const broken={...group,obligations:[{scopeCode:'UNREGISTERED',formalHours:8,companyScopeId:'CS-Z'}]};
assert.throws(()=>env.ModelCAnnualCycle_prepareLegacySuccessorRow_({},headers,row.slice(),broken,[],'AUD-Z'),/No Audit planning scope slot/);
console.log('Model C annual successor: headerless Scope 09 stays canonical, legacy 01-08 unchanged, unknown scope blocked');
