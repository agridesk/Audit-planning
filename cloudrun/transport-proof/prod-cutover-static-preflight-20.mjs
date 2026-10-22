// AMS 2.0 production cutover source preflight. Read-only, no network or data writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (name) => readFileSync(new URL('./'+name, import.meta.url),'utf8');
const runtime=read('runtime-environment-20.mjs');
const adapter=read('availability-firestore-adapter-20.js');
const entry=read('server-r15.js');
const relay=read('server-r12.js');
const checks=[
  {id:'PROD_RELEASE_OPT_IN',ok:runtime.includes("AMS_PROD_RELEASE_ENABLED")},
  {id:'PROD_AUTH_OTP',ok:runtime.includes("AMS_PROD_AUTH_OTP_ENABLED")},
  {id:'PROD_LOGOUT_REVOCATION',ok:runtime.includes("AMS_AUTH_LOGOUT_REVOCATION_ENABLED")},
  {id:'PROD_SESSION_SECRET_ISOLATION',ok:runtime.includes("AMS_PROD_SESSION_SIGNING_SECRET")},
  {id:'PROD_SHEET_ISOLATION',ok:runtime.includes("AMS_PROD_SHEET_NOT_ISOLATED")},
  {id:'PROD_FIRESTORE_COLLECTION_EXPLICIT',ok:/createFirestoreAvailabilityAdapter\(\{[^}]*collection\s*:/.test(entry)},
  {id:'PROD_FIRESTORE_DEV_DEFAULT_NOT_USED',ok:!(/collection='ams_availability_20_dev'/.test(adapter)&&/createFirestoreAvailabilityAdapter\(\{projectId:project,getToken\}\)/.test(entry))},
  {id:'PROD_RELAY_ORIGIN_RUNTIME_RESOLVED',ok:relay.includes('process.env.AMS_ALLOWED_ORIGIN')},
  {id:'DIRECT_SHEETS_WRITER_REVIEW_REQUIRED',ok:!relay.includes("root+':batchUpdate'")},
];
for(const c of checks) console.log((c.ok?'PASS':'BLOCK')+' '+c.id);
const blocked=checks.filter(x=>!x.ok).map(x=>x.id);
console.log('AMS_PROD_CUTOVER_STATIC_PREFLIGHT '+JSON.stringify({passed:checks.length-blocked.length,blocked:blocked.length,blockers:blocked}));
if(blocked.length)process.exitCode=1;
