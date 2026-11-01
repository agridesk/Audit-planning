import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../NotificationEcasLifecycleReconciler.js',import.meta.url),'utf8');new vm.Script(code);
const qh=['TimestampCreated','Status','Type','Recipient','Audit ID','Company','Subject','Body','Attempts','LastError','PayloadHash','TimestampSent','Reserved'];
const trail=(action,reason)=>['','AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','','A','','','','','','','',''+JSON.stringify({payload:{action,auditId:'A',reason}})];
function execute(env,enabled,queue){const calls=[];
 const sheets={'Notification Queue':queue,'Audit planning':[['Audit ID','Status'],['A','Pending Planning']],'Rejected audits':[['Audit ID']]};
 const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='AMS_ENV'?env:k==='ECAS20_CHANGE_CANCEL_ENABLED'?(enabled?'YES':'NO'):''})},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]?{getDataRange:()=>({getValues:()=>sheets[n]})}:null})},ECAS20_QueueCommittedLifecycle_:(...args)=>{calls.push(args);return{queued:true}},Map,Set,Error,String};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 if(env!=='DEV'){assert.throws(()=>sandbox.RUN_ECAS20_RECONCILE_DEV_(),/ECAS_RECONCILE_DEV_ONLY/);return;}
 const result=sandbox.RUN_ECAS20_RECONCILE_DEV_();return{result,calls};}
execute('PROD',true,[qh]);assert.equal(execute('DEV',false,[qh,trail('CANCEL','Reason')]).calls.length,0);
const valid=execute('DEV',true,[qh,trail('CANCEL','Reason')]);assert.equal(valid.calls.length,1);assert.equal(valid.result.queued,1);
const duplicate=execute('DEV',true,[qh,trail('CANCEL','Reason'),trail('CANCEL','Second')]);assert.equal(duplicate.calls.length,0);
console.log('ECAS lifecycle reconciler DEV-only and ambiguity tests OK');
