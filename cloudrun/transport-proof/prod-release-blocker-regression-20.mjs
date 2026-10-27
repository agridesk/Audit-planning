// AMS release-only regression: detect accidental removal of PROD safety gates.
// Read-only. Does not deploy, contact GCP, or touch SWAP runtime.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=import.meta.dirname;
const read=(name)=>readFileSync(resolve(dir,name),'utf8');
const contract=read('prod-readiness-contract-20.mjs');
const env=read('runtime-environment-20.mjs');
const r4=read('server-r4.js');
const r12=read('server-r12.js');
const r6=read('server-r6.js');
const entry=read('server-r15.js');
const checks=[
 ['explicit PROD release opt-in',env.includes('AMS_PROD_RELEASE_ENABLED')],
 ['PROD project binding',env.includes('AMS_PROD_GCP_PROJECT')],
 ['PROD dedicated runtime SA declaration',env.includes('resolveProdRuntimeIdentity(env,project)')],
 ['PROD Availability collection isolation',env.includes('AMS_PROD_AVAILABILITY_COLLECTION_REQUIRED')&&entry.includes("collection:runtime.isDev?'ams_availability_20_dev':runtime.availabilityCollection")],
 ['PROD verifies real principal before listener',entry.includes('if(!runtime.isDev)await verifyProdRuntimeIdentity(runtime.runtimeServiceAccount);')&&entry.indexOf('verifyProdRuntimeIdentity(runtime.runtimeServiceAccount)')<entry.indexOf("await import('./server-r12.js')")],
 ['PROD sheet binding',env.includes('AMS_PROD_SSOT_SPREADSHEET_ID')],
 ['DEV/PROD sheet inequality',env.includes('AMS_PROD_SHEET_NOT_ISOLATED')],
 ['PROD signing secret isolation',env.includes('AMS_PROD_SESSION_SECRET_NOT_ISOLATED')],
 ['PROD writer key isolation',env.includes('AMS_PROD_WRITE_KEY_NOT_ISOLATED')],
 ['PROD logout revocation contract',env.includes('AMS_PROD_LOGOUT_REVOCATION_REQUIRED')],
 ['PROD real OTP contract',env.includes('AMS_PROD_AUTH_OTP_ENABLED')],
 ['PROD entrypoint validates runtime',entry.includes('resolveAmsRuntimeConfig(process.env,await resolveProject())')],
 ['legacy manager writer is still inventoried',!r4.includes('async function directManagerApprove(')||contract.includes('PROD_LEGACY_MANAGER_LIFECYCLE_WRITES')],
 ['legacy combined writer is still inventoried',!r6.includes('sheetsValuesBatchUpdate(writes)')||contract.includes('PROD_LEGACY_DIRECT_LIFECYCLE_WRITE')],
 ['realized-hours bypass blocker retained',contract.includes('PROD_REALIZED_HOURS_CANONICAL_PARITY_UNPROVEN')],
 ['realized-hours guard precedes session and direct Sheets write',(()=>{const start=r12.indexOf("u.pathname==='/api/v1/manager/realized-hours-direct'");const end=r12.indexOf("u.pathname==='/api/v1/manager/audit'",start);const route=r12.slice(start,end);const guard=route.indexOf("PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED"),session=route.indexOf('innerSession(req)'),write=route.indexOf("fetch(root+':batchUpdate'");return start>=0&&end>start&&guard>=0&&session>=0&&write>=0&&guard<session&&guard<write;})()],
 ['realized-hours route PROD fail-closed',/if\(process\.env\.AMS_RUNTIME_ENV==='PROD'\)return sendJson\(res,503,\{success:false,error:'PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED'\}\)/.test(r12)],
 ['Firestore environment binding blocker retained',contract.includes('PROD_FIRESTORE_COLLECTION_DEFAULT_DEV')],
 ['release contract explicitly exits nonzero for blockers',contract.includes("process.exitCode=1")],
 ['GAS DEV endpoint gate inventoried',contract.includes('GAS_BRIDGE_DEV_ONLY')],
 ['notification PROD gate inventoried',contract.includes('NOTIFICATION_PROD_DISABLED')]
];
for(const [name,ok] of checks){assert.equal(ok,true,'AMS PROD release contract regression: '+name);}
console.log('AMS PROD release safeguards: PASS '+checks.length+' source contract assertions; NO release authorization inferred.');
