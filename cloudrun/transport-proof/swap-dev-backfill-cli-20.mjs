/**
 * DEV-only SWAP partial backfill CLI. Requires local gcloud ADC access token.
 * Default dry-run. --apply writes eligible accepted audits only, atomically,
 * create-only; never switches canonical read/write traffic.
 */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {buildSwapMigrationManifest} from './swap-migration-manifest-20.mjs';
import {planSwapMigrationBackfill} from './swap-migration-backfill-plan-20.mjs';
import {partitionSwapSheetMigration} from './swap-sheet-migration-partition-20.mjs';
const project='audit-management-system-dev';
const sheetId='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const apply=process.argv.includes('--apply');
const verify=process.argv.includes('--verify');
const coverage=process.argv.includes('--coverage');
const exceptions=process.argv.includes('--exceptions');
if([apply,verify,coverage,exceptions].filter(Boolean).length>1)throw Error('SWAP_DEV_MODE_CONFLICT');
const locations=[process.env.GCLOUD_CMD,process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Google','Cloud SDK','google-cloud-sdk','bin','gcloud.cmd'),process.env.PROGRAMFILES&&join(process.env.PROGRAMFILES,'Google','Cloud SDK','google-cloud-sdk','bin','gcloud.cmd')].filter(Boolean);
const executable=locations.find(existsSync)||(process.platform==='win32'?'gcloud.cmd':'gcloud');
let token;
try{token=(process.platform==='win32' ? execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"& '"+executable.replace(/'/g,"''")+"' auth print-access-token"],{encoding:'utf8',timeout:30000}) : execFileSync(executable,['auth','print-access-token'],{encoding:'utf8',timeout:15000})).trim();}
catch(e){throw Error('SWAP_DEV_GCLOUD_UNAVAILABLE: install Google Cloud CLI, run gcloud auth login, or set GCLOUD_CMD to its full path. Cause: '+(e.code||e.status||'AUTH_FAILED'));}
if(!token)throw Error('SWAP_DEV_TOKEN_MISSING');
async function json(url,options={}){
 const r=await fetch(url,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('SWAP_DEV_HTTP_'+r.status+':'+(await r.text()).slice(0,300));
 return r.json();
}
const range=async tab=>{const url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent("'"+tab+"'!A1:CN1500");return (await json(url)).values||[];};
const [auditRows,availabilityRows]=await Promise.all([range('Audit planning'),range('Auditor Availability')]);
const manifest=buildSwapMigrationManifest({auditRows,availabilityRows});
const plan=planSwapMigrationBackfill({project,auditRows,availabilityRows,expectedManifestHash:manifest.manifestHash});
if(exceptions){
 const p=partitionSwapSheetMigration({auditRows,availabilityRows});
 const accepted=p.quarantined.filter(x=>x.reason!=='NOT_ACCEPTED'&&x.reason!=='LEGACY_STATUS_UNRESOLVED').map(x=>({sheetRow:x.row,reason:x.reason}));
 console.log(JSON.stringify({result:'DEV_ACCEPTED_EXCEPTION_REVIEW',accepted,legacyApproved:p.quarantined.filter(x=>x.reason==='LEGACY_STATUS_UNRESOLVED').length,orphans:p.orphanReservations.map(x=>({sheetRow:x.row,reason:x.kind})),safeAutomaticRepairs:0,cutoverAuthorized:false}));
 process.exit(0);
}
if(coverage){
 const p=partitionSwapSheetMigration({auditRows,availabilityRows});
 const reasons={};for(const row of p.quarantined)reasons[row.reason]=(reasons[row.reason]||0)+1;
 const statusIndex=auditRows[0].indexOf('Status');const statuses={};for(const row of auditRows.slice(1)){const status=String(row[statusIndex]||'').trim();if(status)statuses[status]=(statuses[status]||0)+1;}
 console.log(JSON.stringify({result:'DEV_COVERAGE_REPORT',statuses,reasons,eligible:p.eligible.length,orphanReservations:p.orphanReservations.length,cutoverAuthorized:false}));
 process.exit(0);
}
console.log(JSON.stringify({mode:apply?'APPLY':verify?'VERIFY':'DRY_RUN',manifestHash:plan.manifestHash,source:plan.sourceCount,eligible:plan.eligibleCount,quarantined:plan.quarantinedCount,orphans:plan.orphanCount,writes:plan.writes.length}));
if(plan.eligibleCount===0)throw Error('SWAP_DEV_NO_ELIGIBLE_AUDITS');
if(plan.writes.length>100)throw Error('SWAP_DEV_TOO_MANY_WRITES');
const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const names=plan.writes.map(w=>w.update.name);
const read=async()=>{
 const response=await fetch(base+':batchGet',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({documents:names}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('SWAP_DEV_BATCHGET_HTTP_'+response.status);
 const body=await response.text();
 let result;try{result=JSON.parse(body);}catch{result=body.trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}
 if(!Array.isArray(result))result=[result];
 if(!Array.isArray(result))throw Error('SWAP_DEV_BATCHGET_RESPONSE_INVALID');
 if(result.length!==names.length)throw Error('SWAP_DEV_BATCHGET_INCOMPLETE');
 const found=new Map(result.filter(x=>x.found).map(x=>[x.found.name,x.found]));
 if(result.some(x=>!x.found&&!x.missing))throw Error('SWAP_DEV_BATCHGET_UNKNOWN');
 return found;
};
const existing=await read();
if(verify){
 if(existing.size!==names.length)throw Error('SWAP_DEV_VERIFY_MISSING_DOCS_'+(names.length-existing.size));
 for(const write of plan.writes){
  const found=existing.get(write.update.name);
  if(found?.fields?.payload?.stringValue!==write.update.fields.payload.stringValue)throw Error('SWAP_DEV_VERIFY_PAYLOAD_MISMATCH');
 }
 console.log(JSON.stringify({result:'DEV_PARITY_VERIFIED',documents:existing.size,eligible:plan.eligibleCount,quarantined:plan.quarantinedCount,orphans:plan.orphanCount,manifestHash:manifest.manifestHash,cutoverAuthorized:false}));
 process.exit(0);
}
if(existing.size)throw Error('SWAP_DEV_EXISTING_CANONICAL_DOCS_'+existing.size);
if(!apply){console.log('SWAP_DEV_DRY_RUN_OK; use --apply only after review');process.exit(0);}
const freshManifest=buildSwapMigrationManifest({auditRows:await range('Audit planning'),availabilityRows:await range('Auditor Availability')});
if(freshManifest.manifestHash!==manifest.manifestHash)throw Error('SWAP_DEV_SOURCE_CHANGED');
const result=await json(base+':commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes:plan.writes})});
if(result.writeResults?.length!==plan.writes.length)throw Error('SWAP_DEV_COMMIT_RECEIPT_INVALID');
const after=await read();
if(after.size!==names.length)throw Error('SWAP_DEV_READBACK_INCOMPLETE');
for(const write of plan.writes){
 const found=after.get(write.update.name);
 if(found?.fields?.payload?.stringValue!==write.update.fields.payload.stringValue)throw Error('SWAP_DEV_READBACK_MISMATCH');
}
console.log(JSON.stringify({result:'DEV_BACKFILL_VERIFIED',documents:after.size,manifestHash:manifest.manifestHash,cutoverAuthorized:false}));
