// Read-only inventory of GAS trigger installers defined in repository source.
// Source declarations are not proof of installation in DEV or PROD.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
// Scan every root-level GAS source rather than a manually maintained list.
// Missing a new trigger installer must not yield a misleading clean report.
const files=readdirSync(root).filter(name=>name.endsWith('.js')).sort();
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
process.stdout.write(JSON.stringify({status:'SOURCE_ONLY',scannedFiles:files.length,triggerInstallers:rows.length,liveTriggerState:'NOT_VERIFIED',items:rows},null,2)+'\n');
