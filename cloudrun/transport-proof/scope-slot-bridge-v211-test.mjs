import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../AuditManagerToolsConfigScopes.js',import.meta.url),'utf8');
const catalog=(count)=>Array.from({length:count},(_,i)=>({slotKey:'SCOPE_'+String(i+1).padStart(2,'0'),displayName:'Scope '+(i+1),defaultHours:i+1,sortOrder:i+1}));
const headers=['Audit ID'];
for(let i=1;i<=20;i++){headers.push('SCOPE_'+String(i).padStart(2,'0'),'Duration SCOPE_'+String(i).padStart(2,'0'));}
let rows=catalog(20);
const sheet={getLastColumn:()=>headers.length,getRange:()=>({getValues:()=>[headers]})};
const ss={getSheetByName:(name)=>name==='Audit planning'?sheet:null};
const context={
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 ConfigScopes_GetCatalog:()=>({ok:true,rows}),
 m5t_toNumberOrZero_:(v)=>Number(v)||0,
 m5t_toIntOrNull_:(v)=>v==null?null:Number(v)
};
runInNewContext(source,context);
let defs=context.m5t_scopeSlotDefs_(ss);
assert.equal(defs.length,20);
assert.equal(defs[0].flagCol0,1);
assert.equal(defs[0].hourCol0,2);
assert.equal(defs[19].flagCol0,39);
assert.equal(defs[19].hourCol0,40);
rows=catalog(21);
assert.throws(()=>context.m5t_scopeSlotDefs_(ss),/MAX_20_EXCEEDED/);
rows=catalog(20);
rows[19].slotKey='SCOPE_21';
assert.throws(()=>context.m5t_scopeSlotDefs_(ss),/INVALID_SLOT/);
console.log('scope-slot-bridge-v211: 3 tests passed');
