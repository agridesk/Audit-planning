import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const source=read('SystemWriteGuard.js');
const files=['CoreStatusMachine.js','AuditPlanningEngine.js','RejectedAuditsV5.js'];
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
const cfg={ALLOW_DEV_WRITES:'TRUE',DEV_WRITE_MODE:'ALLOW_ALL'};
let env='DEV',owner='';
const ctx=vm.createContext({
  SYS_getConfig_:()=>cfg,SYS_getEnv_:()=>env,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>owner})},
  Logger:{log:()=>{}}
});
vm.runInContext(source,ctx,{filename:'SystemWriteGuard.js'});
for(const action of ['STATUS_PLAN','STATUS_APPROVE','STATUS_ACCEPT','STATUS_COMPLETE','STATUS_CANCEL','STATUS_DENY','STATUS_REJECT','STATUS_REOPEN','PLANNING_WRITE','REJECT_ARCHIVE']){
  check(action+' allowed pre-cutover',()=>{owner='';env='DEV';assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_(action,'A1').allowed,true);});
  check(action+' blocked after owner cutover',()=>{owner='CLOUD_RUN';env='DEV';assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_(action,'A1').code,'DEV_LEGACY_PLANNING_WRITER_RETIRED');});
}
check('unrelated DEV write unaffected by planning fence',()=>{owner='CLOUD_RUN';env='DEV';assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_('COMPANY_MANAGEMENT','A1').allowed,true);});
check('PROD unchanged',()=>{owner='CLOUD_RUN';env='PROD';assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_('STATUS_PLAN','A1').allowed,true);});
check('property lookup failure blocks DEV',()=>{env='DEV';ctx.PropertiesService.getScriptProperties=()=>{throw Error('UNAVAILABLE')};assert.equal(ctx.SYS_WRITE_GUARD_DECIDE_('STATUS_PLAN','A1').code,'DEV_CANONICAL_OWNER_FENCE_UNAVAILABLE');});
check('status caller hint cannot bypass guard',()=>{const s=read('CoreStatusMachine.js');assert(!s.includes("payload.writeGuardAlreadyPassed === true"));assert(s.includes('var writeGuard = Status_checkDevWriteGuard_(action, auditId)'));});
check('planning writer guarded before availability sync',()=>{const s=read('AuditPlanningEngine.js'),start=s.indexOf('function Planning_executeWrite_('),guard=s.indexOf("SYS_ENFORCE_WRITE_ALLOWED('PLANNING_WRITE'",start),sync=s.indexOf('Planning_syncAvailability_(',start);assert(start>=0&&guard>start&&sync>guard);});
check('reject archive guarded before Sheets mutation',()=>{const s=read('RejectedAuditsV5.js'),start=s.indexOf('function MoveAuditToRejected('),guard=s.indexOf("SYS_ENFORCE_WRITE_ALLOWED('REJECT_ARCHIVE'",start),write=s.indexOf('raSheet.appendRow(',start);assert(start>=0&&guard>start&&write>guard);});
check('realized-audit append and hours update protected by status fence',()=>{const s=read('LogRealizedAuditService.js');for(const name of ['LogRealizedAuditService_AppendFromAuditPlanning','LogRealizedAuditService_UpdateCompletedHours']){const start=s.indexOf('function '+name+'(');const guard=s.indexOf("SYS_ENFORCE_WRITE_ALLOWED('STATUS_COMPLETE",start);assert(start>=0&&guard>start&&guard<start+1100);}});
check('legacy availability release protected by planning fence',()=>{const s=read('AuditManagerAvailabilityBridge.js'),start=s.indexOf('function managerV5_releaseAvailability_('),guard=s.indexOf("SYS_ENFORCE_WRITE_ALLOWED('PLANNING_AVAILABILITY_RELEASE'",start),write=s.indexOf('shAv.getRange(writeRows[w].rowNumber',start);assert(start>=0&&guard>start&&write>guard);});
check('legacy AvailabilityService mutation entrypoints require central planning guard',()=>{const src=read('AvailabilityService.js');for(const name of ['writeBack','clearAuditId','fixDuplicateAvailabilityRows_','repairDefaultTimeCells','toggleManualSoftDay','applyRangeManualSoftDays','applyDefaultWeekdaysAndRebuild12m','sortAuditorAvailability','ensureDefaults12m','regenerateDefaults12m','runDefaultsAuto']){const re=new RegExp('function '+name+'\\([^\\n]*\\) \\{');const m=re.exec(src);assert(m,'missing '+name);assert(src.slice(m.index,m.index+450).includes("SYS_ENFORCE_WRITE_ALLOWED('PLANNING_AVAILABILITY_LEGACY'"),'missing guard '+name);}});
console.log('PASS '+checks+' P0 DEV legacy-writer fence checks');
