/**
 * AMS 2.0 release portability audit (static, read-only).
 * No secrets, network calls, runtime writes, or deployment actions.
 * Run: node prod-readiness-contract-20.mjs
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname);
const names=['server-r15.js','server-r12.js','server-r4.js','runtime-environment-20.mjs','package.json'];
const files=Object.fromEntries(names.map(name=>[name,readFileSync(resolve(root,name),'utf8')]));
const findings=[];
function flag(code,file,detail,severity='BLOCKER'){findings.push({code,file,severity,detail});}
const env=files['runtime-environment-20.mjs'];
const entry=files['server-r15.js'];
const r12=files['server-r12.js'];
const core=files['server-r4.js'];
const packageJson=JSON.parse(files['package.json']);
if(packageJson.scripts?.start!=='node server-r15.js')flag('ENTRYPOINT_CHANGED','package.json','Recheck startup and routing chain.');
if(!entry.includes('resolveAmsRuntimeConfig(process.env,await resolveProject())'))flag('ENTRYPOINT_ENV_CONTRACT','server-r15.js','Entry point does not use shared runtime configuration.');
if(!entry.includes('process.env.AMS_SSOT_SPREADSHEET_ID=spreadsheet'))flag('INNER_SHEET_PROPAGATION','server-r15.js','Resolved spreadsheet is not forwarded to inner servers.');
if(!/AMS_PROD_RELEASE_ENABLED/.test(env)||!/AMS_PROD_GCP_PROJECT/.test(env)||!/AMS_PROD_SSOT_SPREADSHEET_ID/.test(env))flag('PROD_ENV_GATE_INCOMPLETE','runtime-environment-20.mjs','Missing explicit production release, project or isolated sheet guard.');
if(!/project!==allowedProject/.test(env))flag('PROD_PROJECT_BINDING_UNPROVEN','runtime-environment-20.mjs','Missing exact production project binding.');
if(!/spreadsheet===String\(env\.DEV_SSOT_SPREADSHEET_ID/.test(env))flag('PROD_SHEET_ISOLATION_UNPROVEN','runtime-environment-20.mjs','Missing explicit protection against using the DEV sheet.');
if(!r12.includes('process.env.AMS_SSOT_SPREADSHEET_ID'))flag('R12_SHEET_ENV_MISSING','server-r12.js','R12 does not consume generic spreadsheet configuration.');
if(!core.includes('process.env.AMS_SSOT_SPREADSHEET_ID'))flag('CORE_SHEET_ENV_MISSING','server-r4.js','Core backend does not consume generic spreadsheet configuration.');
if(/const GAS_WRITE_URL=process\.env\.GAS_DEV_WRITE_URL\|\|''/.test(r12)||/const GAS_WRITE_URL=process\.env\.GAS_DEV_WRITE_URL\|\|''/.test(core))flag('GAS_BRIDGE_DEV_ONLY','server-r12.js / server-r4.js','GAS bridge is still bound to a DEV-named endpoint, without verified PROD isolation.');
if(/const endpoint=process\.env\.GAS_DEV_WRITE_URL/.test(entry))flag('NOTIFICATION_GAS_DEV_ONLY','server-r15.js','Notification bridge still resolves a DEV-named GAS endpoint.');
if(/project!=='audit-management-system-dev'\|\|!endpoint/.test(entry))flag('NOTIFICATION_PROD_DISABLED','server-r15.js','Notification bridge is explicitly unavailable in PROD (no approved alternative configured).');
if(/const SESSION_COOKIE=['"]ams_dev_session['"]/.test(core))flag('DEV_SESSION_COOKIE','server-r4.js','Session cookie name remains DEV-specific: verify cross-environment isolation and PROD cookie scope.','REVIEW');
if(/MANAGER_ORIGIN=['"]https:\/\/ams-transport-proof-/.test(r12))flag('DEV_ORIGIN_HARDCODED','server-r12.js','Manager action relay still includes an explicit DEV origin.','REVIEW');
const report={contract:'AMS_CLOUD_20_PROD_PORTABILITY',result:findings.some(f=>f.severity==='BLOCKER')?'NOT_READY':findings.length?'REVIEW_REQUIRED':'SOURCE_CHECK_PASSED',sourceChecks:names,findings,notice:'Static source inspection only. Verify actual Cloud Run revisions, IAM, GAS triggers, Script Properties, Cloud Scheduler, data and secrets before release.'};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(report.result==='NOT_READY')process.exitCode=1;
