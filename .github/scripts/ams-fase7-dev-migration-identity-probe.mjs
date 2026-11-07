/** Credential sanity check only; never writes Firestore or Google Sheets. */
import {execFileSync} from 'node:child_process';
const project='audit-management-system-dev';
if(process.env.GCLOUD_PROJECT!==project&&process.env.CLOUDSDK_CORE_PROJECT!==project&&process.env.GOOGLE_CLOUD_PROJECT!==project)throw Error('MIGRATION_IDENTITY_PROJECT_MISMATCH');
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',timeout:30000}).trim();
if(!token)throw Error('MIGRATION_IDENTITY_TOKEN_MISSING');
const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_scope_extension_20_dev_auditcontext?pageSize=1&mask.fieldPaths=ams_inventory_field_never_present';
const response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
if(!response.ok&&response.status!==404)throw Error('MIGRATION_IDENTITY_FIRESTORE_READ_HTTP_'+response.status);
if(response.ok){const result=await response.json();if((result.documents||[]).length||result.nextPageToken)throw Error('MIGRATION_IDENTITY_NONEMPTY_FIRESTORE');}
console.log('DEV_MIGRATION_IDENTITY_READABLE_NO_WRITES');
