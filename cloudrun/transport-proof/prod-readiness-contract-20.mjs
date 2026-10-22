/**
 * AMS 2.0 release portability audit (static, read-only).
 * No secrets, network calls, runtime writes, or deployment actions.
 * Run: node prod-readiness-contract-20.mjs
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname);
const names=['server-r15.js','server-r12.js','server-r10.js','server-r9.js','server-r8.js','server-r6.js','server-r5.js','server-r4.js','runtime-environment-20.mjs','package.json'];
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
if(!env.includes('AMS_PROD_LOGOUT_REVOCATION_REQUIRED'))flag('PROD_LOGOUT_REVOCATION_GATE','runtime-environment-20.mjs','PROD must have revocable sessions and reliable logout.');
if(!env.includes('AMS_PROD_AUTH_OTP_ENABLED')||!env.includes('AMS_PROD_OTP_NOT_ENABLED'))flag('PROD_OTP_STARTUP_GATE','runtime-environment-20.mjs','PROD OTP must be enabled explicitly before launch.');
const auth=files['server-r5.js'];
if(!auth.includes("OTP_ENABLED=RUNTIME_ENV==='DEV'||(RUNTIME_ENV==='PROD'&&process.env.AMS_PROD_AUTH_OTP_ENABLED==='true')"))flag('PROD_OTP_ROUTING','server-r5.js','PROD OTP auth must use a separate explicit gate.');
if(!auth.includes("if(RUNTIME_ENV!=='DEV')return sendJson(res,404,{ok:false,error:'NOT_FOUND'});"))flag('DEV_SHORTCUT_GUARD','server-r5.js','DEV one-click login must remain forbidden outside DEV.');
if(!auth.includes("cloudAuthLoginHtml().replace(/<section id=\"shortcut\">"))flag('PROD_SHORTCUT_HIDDEN','server-r5.js','Production OTP login page must hide DEV bypass controls.');
if(!env.includes('AMS_PROD_SESSION_SIGNING_SECRET')||!env.includes('AMS_PROD_SESSION_SECRET_NOT_ISOLATED'))flag('PROD_SESSION_SECRET_GATE_MISSING','runtime-environment-20.mjs','PROD must have its own separate signing secret.');
if(!env.includes('AMS_PROD_WRITE_KEY_NOT_ISOLATED'))flag('PROD_GAS_KEY_ISOLATION_GATE_MISSING','runtime-environment-20.mjs','PROD GAS writer key must not equal DEV key.');
if(!entry.includes('process.env.AMS_SESSION_SIGNING_SECRET=process.env.AMS_PROD_SESSION_SIGNING_SECRET'))flag('PROD_SESSION_SECRET_PROPAGATION','server-r15.js','PROD signing secret must be set before inner servers start.');
if(!/SESSION_COOKIE=process\.env\.AMS_RUNTIME_ENV===['"]PROD['"]/.test(core))flag('PROD_COOKIE_ISOLATION','server-r4.js','Production and development session cookie names must be separate.');
if(!r12.includes('process.env.AMS_ALLOWED_ORIGIN'))flag('MANAGER_ORIGIN_RUNTIME','server-r12.js','Manager origin must be supplied through runtime configuration.');
for(const name of ['server-r6.js','server-r8.js','server-r9.js','server-r10.js']){
 if(!files[name].includes('process.env.AMS_SSOT_SPREADSHEET_ID'))flag('LAYER_SHEET_CONFIG',name,'Nested runtime layer must use resolved shared spreadsheet ID.');
}
for(const name of ['server-r5.js','server-r10.js']){
 if(!files[name].includes('process.env.AMS_GAS_WRITE_URL'))flag('LAYER_BRIDGE_CONFIG',name,'Nested runtime layer must use shared GAS writer URL.');
}
for(const name of ['server-r5.js','server-r6.js']){
 if(!files[name].includes("'ams_prod_session'"))flag('LAYER_COOKIE_CONFIG',name,'Nested authentication layer must use PROD session cookie.');
}
if(!files['server-r10.js'].includes('process.env.AMS_ALLOWED_ORIGIN'))flag('RELAY_ORIGIN_R10','server-r10.js','Nested relay must use allowed runtime origin.');
if(!r12.includes('process.env.AMS_SSOT_SPREADSHEET_ID'))flag('R12_SHEET_ENV_MISSING','server-r12.js','R12 does not consume generic spreadsheet configuration.');
if(!core.includes('process.env.AMS_SSOT_SPREADSHEET_ID'))flag('CORE_SHEET_ENV_MISSING','server-r4.js','Core backend does not consume generic spreadsheet configuration.');
if(/const GAS_WRITE_URL=process\.env\.GAS_DEV_WRITE_URL\|\|''/.test(r12)||/const GAS_WRITE_URL=process\.env\.GAS_DEV_WRITE_URL\|\|''/.test(core))flag('GAS_BRIDGE_DEV_ONLY','server-r12.js / server-r4.js','GAS bridge is still bound to a DEV-named endpoint, without verified PROD isolation.');
if(/const endpoint=process\.env\.GAS_DEV_WRITE_URL/.test(entry))flag('NOTIFICATION_GAS_DEV_ONLY','server-r15.js','Notification bridge still resolves a DEV-named GAS endpoint.');
if(/!runtime\.isDev\|\|!endpoint\|\|!secret/.test(entry))flag('NOTIFICATION_PROD_DISABLED','server-r15.js','Notification GAS bridge remains explicitly disabled for PROD pending separate routing and authorization.');
if(/const SESSION_COOKIE=['"]ams_dev_session['"]/.test(core))flag('DEV_SESSION_COOKIE','server-r4.js','Session cookie name remains DEV-specific: verify cross-environment isolation and PROD cookie scope.','REVIEW');
if(/MANAGER_ORIGIN=['"]https:\/\/ams-transport-proof-/.test(r12))flag('DEV_ORIGIN_HARDCODED','server-r12.js','Manager action relay still includes an explicit DEV origin.','REVIEW');
const report={contract:'AMS_CLOUD_20_PROD_PORTABILITY',result:findings.some(f=>f.severity==='BLOCKER')?'NOT_READY':findings.length?'REVIEW_REQUIRED':'SOURCE_CHECK_PASSED',sourceChecks:names,findings,notice:'Static source inspection only. Verify actual Cloud Run revisions, IAM, GAS triggers, Script Properties, Cloud Scheduler, data and secrets before release.'};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(report.result==='NOT_READY')process.exitCode=1;
