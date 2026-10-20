import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const config=readFileSync(new URL('../../NotificationConfig.js',import.meta.url),'utf8');
function extract(name,next){
  const begin=sender.indexOf('function '+name+'('),end=sender.indexOf('function '+next+'(',begin+1);
  assert.ok(begin>=0&&end>begin,name+' missing');
  return sender.slice(begin,end);
}
const source=[
  extract('ns_isWeeklyPreRenderedEnvelope20_','ns_currentEmailPermissions_'),
  extract('ns_reservePending_','ns_computeReservation_'),
  extract('ns_computeReservation_','ns_isRollingExternalDigestGroup_'),
  extract('ns_isRollingExternalDigestGroup_','ns_sendDueReserved_')
].join('\n');
const ctx={
  NS_DEFAULT_CONSOLIDATION_MINUTES:5,
  ns_parseReserved_:x=>{try{return JSON.parse(x||'{}')}catch{return {}}},
  ns_toMs_:x=>Date.parse(String(x)),
  ns_isoCompact_:d=>d.toISOString(),
  Date,Math,JSON,String,Number,isFinite
};
vm.createContext(ctx);vm.runInContext(source,ctx);
const t=Date.parse('2026-10-18T16:52:00Z');
function item(minute,recipient,group='AUDITOR_OPERATIONAL'){
  const payload={config:{consolidate:true,bufferMinutes:5,digestGroup:group,sendEmail:true}};
  return [new Date(t+minute*60000).toISOString(),'PENDING','AUDIT_PLANNED_BY_MANAGER',recipient,'AUD_'+minute,'Company','','',0,'','','',JSON.stringify({payload})];
}
const rows=[['Created','Status','Event','Recipient'],item(0,'auditor@example.org'),item(4,'auditor@example.org'),item(4,'different@example.org'),item(6,'auditor@example.org'),item(4,'manager@example.org','MANAGER_APPROVAL')];
const sheet={getRange(row,col){return{setValue(value){rows[row-1][col-1]=value}}}};
assert.equal(ctx.ns_reservePending_(sheet,rows),5);
const reservation=i=>JSON.parse(rows[i][12]);
assert.equal(reservation(1).groupKey,reservation(2).groupKey,'same recipient within rolling window consolidates');
assert.notEqual(reservation(1).groupKey,reservation(3).groupKey,'original recipient separation');
assert.notEqual(reservation(1).groupKey,reservation(4).groupKey,'after five-minute window uses a fresh digest');
assert.notEqual(reservation(1).groupKey,reservation(5).groupKey,'manager and auditor isolation');
assert.equal(reservation(1).windowDueAtMs-reservation(1).windowStartAtMs,300000);
assert.match(config,/if \(eventKey === 'AUDIT_PLANNED_BY_AUDITOR'\)[\s\S]*?consolidate: true,[\s\S]*?bufferMinutes: 5/);
assert.match(config,/if \(eventKey === 'AUDIT_PLANNED_BY_MANAGER'\)[\s\S]*?consolidate: true,[\s\S]*?bufferMinutes: 5/);

// Regression: current Notification_Config overrides stale queued payload snapshots.
const liveRows=[['Created','Status','Event','Recipient'],item(0,'auditor@example.org')];
ctx.NB_getEventConfig_=(key)=>key==='AUDIT_PLANNED_BY_MANAGER'
 ? {consolidate:true,bufferMinutes:2,digestGroup:'AUDITOR_OPERATIONAL',sendEmail:true}
 : null;
assert.equal(ctx.ns_reservePending_({getRange(row,col){return{setValue(value){liveRows[row-1][col-1]=value}}}},liveRows),1);
const liveReservation=JSON.parse(liveRows[1][12]);
assert.equal(liveReservation.windowDueAtMs-liveReservation.windowStartAtMs,120000,'live 2-minute digest overrides stale 5-minute queue snapshot');
const zeroRows=[['Created','Status','Event','Recipient'],item(0,'auditor@example.org')];
ctx.NB_getEventConfig_=()=>({consolidate:true,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',sendEmail:true});
assert.equal(ctx.ns_reservePending_({getRange(row,col){return{setValue(value){zeroRows[row-1][col-1]=value}}}},zeroRows),1);
const zeroReservation=JSON.parse(zeroRows[1][12]);
assert.equal(zeroReservation.windowDueAtMs,zeroReservation.windowStartAtMs,'zero buffer is immediate and not coerced to a default');

// Dashboard change 10 -> 9 minutes: newly queued work uses nine minutes.
const nineRows=[['Created','Status','Event','Recipient'],item(0,'auditor@example.org')];
ctx.NB_getEventConfig_=()=>({consolidate:true,bufferMinutes:9,digestGroup:'AUDITOR_OPERATIONAL',sendEmail:true});
assert.equal(ctx.ns_reservePending_({getRange(row,col){return{setValue(value){nineRows[row-1][col-1]=value}}}},nineRows),1);
const nineReservation=JSON.parse(nineRows[1][12]);
assert.equal(nineReservation.windowDueAtMs-nineReservation.windowStartAtMs,540000,'Dashboard buffer of nine minutes takes effect on new PENDING rows');
// Existing RESERVED due times must stay intact when config subsequently changes.
ctx.NB_getEventConfig_=()=>({consolidate:true,bufferMinutes:10,digestGroup:'AUDITOR_OPERATIONAL',sendEmail:true});
assert.equal(ctx.ns_reservePending_({getRange(row,col){return{setValue(value){nineRows[row-1][col-1]=value}}}},nineRows),0);
assert.equal(JSON.parse(nineRows[1][12]).windowDueAtMs,nineReservation.windowDueAtMs,'Changing buffer does not retroactively shift existing RESERVED deliveries');
console.log('notification-batching-window-20: PASS');
