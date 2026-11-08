import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const cfg={ALLOW_DEV_WRITES:'FALSE',DEV_WRITE_MODE:'BLOCK'};
let env='DEV',owner='';
const ctx=vm.createContext({
 SYS_getConfig_:()=>cfg,SYS_getEnv_:()=>env,
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>owner})},
 Logger:{log:()=>{}}
});
vm.runInContext(read('SystemWriteGuard.js'),ctx);
const actions=['PLANNING_MODEL_C_EXTENSION','REJECT_MODEL_C_LINK_CLOSE','PLANNING_MODEL_C_ANNUAL_CYCLE','PLANNING_MODEL_C_FINALIZE','STATUS_LIFECYCLE_METADATA'];
for(const action of actions){
 const result=ctx.SYS_WRITE_GUARD_DECIDE_(action,'TEST_FROZEN');
 assert.equal(result.allowed,false,action);
 assert.equal(result.code,'DEV_WRITE_BLOCKED',action);
}
cfg.ALLOW_DEV_WRITES='TRUE';cfg.DEV_WRITE_MODE='ALLOW_ALL';
for(const action of actions)assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_(action,'TEST_FROZEN').allowed,true,action);
env='PROD';for(const action of actions)assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_(action,'TEST_FROZEN').allowed,true,action);
const extSource=read('AuditPlanningModelCExtensionService.js');
const extEntry=extSource.indexOf('function ModelCExtension_commit(command) {');
const extExplicitFence=extSource.indexOf("getProperty('AMS_SCOPE_EXTENSION_AUTHORITY') === 'FIRESTORE'",extEntry);
const extGuard=extSource.indexOf("SYS_ENFORCE_WRITE_ALLOWED('PLANNING_MODEL_C_EXTENSION'",extEntry);
assert(extEntry>=0&&extExplicitFence>extEntry&&extGuard>extExplicitFence,'Model C legacy extension must be fenced by Firestore ownership before executing legacy guard or mutation');
const checks=[
 ['AuditPlanningModelCExtensionService.js','ModelCExtension_commit',"SYS_ENFORCE_WRITE_ALLOWED('PLANNING_MODEL_C_EXTENSION'",'range.setValues([next])'],
 ['ModelCRejectLinkWriter.js','ModelCRejectLinkWriter_close_',"SYS_ENFORCE_WRITE_ALLOWED('REJECT_MODEL_C_LINK_CLOSE'",'linkSheet.getRange(edit.rowNumber,1,1,h.length).setValues([next])'],
 ['ModelCAnnualCycleRuntime.js','ModelCAnnualCycle_HandleCompletionRow_',"SYS_ENFORCE_WRITE_ALLOWED('PLANNING_MODEL_C_ANNUAL_CYCLE'",'ap.getRange(apStart,1,newPlanningRows.length,headers.length).setValues(newPlanningRows)'],
 ['ModelCAnnualCycleRuntime.js','ModelCAnnualCycle_finalizeCompletedVisit_',"SYS_ENFORCE_WRITE_ALLOWED('PLANNING_MODEL_C_FINALIZE'",'obSheet.getRange(obPack.row,1,1,obHeaders.length).setValues([obRow])'],
 ['AuditLifecycleService.js','lifecycle_writeUpdates_',"SYS_ENFORCE_WRITE_ALLOWED('STATUS_LIFECYCLE_METADATA'",'sheet.getRange(rowIndex, firstCol, 1, span).setValues([vals])']
];
for(const [file,fn,guard,write] of checks){
 const source=read(file),start=source.indexOf('function '+fn+'('),check=source.indexOf(guard,start),firstWrite=source.indexOf(write,start);
 assert(start>=0&&check>start&&firstWrite>check,file+' '+fn+' must be fenced before mutation');
}
console.log('PASS DEV-only Model C writer freeze actions block with System_Config BLOCK and preserve PROD, with guards before writes');
