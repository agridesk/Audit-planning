import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const scheduler=readFileSync(new URL('../../NotificationQueueAutoTrigger20.js',import.meta.url),'utf8');
assert.match(scheduler,/everyMinutes\(1\)/,'DEV 2-minute buffer requires 1-minute polling');
assert.match(scheduler,/ScriptApp\.deleteTrigger\(existing\[i\]\)/,'Reinstall existing managed sender trigger');
const start=src.indexOf('function ns_reservePending_(');
const end=src.indexOf('function ns_sendDueReserved_(',start);
assert.ok(start>=0&&end>start,'Sender reservation contract found');
const events=[];
const c={
  NS_DEFAULT_CONSOLIDATION_MINUTES:5,
  ns_parseReserved_:v=>{try{return JSON.parse(v||'{}')}catch{return {}}},
  ns_toMs_:v=>v instanceof Date?v.getTime():Date.parse(v),
  ns_isoCompact_:d=>d.toISOString(),
  Date,Number,String,JSON,Math,isFinite,
  NB_getEventConfig_:event=>event==='AUDIT_PLANNED_BY_MANAGER'?{sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:5,digestGroup:'AUDITOR_OPERATIONAL'}:{}
};
vm.runInNewContext(src.slice(start,end),c);
function testReserve(rows){
  const sheet={getRange:(r,col)=>({setValue(v){rows[r-1][col-1]=v;events.push([r,col]);}})};
  return c.ns_reservePending_(sheet,rows);
}
const config={sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:5,digestGroup:'AUDITOR_OPERATIONAL'};
const payload=()=>JSON.stringify({payload:{config}});
const startTime=Date.parse('2026-10-19T13:18:00Z');
const row=(time,recipient,audit)=>[new Date(time),'PENDING','AUDIT_PLANNED_BY_MANAGER',recipient,audit,'Company','','',0,'','','',payload()];
let rows=[['TimestampCreated','Status','Type','Recipient','Audit ID'],row(startTime,'info@agridesk.com','A'),row(startTime+120000,'info@agridesk.com','B')];
assert.equal(testReserve(rows),2);
let a=JSON.parse(rows[1][12]),b=JSON.parse(rows[2][12]);
assert.equal(a.groupKey,b.groupKey,'Two auditor messages within window must join one digest');
assert.equal(a.windowDueAtMs,startTime+300000,'Cannot send before buffer elapsed');
assert.equal(b.windowDueAtMs,a.windowDueAtMs);
rows.push(row(startTime+180000,'info@agridesk.com','C'));
assert.equal(testReserve(rows),1);
assert.equal(JSON.parse(rows[3][12]).groupKey,a.groupKey,'Later queue runner must reuse RESERVED digest window');
rows.push(row(startTime+180000,'david@agriqa.es','D'));
assert.equal(testReserve(rows),1);
assert.notEqual(JSON.parse(rows[4][12]).groupKey,a.groupKey,'Distinct auditors never combined');
rows.push(row(startTime+360000,'info@agridesk.com','E'));
assert.equal(testReserve(rows),1);
assert.notEqual(JSON.parse(rows[5][12]).groupKey,a.groupKey,'Outside rolling window starts a new digest');
rows.push([new Date(startTime+60000),'PENDING','AUDIT_PLANNED_BY_MANAGER','info@agridesk.com','STALE','','','',0,'','','',JSON.stringify({payload:{config:{consolidate:false,bufferMinutes:0,digestGroup:'DEFAULT'}}})]);
assert.equal(testReserve(rows),1);
assert.equal(JSON.parse(rows[6][12]).groupKey,a.groupKey,'Live Notification_Config overrides stale queue snapshot and joins existing rolling window');
// A digest must be per original auditor, not the DEV redirect destination.
const sameTime=Date.parse('2026-10-19T18:22:00Z');
const independent=[['TimestampCreated','Status','Type','Recipient','Audit ID'],
row(sameTime,'info@agridesk.com','PACO_1'),
row(sameTime+45000,'info@agridesk.com','PACO_2'),
row(sameTime+60000,'isalia@agriqa.es','ISALIA_1')];
assert.equal(testReserve(independent),3);
const keyFor=i=>JSON.parse(independent[i][12]).groupKey;
assert.equal(keyFor(1),keyFor(2),'DEV redirect must not split one auditor digest');
assert.notEqual(keyFor(1),keyFor(3),'DEV redirect must not merge distinct auditors');
assert.ok(events.length>0);
console.log('notification-rolling-digest-contract: PASS');
