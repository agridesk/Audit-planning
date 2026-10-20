import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const start=sender.indexOf('function ns_isWeeklyPreRenderedEnvelope20_(');
const end=sender.indexOf('function ns_sendDueReserved_(',start);
assert.ok(start>=0&&end>start,'Weekly envelope and reservation functions present');

const table=[
 ['EVENT_KEY','ACTIVE','SEND_EMAIL','LOG_ONLY'],
 ['WEEKLY_MANAGER_COMING_UP','YES','YES','NO'],
 ['WEEKLY_MANAGER_PENDING_PLANNING','NO','YES','NO'],
 ['WEEKLY_AUDITOR_COMING_UP','NO','YES','NO']
];
const testedLookups=[];
const ctx={
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>table})})})},
 ns_yesLike_:v=>['YES','TRUE','ON','1'].includes(String(v||'').toUpperCase()),
 ns_parseReserved_:v=>{try{return JSON.parse(v||'{}')}catch{return {}}},
 ns_toMs_:v=>new Date(v).getTime(),
 ns_isoCompact_:d=>d.toISOString(),
 NB_getEventConfig_:key=>{testedLookups.push(key);return {sendEmail:true,consolidate:true,bufferMinutes:5,digestGroup:'LIFECYCLE_MANAGER'}},
 NS_DEFAULT_CONSOLIDATION_MINUTES:1,
 Date,Number,String,JSON,Math,Array,Object,isFinite
};
vm.createContext(ctx);vm.runInContext(sender.slice(start,end),ctx);
assert.equal(ctx.ns_currentEmailPermissions_().WEEKLY_MANAGER_DIGEST,true);
assert.equal(ctx.ns_currentEmailPermissions_().WEEKLY_AUDITOR_DIGEST,false);
table[1][1]='NO';
assert.equal(ctx.ns_currentEmailPermissions_().WEEKLY_MANAGER_DIGEST,false,'Disabling all canonical Manager weekly notifications blocks legacy envelope');
table[1][1]='YES';
table[3][1]='YES';
assert.equal(ctx.ns_currentEmailPermissions_().WEEKLY_AUDITOR_DIGEST,true);
table[3][1]='NO';

function weeklyRow(recipient){
 return [new Date('2026-10-20T06:00:00Z'),'PENDING','WEEKLY_MANAGER_DIGEST',recipient,'','','','',0,'','','',
 JSON.stringify({payload:{config:{sendEmail:true,consolidate:false,bufferMinutes:0,digestGroup:'MANAGER_WEEKLY'},weeklyPreRendered:{subject:'Weekly overview',body:'Weekly overview'}}})];
}
const rows=[['header'],weeklyRow('manager.one@example.org'),weeklyRow('manager.two@example.org')];
const sheet={getRange:(r,c)=>({setValue:v=>{rows[r-1][c-1]=v}})};
assert.equal(ctx.ns_reservePending_(sheet,rows),2);
const r1=JSON.parse(rows[1][12]),r2=JSON.parse(rows[2][12]);
assert.equal(r1.windowDueAtMs-r1.windowStartAtMs,0,'Pre-aggregated weekly digest is not buffered again');
assert.equal(r2.windowDueAtMs-r2.windowStartAtMs,0);
assert.notEqual(r1.groupKey,r2.groupKey,'Weekly mail cannot cross original recipients');
assert.equal(testedLookups.filter(x=>x==='WEEKLY_MANAGER_DIGEST').length,0,'Unknown legacy envelope must not resolve default config');
console.log('notification-weekly-envelope-20: PASS');
