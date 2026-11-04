/** Read-only, no-payload logging DEV migration preflight. No writes or deployments. */
import {createHash} from 'node:crypto';
import {planScopeExtensionFirestoreBackfill20} from '../../cloudrun/transport-proof/model-c-scope-extension-firestore-backfill-20.mjs';
import {stageScopeExtensionMigration20} from '../../cloudrun/transport-proof/model-c-scope-extension-staging-gate-20.mjs';
const project='audit-management-system-dev',sheetId=process.env.AMS_DEV_SHEET_ID||'';
const expected='TEST_MULTIDAY_APPROVED_01';
if(!/^[-_A-Za-z0-9]{20,100}$/.test(sheetId))throw Error('EXT_PREFLIGHT_SHEET_ID_REQUIRED');
if(![process.env.CLOUDSDK_CORE_PROJECT,process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].includes(project))throw Error('EXT_PREFLIGHT_PROJECT_ID_MISMATCH');
const token=String(process.env.GOOGLE_ACCESS_TOKEN||'').trim();
if(!token)throw Error('EXT_PREFLIGHT_GOOGLE_TOKEN_MISSING');
const get=async url=>{
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!response.ok){const problem=await response.json().catch(()=>null);const code=String(problem?.error?.status||'UNKNOWN');const reason=String(problem?.error?.errors?.[0]?.reason||'UNKNOWN');const message=String(problem?.error?.message||'').slice(0,300).replace(/[\r\n]/g,' ');throw Error('EXT_PREFLIGHT_READ_HTTP_'+response.status+'_STATUS_'+code+'_REASON_'+reason+'_MESSAGE_'+message)}
 return response.json();
};
const sheetMetadata=await get('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'?fields=spreadsheetId,properties(title)');
if(sheetMetadata.spreadsheetId!==sheetId||sheetMetadata.properties?.title!=='Audit Management System DEV')throw Error('EXT_PREFLIGHT_WRONG_SPREADSHEET');
const spec=[
 {range:"'Audit_Obligations'!A1:Z1002",label:'obligations'},
 {range:"'Audit_Visit_Obligations'!A1:F1002",label:'visitLinks'},
 {range:"'Audit planning'!A1:CN442",label:'planning'},
 {range:"'Config_Scopes'!A1:Y1000",label:'configScopes'}
];
const sheetsURL=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet');
sheetsURL.searchParams.set('valueRenderOption','FORMATTED_VALUE');
spec.forEach(x=>sheetsURL.searchParams.append('ranges',x.range));
const sheetData=await get(sheetsURL.toString());
if(!Array.isArray(sheetData.valueRanges)||sheetData.valueRanges.length!==spec.length)throw Error('EXT_PREFLIGHT_SHEETS_RANGE_COUNT_MISMATCH');
const input=Object.fromEntries(spec.map((x,i)=>[x.label,sheetData.valueRanges[i]?.values||[]]));
const plan=planScopeExtensionFirestoreBackfill20(input);
const two=plan.fatal.filter(x=>x.code==='OBLIGATION_LINEAGE_CONFLICT'&&x.auditId===expected);
if(plan.fatal.length!==2||two.length!==2||new Set(two.map(x=>x.obligationId)).size!==2)throw Error('EXT_PREFLIGHT_UNEXPECTED_SOURCE_CONFLICTS');
const stage=stageScopeExtensionMigration20({plan,quarantineAuditIds:[expected]});
if(!stage.eligibleForControlledStaging||stage.counts.contexts<1||stage.counts.obligations<1||stage.seedPermitted!==false||stage.cutoverApproved!==false)throw Error('EXT_PREFLIGHT_STAGE_NOT_ELIGIBLE');
const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const collections=['obligation','auditcontext','event','outbox'];
for(const name of collections){
 const url=new URL(root+'/ams_scope_extension_20_dev_'+name);
 url.searchParams.set('pageSize','1');
 url.searchParams.set('mask.fieldPaths','ams_inventory_field_never_present');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(response.status===404)continue;
 if(!response.ok)throw Error('EXT_PREFLIGHT_FIRESTORE_HTTP_'+response.status);
 const data=await response.json();
 if((data.documents||[]).length>0||data.nextPageToken)throw Error('EXT_PREFLIGHT_FIRESTORE_NOT_EMPTY_'+name);
}
const digest=createHash('sha256').update(JSON.stringify({contexts:stage.auditContexts,documents:stage.documents})).digest('hex');
console.log('AMS_DEV_MODEL_C_MIGRATION_PREFLIGHT '+JSON.stringify({
 project,source:'LIVE_DEV_GOOGLE_SHEETS',snapshotSha256:digest,contexts:stage.counts.contexts,
 obligations:stage.counts.obligations,quarantinedAudits:stage.counts.quarantinedAudits,
 firestoreCollectionsEmpty:true,writeAuthorized:false,cutoverApproved:false
}));
console.log('NO_SHEETS_WRITES_NO_FIRESTORE_WRITES_NO_DEPLOYMENTS');
