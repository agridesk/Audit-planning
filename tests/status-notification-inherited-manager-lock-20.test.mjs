import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const bridge=readFileSync(new URL('../StatusNotificationBridge.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../EntryV5.js',import.meta.url),'utf8');
const a=bridge.indexOf('function StatusNotificationBridge_QueueWithLock_('),b=bridge.indexOf('\nfunction ',a+20);
assert.ok(a>=0&&b>a);
assert.match(entry,/var AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_=false/);
assert.match(entry,/AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_=true/);
assert.match(entry,/finally\{AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_=false;managerBridgeLock.releaseLock\(\);\}/);
function run(manager,auditor,canAcquire){
 let tryCount=0,releaseCount=0,enqueueCount=0;
 const context=vm.createContext({Date,Utilities:{getUuid:()=> 'ID'},Logger:{log:()=>{}},
   AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_:manager,AMS_EXTERNAL_AUDITOR_ACTION_LOCK_HELD_:auditor,
   StatusNotificationBridge_Diag_:()=>{},
   NB_queueNotification_:()=>{enqueueCount++;return{success:true,queueRow:9}},
   LockService:{getScriptLock:()=>({tryLock:()=>{tryCount++;return canAcquire},releaseLock:()=>releaseCount++})}});
 vm.runInContext(bridge.slice(a,b),context);
 const response=context.StatusNotificationBridge_QueueWithLock_('a@example.test','AUDIT_APPROVED',{},'A1');
 return{response,tryCount,releaseCount,enqueueCount};
}
const manager=run(true,false,false);assert.equal(manager.response.success,true);assert.equal(manager.tryCount,0);assert.equal(manager.releaseCount,0);assert.equal(manager.enqueueCount,1);
const auditor=run(false,true,false);assert.equal(auditor.response.success,true);assert.equal(auditor.tryCount,0);
const standard=run(false,false,true);assert.equal(standard.response.success,true);assert.equal(standard.tryCount,1);assert.equal(standard.releaseCount,1);
const busy=run(false,false,false);assert.equal(busy.response.reason,'QUEUE_LOCK_TIMEOUT_RECONCILER_FALLBACK');assert.equal(busy.enqueueCount,0);
console.log('STATUS_NOTIFICATION_INHERITED_MANAGER_LOCK: PASS');
