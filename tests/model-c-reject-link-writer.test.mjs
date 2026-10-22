import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const planner=readFileSync(new URL('../ModelCRejectLinkPlanner.js',import.meta.url),'utf8');
const writer=readFileSync(new URL('../ModelCRejectLinkWriter.js',import.meta.url),'utf8');
function makeSheet(rows,shouldFail=()=>false){
  return{rows,getDataRange(){return{getValues:()=>rows.map(r=>r.slice())}},
    getRange(r,c,n,m){return{getValues:()=>[rows[r-1].slice(c-1,c-1+m)],setValues:(v)=>{if(shouldFail(r))throw Error('TEST_WRITE_FAIL');rows[r-1]=v[0].slice();}}}
  };
}
function scenario(fail=()=>false){
 const links=makeSheet([['Audit_ID','Obligation_ID','Link_State','Migration_Batch_ID','Linked_At','Unlinked_At'],['A1','O1','ACTIVE','','',''],['A1','O2','ACTIVE','','',''],['A2','O3','ACTIVE','','','']],fail);
 const obs=makeSheet([['Obligation_ID','Obligation_State'],['O1','OPEN'],['O2','REJECTED'],['O3','OPEN']]);
 const ss={getSheetByName:n=>n==='Audit_Visit_Obligations'?links:n==='Audit_Obligations'?obs:null};
 const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss},Date});
 vm.runInContext(planner,ctx);vm.runInContext(writer,ctx);
 return{links,obs,ss,ctx};
}
let x=scenario();const original=JSON.stringify(x.obs.rows);
const closed=x.ctx.ModelCRejectLinkWriter_close_('A1',x.ss);
assert.equal(closed.success,true);assert.equal(closed.changed,2);assert.equal(x.links.rows[1][2],'INACTIVE');assert.equal(x.links.rows[2][2],'INACTIVE');assert.equal(x.links.rows[3][2],'ACTIVE');assert.equal(JSON.stringify(x.obs.rows),original);
const replay=x.ctx.ModelCRejectLinkWriter_close_('A1',x.ss);assert.equal(replay.idempotent,true);
assert.equal(x.ctx.ModelCRejectLinkWriter_rollback_(closed,x.links),true);assert.equal(x.links.rows[1][2],'ACTIVE');
x=scenario(r=>r===3);const failure=x.ctx.ModelCRejectLinkWriter_close_('A1',x.ss);assert.equal(failure.success,false);assert.equal(failure.rolledBack,true);assert.equal(x.links.rows[1][2],'ACTIVE');
console.log('MODEL_C_REJECT_LINK_WRITER: PASS');
