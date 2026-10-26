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
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
import {createSwapReservationFenceReader} from './swap-reservation-fence-reader-20.mjs';
const project='audit-management-system-dev';
const sheetId='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const apply=process.argv.includes('--apply');
const verify=process.argv.includes('--verify');
const coverage=process.argv.includes('--coverage');
const exceptions=process.argv.includes('--exceptions');
const liveTest=process.argv.includes('--live-test');
const initFence=process.argv.includes('--init-fence');
const syncDrift=process.argv.includes('--sync-drift');
const deltaApply=process.argv.includes('--delta-apply');
const inspectDelta=process.argv.includes('--inspect-delta');
const inspectOrphans=process.argv.includes('--inspect-orphans');
if([apply,verify,coverage,exceptions,liveTest,initFence,syncDrift,deltaApply,inspectDelta,inspectOrphans].filter(Boolean).length>1)throw Error('SWAP_DEV_MODE_CONFLICT');
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
if(inspectOrphans){
 const partition=partitionSwapSheetMigration({auditRows,availabilityRows});
 const vh=availabilityRows[0],ah=auditRows[0],idx=name=>vh.indexOf(name);
 const date=idx('Date'),owner=idx('Auditor_Email'),idA=idx('Audit_ID_1'),idB=idx('Audit_ID_2');
 const starts=[idx('First_Audit_Start_Time'),idx('Second_Audit_Start_Time')],ends=[idx('First_Audit_End_Time'),idx('Second_Audit_End_Time')];
 if([date,owner,idA,idB,...starts,...ends].some(i=>i<0))throw Error('SWAP_ORPHAN_SCHEMA_INVALID');
 const known=new Set(auditRows.slice(1).map(row=>String(row[ah.indexOf('Audit ID')]||'').trim()).filter(Boolean));
 const orphanSlots=[];
 for(let rowNumber=2;rowNumber<=availabilityRows.length;rowNumber++){
  const row=availabilityRows[rowNumber-1]||[];
  for(const [n,idCol] of [idA,idB].entries()){
   const auditId=String(row[idCol]||'').trim();
   if(!auditId||known.has(auditId))continue;
   const slot={row:rowNumber,owner:String(row[owner]||'').trim().toLowerCase(),date:String(row[date]||'').trim(),start:String(row[starts[n]]||'').trim(),end:String(row[ends[n]]||'').trim()};
   orphanSlots.push(slot);
  }
 }
 const valid=slot=>slot.owner.includes('@')&&/^\\d{4}-\\d{2}-\\d{2}$/.test(slot.date)&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(slot.start)&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(slot.end)&&slot.start<slot.end;
 const impacts=orphanSlots.map(slot=>({sheetRow:slot.row,valid:valid(slot),affectedAudits:valid(slot)?partition.eligible.filter(a=>a.assignedTo===slot.owner&&a.reservations.some(r=>r.date===slot.date&&r.start<slot.end&&slot.start<r.end)).map(a=>a.auditId):[]}));
 console.log(JSON.stringify({result:'DEV_ORPHAN_IMPACT',orphanCount:partition.orphanReservations.length,slotsAnalyzed:orphanSlots.length,impacts,unresolved:true,cutoverAuthorized:false}));
 process.exit(0);
}
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
console.log(JSON.stringify({mode:deltaApply?'DELTA_APPLY':apply?'APPLY':verify?'VERIFY':liveTest?'LIVE_TEST':'DRY_RUN',manifestHash:plan.manifestHash,source:plan.sourceCount,eligible:plan.eligibleCount,quarantined:plan.quarantinedCount,orphans:plan.orphanCount,writes:plan.writes.length}));
if(plan.eligibleCount===0)throw Error('SWAP_DEV_NO_ELIGIBLE_AUDITS');
if(plan.writes.length>100)throw Error('SWAP_DEV_TOO_MANY_WRITES');
const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const names=plan.writes.map(w=>w.update.name);
if(initFence){
 const name='projects/'+project+'/databases/(default)/documents/ams_swap20_dev_meta/reservation_fence';
 const url=base+'/ams_swap20_dev_meta/reservation_fence';
 const response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(response.ok){const doc=await response.json();console.log(JSON.stringify({result:'DEV_RESERVATION_FENCE_ALREADY_EXISTS',revision:doc.updateTime,cutoverAuthorized:false}));process.exit(0);}
 if(response.status!==404)throw Error('SWAP_DEV_FENCE_PREFLIGHT_HTTP_'+response.status);
 const result=await json(base+':commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes:[{update:{name,fields:{payload:{stringValue:JSON.stringify({operationId:'DEV_INITIALIZATION',now:new Date().toISOString()})}}},currentDocument:{exists:false}}]})});
 if(result.writeResults?.length!==1)throw Error('SWAP_DEV_FENCE_INIT_RECEIPT_INVALID');
 const after=await json(url);
 if(!after.updateTime)throw Error('SWAP_DEV_FENCE_INIT_READBACK_INVALID');
 console.log(JSON.stringify({result:'DEV_RESERVATION_FENCE_INITIALIZED',revision:after.updateTime,cutoverAuthorized:false}));process.exit(0);
}

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
if(inspectDelta){
 const discrepancies=plan.writes.filter(w=>existing.has(w.update.name)&&existing.get(w.update.name)?.fields?.payload?.stringValue!==w.update.fields.payload.stringValue);
 const missing=plan.writes.filter(w=>!existing.has(w.update.name));
 const summary=discrepancies.map(w=>{
  const actual=JSON.parse(existing.get(w.update.name).fields.payload.stringValue);
  const expected=JSON.parse(w.update.fields.payload.stringValue);
  return {collection:w.update.name.split('/').at(-2),auditId:w.update.name.split('/').pop(),
   changedFields:[...new Set([...Object.keys(actual),...Object.keys(expected)])].filter(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k]))};
 });
 console.log(JSON.stringify({result:'DEV_DELTA_INSPECTION',existing:existing.size,missing:missing.length,drift:summary,cutoverAuthorized:false}));
 process.exit(0);
}
if(deltaApply){
 // Fail closed: original migrated records must still agree with canonical Sheets.
 const stale=plan.writes.filter(w=>existing.has(w.update.name)&&existing.get(w.update.name)?.fields?.payload?.stringValue!==w.update.fields.payload.stringValue);
 if(stale.length)throw Error('SWAP_DEV_DELTA_EXISTING_SOURCE_DRIFT_'+stale.length);
 const missing=plan.writes.filter(w=>!existing.has(w.update.name));
 if(missing.length%2!==0||missing.length>100)throw Error('SWAP_DEV_DELTA_INCOMPLETE_AUDIT_PAIR');
 const byAudit=new Map();
 for(const write of missing){const id=write.update.name.split('/').pop();byAudit.set(id,(byAudit.get(id)||0)+1);}
 if([...byAudit.values()].some(n=>n!==2))throw Error('SWAP_DEV_DELTA_PARTIAL_AUDIT_PAIR');
 const list=async collection=>{
  let pageToken='',all=[];
  do{
   const page=await json(base+'/'+collection+'?pageSize=100'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));
   all.push(...(page.documents||[]));pageToken=page.nextPageToken||'';
   if(all.length>2000)throw Error('SWAP_DEV_DELTA_COLLECTION_LIMIT');
  }while(pageToken);
  return all;
 };
 const [auditDocs,availabilityDocs]=await Promise.all([list('ams_swap20_dev_audits'),list('ams_swap20_dev_availability')]);
 const expected=new Set(names);
 if([...auditDocs,...availabilityDocs].some(d=>!expected.has(d.name)))throw Error('SWAP_DEV_DELTA_UNEXPECTED_DOCUMENT');
 if(auditDocs.length!==availabilityDocs.length||auditDocs.length!==existing.size/2)throw Error('SWAP_DEV_DELTA_EXISTING_COLLECTION_MISMATCH');
 if(missing.length===0){console.log(JSON.stringify({result:'SWAP_DEV_DELTA_ALREADY_COMPLETE',documents:existing.size,cutoverAuthorized:false}));process.exit(0);}
 const fresh=buildSwapMigrationManifest({auditRows:await range('Audit planning'),availabilityRows:await range('Auditor Availability')});
 if(fresh.manifestHash!==manifest.manifestHash)throw Error('SWAP_DEV_DELTA_SOURCE_CHANGED');
 const result=await json(base+':commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes:missing})});
 if(result.writeResults?.length!==missing.length)throw Error('SWAP_DEV_DELTA_WRITE_RECEIPT_INVALID');
 const after=await read();
 if(after.size!==names.length||plan.writes.some(w=>after.get(w.update.name)?.fields?.payload?.stringValue!==w.update.fields.payload.stringValue))throw Error('SWAP_DEV_DELTA_READBACK_OR_PARITY_FAILED');
 console.log(JSON.stringify({result:'SWAP_DEV_DELTA_VERIFIED',addedAudits:byAudit.size,addedDocuments:missing.length,totalAudits:plan.eligibleCount,totalDocuments:after.size,manifestHash:manifest.manifestHash,cutoverAuthorized:false}));
 process.exit(0);
}
if(syncDrift){
 const permitted=new Set(['AUD_GrupoViverosLasCunas_HQ_1777531729329_38','AUD_MistralBonsai,S.L._HQ_1777531729397_52','AUD_ViverosMedipalmS.A._HQ_1777531729583_96']);
 const delta=plan.writes.filter(w=>existing.has(w.update.name)&&existing.get(w.update.name)?.fields?.payload?.stringValue!==w.update.fields.payload.stringValue);
 const unexpected=delta.filter(w=>!permitted.has(w.update.name.split('/').pop()));
 const missingRevision=delta.filter(w=>!existing.get(w.update.name)?.updateTime);
 const unexpectedFields=delta.filter(w=>{try{const before=JSON.parse(existing.get(w.update.name).fields.payload.stringValue),after=JSON.parse(w.update.fields.payload.stringValue);const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));return keys.length!==1||keys[0]!== (w.update.name.includes('/ams_swap20_dev_audits/')?'plannedBlocks':'reservations');}catch{return true;}});
 if(unexpected.length||missingRevision.length||unexpectedFields.length||delta.length>4)throw Error('DEV_SYNC_UNEXPECTED_DELTA '+JSON.stringify({count:delta.length,unexpected:unexpected.map(w=>w.update.name.split('/').pop()),missingRevision:missingRevision.map(w=>w.update.name.split('/').pop()),unexpectedFields:unexpectedFields.map(w=>w.update.name.split('/').pop())}));
 if(delta.length===0){console.log(JSON.stringify({result:'DEV_DRIFT_ALREADY_SYNCED',documents:existing.size,cutoverAuthorized:false}));process.exit(0);}
 const fresh=buildSwapMigrationManifest({auditRows:await range('Audit planning'),availabilityRows:await range('Auditor Availability')});
 if(fresh.manifestHash!==manifest.manifestHash)throw Error('DEV_SYNC_SOURCE_CHANGED');
 const writes=delta.map(w=>({update:w.update,currentDocument:{updateTime:existing.get(w.update.name).updateTime}}));
 const result=await json(base+':commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes})});
 if(result.writeResults?.length!==writes.length)throw Error('DEV_SYNC_RECEIPT_INVALID');
 const after=await read();
 if(plan.writes.filter(w=>existing.has(w.update.name)).some(w=>after.get(w.update.name)?.fields?.payload?.stringValue!==w.update.fields.payload.stringValue))throw Error('DEV_SYNC_READBACK_MISMATCH');
 console.log(JSON.stringify({result:'DEV_DRIFT_SYNC_VERIFIED',documents:after.size,updated:writes.length,audits:new Set(delta.map(w=>w.update.name.split('/').pop())).size,cutoverAuthorized:false}));
 process.exit(0);
}
if(verify||liveTest){
 const drift=[];
 if(existing.size!==names.length)throw Error('SWAP_DEV_VERIFY_MISSING_DOCS_'+(names.length-existing.size));
 for(const write of plan.writes){
  const found=existing.get(write.update.name);
  if(found?.fields?.payload?.stringValue!==write.update.fields.payload.stringValue){
   const id=write.update.name.split('/').pop();
   let actual=null,expected=null;
   try{actual=JSON.parse(found?.fields?.payload?.stringValue||'null');expected=JSON.parse(write.update.fields.payload.stringValue);}catch{}
   const changed=actual&&expected?[...new Set([...Object.keys(actual),...Object.keys(expected)])].filter(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k])):['PAYLOAD_INVALID'];
   console.log(JSON.stringify({result:'DEV_SOURCE_DRIFT',auditId:id,collection:write.update.name.split('/').at(-2),changedFields:changed,storedManifest:'3b680d9e4f00bf8fd9b2a639db8c6c5a5a9c96673cb639f937ce1b5be2241630',currentManifest:manifest.manifestHash,cutoverAuthorized:false}));
   if(!liveTest)throw Error('SWAP_DEV_VERIFY_PAYLOAD_MISMATCH');
   drift.push({auditId:id,collection:write.update.name.split('/').at(-2),changedFields:changed});
  }
 }
 if(liveTest){
  const partition=partitionSwapSheetMigration({auditRows,availabilityRows});
  const excluded=new Set(partition.quarantined.map(x=>x.auditId));
  const migrated=new Set(partition.eligible.map(x=>x.auditId));
  if([...migrated].some(id=>excluded.has(id)))throw Error('SWAP_DEV_SCOPE_OVERLAP');
  const expectedNames=new Set(names);
  const actualNames=new Set(existing.keys());
  if([...actualNames].some(name=>!expectedNames.has(name)))throw Error('SWAP_DEV_SCOPE_UNEXPECTED_DOCUMENT');
  const list=async collection=>{
   let pageToken='',all=[];
   do{
    const url=base+'/'+collection+'?pageSize=100'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
    const page=await json(url);
    all.push(...(page.documents||[]));pageToken=page.nextPageToken||'';
    if(all.length>2000)throw Error('SWAP_DEV_SCOPE_LIST_LIMIT');
   }while(pageToken);
   return all;
  };
  const [audits,availability]=await Promise.all([list('ams_swap20_dev_audits'),list('ams_swap20_dev_availability')]);
  for(const [collection,docs] of [['ams_swap20_dev_audits',audits],['ams_swap20_dev_availability',availability]]){
   if(docs.length!==plan.eligibleCount)throw Error('SWAP_DEV_SCOPE_COLLECTION_COUNT_'+collection+'_'+docs.length);
   for(const doc of docs){
    if(!expectedNames.has(doc.name)||!migrated.has(doc.name.split('/').pop()))throw Error('SWAP_DEV_SCOPE_UNEXPECTED_'+collection);
   }
  }
  const canonicalReader=createSwapFirestoreCanonicalReader({project,getToken:async()=>token});
  const auditIds=audits.map(d=>d.name.split('/').pop());
  for(let i=0;i<auditIds.length;i+=2){
   const pair=auditIds.slice(i,i+2);
   if(pair.length===2){
    const [a,b]=await Promise.all([canonicalReader.readPair(pair),canonicalReader.readAvailability(pair)]);
    if(a.length!==2||b.length!==2||a.some(v=>v.source!=='firestore-canonical')||b.some(v=>v.source!=='firestore-canonical'))throw Error('SWAP_DEV_CANONICAL_READER_FAILED');
   }
  }
  let fence='NOT_READY';
  try{const result=await createSwapReservationFenceReader({project,getToken:async()=>token})();fence=result.revision?'READY':'INVALID';}catch(e){fence='BLOCKED_'+String(e.message||e).slice(0,90);}
  console.log(JSON.stringify({result:'DEV_RUNTIME_READINESS',canonicalPairsTested:Math.floor(auditIds.length/2),reservationFence:fence,gridCutoverAuthorized:false}));
  console.log(JSON.stringify({result:drift.length?'DEV_LIVE_FIRESTORE_SCOPE_PASS_WITH_SOURCE_DRIFT':'DEV_LIVE_FIRESTORE_SCOPE_PASS',audits:audits.length,availability:availability.length,verifiedDocuments:existing.size,parityDocuments:existing.size-drift.length,driftCount:drift.length,excludedLegacyTest:partition.quarantined.length,orphanReferences:partition.orphanReservations.length,manifestHash:manifest.manifestHash,cutoverAuthorized:false}));
 }else console.log(JSON.stringify({result:'DEV_PARITY_VERIFIED',documents:existing.size,eligible:plan.eligibleCount,quarantined:plan.quarantinedCount,orphans:plan.orphanCount,manifestHash:manifest.manifestHash,cutoverAuthorized:false}));
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
