/** Explicitly approved, DEV-only, stage-only Model C importer.
 * Never flips canonical writer authority. Every individual Firestore audit seed
 * is conditional and followed by readback. No Sheets writes, no PROD.
 */
import {createHash} from 'node:crypto';
import {planScopeExtensionFirestoreBackfill20} from '../../cloudrun/transport-proof/model-c-scope-extension-firestore-backfill-20.mjs';
import {stageScopeExtensionMigration20} from '../../cloudrun/transport-proof/model-c-scope-extension-staging-gate-20.mjs';
import {prepareScopeExtensionImportGate20} from '../../cloudrun/transport-proof/model-c-scope-extension-import-gate-20.mjs';
import {createScopeExtensionFirestoreSeeder20} from '../../cloudrun/transport-proof/model-c-scope-extension-firestore-seed-20.mjs';
const project='audit-management-system-dev',sheetId='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const expectedAudit='TEST_MULTIDAY_APPROVED_01';
const quarantinedObligations=new Set(['OBL_0dd739efe8a644889e8b8363bef71701','OBL_d579887c1c78403896d13f436acd0f1a']);
const runtime={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,environment:'ams-dev-migration',projectId:project,eventName:process.env.GITHUB_EVENT_NAME};
if(runtime.repository!=='agridesk/Audit-planning'||runtime.ref!=='refs/heads/dev'||runtime.eventName!=='workflow_dispatch'||process.env.GCLOUD_PROJECT!==project)throw Error('EXT_STAGE_NOT_DEV_WORKFLOW_DISPATCH');
const expectedHash=String(process.env.AMS_EXPECTED_SOURCE_SHA256||'').trim();
if(!/^[a-f0-9]{64}$/.test(expectedHash))throw Error('EXT_STAGE_EXPECTED_SOURCE_HASH_REQUIRED');
if(process.env.AMS_APPROVAL!=='CONFIRM_DEV_STAGE_ONLY')throw Error('EXT_STAGE_EXPLICIT_APPROVAL_REQUIRED');
let freeze;
try{freeze=JSON.parse(String(process.env.AMS_DEV_FREEZE_ATTESTATION_JSON||''))}catch{throw Error('EXT_STAGE_INDEPENDENT_FREEZE_ATTESTATION_MISSING')}
const sourceToken=String(process.env.AMS_SOURCE_READ_TOKEN||'').trim(),migrationToken=String(process.env.AMS_MIGRATION_TOKEN||'').trim();
if(!sourceToken||!migrationToken||sourceToken===migrationToken)throw Error('EXT_STAGE_INDEPENDENT_IDENTITIES_REQUIRED');
async function get(url,token){
 const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('EXT_STAGE_READ_HTTP_'+r.status);
 return r.json();
}
const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const ranges=["'Audit_Obligations'!A1:Z1002","'Audit_Visit_Obligations'!A1:F1002","'Audit planning'!A1:CN442","'Config_Scopes'!A1:Y1000"];
async function readSource(){
 const meta=await get('https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'?fields=spreadsheetId,properties(title)',sourceToken);
 if(meta.spreadsheetId!==sheetId||meta.properties?.title!=='Audit Management System DEV')throw Error('EXT_STAGE_SOURCE_SPREADSHEET_UNVERIFIED');
 const url=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values:batchGet');
 url.searchParams.set('valueRenderOption','FORMATTED_VALUE');for(const range of ranges)url.searchParams.append('ranges',range);
 const result=await get(url,sourceToken);
 if(!Array.isArray(result.valueRanges)||result.valueRanges.length!==4)throw Error('EXT_STAGE_SOURCE_RANGE_MISMATCH');
 const fields=['obligations','visitLinks','planning','configScopes'];
 const input=Object.fromEntries(fields.map((k,i)=>[k,result.valueRanges[i]?.values||[]]));
 const plan=planScopeExtensionFirestoreBackfill20(input);
 const failed=plan.fatal.filter(x=>x.code==='OBLIGATION_LINEAGE_CONFLICT'&&x.auditId===expectedAudit);
 if(plan.fatal.length!==2||failed.length!==2||new Set(failed.map(x=>x.obligationId)).size!==2||failed.some(x=>!quarantinedObligations.has(x.obligationId)))throw Error('EXT_STAGE_SOURCE_CONFLICTS_CHANGED');
 const stage=stageScopeExtensionMigration20({plan,quarantineAuditIds:[expectedAudit]});
 if(!stage.eligibleForControlledStaging||stage.counts.contexts!==104||stage.counts.obligations!==153||stage.counts.quarantinedAudits!==1||stage.seedPermitted!==false||stage.cutoverApproved!==false)throw Error('EXT_STAGE_SOURCE_COHORT_CHANGED');
 return stage;
}
const stage=await readSource();
const snapshotHash=sha({contexts:stage.auditContexts,documents:stage.documents});
const gated=prepareScopeExtensionImportGate20({stage,expectedSnapshotSha256:expectedHash,attestedWriterFreeze:freeze,requestApproval:process.env.AMS_APPROVAL,runtime});
if(gated.snapshotSha256!==snapshotHash||freeze?.sourceSnapshotSha256!==snapshotHash)throw Error('EXT_STAGE_GATE_SNAPSHOT_MISMATCH');
// An attestation is necessary, not by itself sufficient: actual live DEV sources must remain frozen.
if(freeze.allLegacyGASWritersFenced!==true||freeze.allCloudRunRoutesFenced!==true||freeze.sourceMutationGuardVerified!==true||!String(freeze.evidenceRef||'').trim())throw Error('EXT_STAGE_GLOBAL_WRITER_FREEZE_NOT_INDEPENDENTLY_VERIFIED');
for(const type of ['obligation','auditcontext','event','outbox']){
 const url=new URL(root+'/ams_scope_extension_20_dev_'+type);
 url.searchParams.set('pageSize','1');
 url.searchParams.set('mask.fieldPaths','ams_inventory_field_never_present');
 const resp=await fetch(url,{headers:{authorization:'Bearer '+migrationToken},signal:AbortSignal.timeout(30000)});
 if(resp.status===404)continue;
 if(!resp.ok)throw Error('EXT_STAGE_TARGET_HTTP_'+resp.status);
 const data=await resp.json();
 if((data.documents||[]).length||data.nextPageToken)throw Error('EXT_STAGE_TARGET_NOT_EMPTY_'+type);
}
// Re-fetch source after read-only preconditions, before first write.
const refreshed=await readSource();
if(sha({contexts:refreshed.auditContexts,documents:refreshed.documents})!==snapshotHash)throw Error('EXT_STAGE_SOURCE_CHANGED_BEFORE_WRITE');
const seeder=createScopeExtensionFirestoreSeeder20({
 projectId:project,getToken:async()=>migrationToken,writeEnabled:true,writerFenceEvidenceVerified:true
});
let seeded=0,records=0;
for(const context of stage.auditContexts){
 const obligations=context.obligationIds.map(id=>stage.documents.find(x=>x.obligationId===id));
 if(obligations.some(x=>!x))throw Error('EXT_STAGE_MISSING_OBLIGATION');
 const result=await seeder.seedAudit({context,obligations,sourceSnapshotHash:snapshotHash});
 if(result.seeded!==true||result.idempotent===true)throw Error('EXT_STAGE_UNEXPECTED_SEED_RESULT');
 seeded++;records+=result.records;
}
const after=await readSource();
if(sha({contexts:after.auditContexts,documents:after.documents})!==snapshotHash)throw Error('EXT_STAGE_SOURCE_CHANGED_AFTER_SEED_REQUIRES_QUARANTINE');
if(seeded!==104||records!==257)throw Error('EXT_STAGE_SEED_COVERAGE_UNVERIFIED');
console.log('AMS_DEV_MODEL_C_STAGE_COMPLETED '+JSON.stringify({project,sourceSnapshotSha256:snapshotHash,contexts:seeded,obligations:153,quarantinedAudits:1,cutoverApproved:false,writerContextsPromoted:0}));
console.log('FIRESTORE_STAGED_READ_ONLY__NO_SHEETS_WRITES__NO_CLOUD_RUN_OR_GAS_CUTOVER__NO_PROD');
