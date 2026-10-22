// Read-only inventory of GAS trigger installers defined in repository source.
// Source declarations are not proof of installation in DEV or PROD.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const files=['NotificationSender.js','NotificationAcceptedReconciler.js','OpenCacheWarmer.js','AnnualCycleEngineV5.js','AvailabilityService.js','AuditorV5Backend.js','MpCacheWarmer_GATE_Q_2.js','Cache_Admin_AuditorScopeInvalidation.js','Platform.js'];
const rows=[];
const legacyReview=new Set(['OpenCacheWarmer.js','AvailabilityService.js','AuditorV5Backend.js','MpCacheWarmer_GATE_Q_2.js','WeeklyTriggerRepair_20260525.js']);
for(const file of files){
 const lines=readFileSync(resolve(root,file),'utf8').split('\n');
 for(let i=0;i<lines.length;i++){
  if(!lines[i].includes('ScriptApp.newTrigger('))continue;
  const section=lines.slice(i,i+8).join(' ');
  const match=section.match(/ScriptApp\.newTrigger\(([^)]+)\)/);
  rows.push({file,line:i+1,handlerExpression:match?match[1]:'UNKNOWN',installed:'NOT_VERIFIED',productionPolicy:legacyReview.has(file)?'REVIEW_LEGACY_DO_NOT_AUTO_INSTALL':'REVIEW_PURPOSE_AND_CONFIG'});
 }
}
process.stdout.write(JSON.stringify({status:'SOURCE_ONLY',items:rows},null,2)+'\n');
