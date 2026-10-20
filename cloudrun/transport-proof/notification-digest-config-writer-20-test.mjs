import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../../NotificationManagement20.js',import.meta.url),'utf8');
const start=src.indexOf('function NotificationManagement20_UpdateDigestBuffer(');
const end=src.indexOf('/** Manager-controlled DEV mail mode',start);
assert.ok(start>=0&&end>start,'Canonical buffer writer found');

let environment='DEV',buffer=10,locks=0,cacheClears=0,builderClears=0;
const changes=[];
const configSheet={
 getDataRange:()=>({getValues:()=>[['EVENT_KEY','BUFFER_MINUTES'],['AUDIT_ACCEPTED',buffer]]}),
 getRange:(row,col)=>({setValue:value=>{
  assert.equal(row,2);assert.equal(col,2);
  buffer=value;
 }})
};
const logSheet={appendRow:entry=>changes.push(entry)};
const context={
 SYS_getEnv_:()=>environment,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({
  getSheetByName:name=>name==='Notification_Config'?configSheet:name==='Notification_Change_Log'?logSheet:null
 })},
 LockService:{getScriptLock:()=>({
  tryLock:()=>{locks++;return true},
  releaseLock:()=>{locks--}
 })},
 NotificationConfig_ClearCache:()=>{cacheClears++},
 NB_InvalidateConfigCache:()=>{builderClears++},
 Date,Number,String,Object,Array,Math,Error,isFinite
};
vm.createContext(context);
vm.runInContext(src.slice(start,end),context);
const update=context.NotificationManagement20_UpdateDigestBuffer;
const saved=update('AUDIT_ACCEPTED',2,10,'manager@example.org');
assert.equal(saved.ok,true);
assert.equal(saved.changed,1);
assert.equal(saved.bufferMinutes,2);
assert.equal(buffer,2);
assert.equal(changes.length,1);
assert.equal(changes[0][3],'BUFFER_MINUTES');
assert.equal(cacheClears,1);
assert.equal(builderClears,1);
assert.equal(update('AUDIT_ACCEPTED',2,2,'manager@example.org').changed,0,'No-op must not write or log');
assert.equal(changes.length,1);
assert.throws(()=>update('AUDIT_ACCEPTED',5,10,'manager@example.org'),/CONFIG_CHANGED_RELOAD_REQUIRED/);
assert.throws(()=>update('AUDIT_ACCEPTED',-1,2,'manager@example.org'),/INVALID_BUFFER_MINUTES/);
assert.throws(()=>update('AUDIT_ACCEPTED',1.5,2,'manager@example.org'),/INVALID_BUFFER_MINUTES/);
assert.throws(()=>update('UNKNOWN_EVENT',5,2,'manager@example.org'),/EVENT_NOT_FOUND/);
assert.throws(()=>update('AUDIT_ACCEPTED',5,2,'invalid-actor'),/ACTOR_INVALID/);
environment='PROD';
assert.throws(()=>update('AUDIT_ACCEPTED',5,2,'manager@example.org'),/DEV_ONLY/);
assert.equal(buffer,2,'PROD guard must not mutate configuration');
assert.equal(locks,0,'All acquired locks must be released');
console.log('notification-digest-config-writer-20: PASS');
