import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const machine=readFileSync(new URL('../CoreStatusMachine.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../StatusNotificationBridge.js',import.meta.url),'utf8');
const context=vm.createContext({Logger:{log:()=>{}},console});
vm.runInContext(machine,context);vm.runInContext(bridge,context);
const scenarios=[
 ['manager plan','Pending Planning','PLAN','MANAGER','APPROVED'],
 ['auditor self-plan','Pending Planning','PLAN','AUDITOR','PENDING_APPROVAL'],
 ['manager approve auditor self-plan','Pending Approval','APPROVE','MANAGER','ACCEPTED'],
 ['auditor accept manager plan','Approved','ACCEPT','AUDITOR','ACCEPTED'],
 ['manager cancel accepted','Accepted','CANCEL','MANAGER','PENDING_PLANNING'],
 ['auditor cancel pending approval','Pending Approval','CANCEL','AUDITOR','PENDING_PLANNING'],
 ['manager reject','Accepted','REJECT','MANAGER','REJECTED'],
 ['deny retired','Pending Approval','DENY','MANAGER',''],
 ['auditor complete accepted','Accepted','COMPLETE','AUDITOR','COMPLETED'],
 ['completed immutable','Completed','COMPLETE','MANAGER','']
];
for(const [name,status,action,actor,expected] of scenarios){
 assert.equal(context.Status_getNextStatus_(status,action,actor),expected,name);
}
assert.equal(context.StatusNotificationBridge_MapEvent_('APPROVE','MANAGER','Pending Approval','Accepted'),'AUDIT_APPROVED');
const planBlocks=[{date:'2027-03-02',start:'08:00',end:'12:00'}];
assert.equal(context.Status_validateAndBuildPlanning_({auditorEmail:'a@example.test',blocks:planBlocks}).success,true,'valid PLAN payload');
assert.equal(context.Status_validateAndBuildPlanning_({auditorUid:'AUD-1',blocks:planBlocks}).success,true,'UID identifies auditor');
assert.equal(context.Status_validateAndBuildPlanning_({blocks:planBlocks}).success,false,'PLAN without auditor fails closed');
assert.equal(context.Status_validateAndBuildPlanning_({auditorEmail:'a@example.test',blocks:[]}).success,false,'PLAN without blocks fails closed');
assert.equal(context.Status_validateAndBuildPlanning_({auditorEmail:'a@example.test',blocks:[{date:'02-03-2027',start:'08:00',end:'12:00'}]}).success,false,'non-ISO date fails closed');
assert.ok(bridge.includes("(eventCode === 'AUDIT_APPROVED' && afterStatus === STATUS.ACCEPTED)"),'Accepted external digest must remain enabled on Manager Approve');
console.log('AMS V2.12 lifecycle statuses and notification routing: PASS 12 assertions');
