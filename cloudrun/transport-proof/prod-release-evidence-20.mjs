// Read-only release evidence inventory. No credentials, deployments, or network calls.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname);
const source=name=>readFileSync(resolve(root,name),'utf8');
const entry=source('server-r15.js');
const env=source('runtime-environment-20.mjs');
const adapter=source('availability-firestore-adapter-20.js');
const r12=source('server-r12.js');
const r6=source('server-r6.js');
const r4=source('server-r4.js');
const checks=[
 {id:'ENTRYPOINT_RUNTIME_ENV',status:entry.includes('resolveAmsRuntimeConfig(process.env,await resolveProject())')?'SOURCE_CONFIRMED':'PROVEN_DEVIATION'},
 {id:'PROD_PROJECT_BINDING',status:env.includes('AMS_PROD_PROJECT_MISMATCH')?'SOURCE_CONFIRMED':'PROVEN_DEVIATION'},
 {id:'PROD_SHEET_ISOLATION',status:env.includes('AMS_PROD_SHEET_NOT_ISOLATED')?'SOURCE_CONFIRMED':'PROVEN_DEVIATION'},
 {id:'PROD_WRITER_SECRET_ISOLATION',status:env.includes('AMS_PROD_WRITE_KEY_NOT_ISOLATED')?'SOURCE_CONFIRMED':'PROVEN_DEVIATION'},
 {id:'PROD_SESSION_SECRET_ISOLATION',status:env.includes('AMS_PROD_SESSION_SECRET_NOT_ISOLATED')?'SOURCE_CONFIRMED':'PROVEN_DEVIATION'},
 {id:'PROD_FIRESTORE_COLLECTION',status:adapter.includes("collection='ams_availability_20_dev'")&&entry.includes('createFirestoreAvailabilityAdapter({projectId:project,getToken})')?'PROVEN_DEVIATION':'NOT_VERIFIED'},
 {id:'PROD_REALIZED_HOURS_WRITER',status:r12.includes('/api/v1/manager/realized-hours-direct')&&r12.includes("fetch(root+':batchUpdate'")?'PROVEN_DEVIATION':'NOT_VERIFIED'},
 {id:'LEGACY_COMBINED_VISIT_WRITER',status:r6.includes('sheetsValuesBatchUpdate(writes)')?'PROVEN_DEVIATION':'NOT_VERIFIED'},
 {id:'LEGACY_MANAGER_LIFECYCLE_WRITERS',status:r4.includes('async function directManagerApprove(')&&r4.includes('async function directManagerCancel(')?'PROVEN_DEVIATION':'NOT_VERIFIED'},
 ...['DEV_CLOUD_REVISION','DEV_ACTIVE_IMAGE_DIGEST','DEV_ACTIVE_BUILD_GITHUB_COMMIT','DEV_SCHEDULER_HTTP_RESULT','DEV_SCHEDULER_APP_RESULT','PROD_CLOUD_REVISION','IAM_SERVICE_ACCOUNTS','FIRESTORE_DATABASE_AND_INDEXES','GAS_DEV_DEPLOYED_VERSION','GAS_PROD_DEPLOYED_VERSION','GAS_INSTALLABLE_TRIGGERS','CLOUD_SCHEDULER_JOBS','NOTIFICATION_DELIVERY_POLICY','LIVE_DEV_E2E','CUTOVER_ROLLBACK_PROOF','LEGAL_OWNERSHIP_LICENSE'].map(id=>({id,status:'NOT_VERIFIED'}))
];
// Keep source hazard detection separate from proof that a guarded route is callable in PROD.
const knownGuards={combinedProdGuard:'NOT_VERIFIED',managerProdGuard:'NOT_VERIFIED'};
const counts=Object.fromEntries([...new Set(checks.map(c=>c.status))].map(status=>[status,checks.filter(c=>c.status===status).length]));
const evidence={scope:'AMS_CLOUD_20_PROD_CUTOVER',branch:'dev',sourceOnly:true,status:'NOT_READY',counts,knownGuards,checks,rule:'SOURCE_CONFIRMED never means production deployment verified. All live controls require actual runtime evidence.'};
process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
