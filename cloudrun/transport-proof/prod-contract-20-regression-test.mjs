import assert from 'node:assert/strict';
import {resolveAmsRuntimeConfig as resolve} from './runtime-environment-20.mjs';
const dev='audit-management-system-dev',prod='prod-project-fixture';
const devSheet='dev-sheet-fixture',prodSheet='prod-sheet-fixture';
const base={AMS_RUNTIME_ENV:'PROD',AMS_PROD_RELEASE_ENABLED:'true',AMS_PROD_AUTH_OTP_ENABLED:'true',AMS_AUTH_LOGOUT_REVOCATION_ENABLED:'true',AMS_PROD_GCP_PROJECT:prod,AMS_PROD_SSOT_SPREADSHEET_ID:prodSheet,DEV_SSOT_SPREADSHEET_ID:devSheet,AMS_PROD_GAS_WRITE_URL:'https://prod.example.test/bridge',GAS_DEV_WRITE_URL:'https://dev.example.test/bridge',AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY:'fixture-production-gas-writer-key-0123456789',AMS_PROD_SESSION_SIGNING_SECRET:'fixture-production-session-signing-secret-0123456789',AMS_PROD_ALLOWED_ORIGIN:'https://prod.example.test',DEV_ALLOWED_ORIGIN:'https://dev.example.test'};
const cases=[
['valid PROD',base,prod,null],
['PROD logout revocation disabled',{...base,AMS_AUTH_LOGOUT_REVOCATION_ENABLED:'false'},prod,'AMS_PROD_LOGOUT_REVOCATION_REQUIRED'],
['PROD OTP not enabled',{...base,AMS_PROD_AUTH_OTP_ENABLED:'false'},prod,'AMS_PROD_OTP_NOT_ENABLED'],
['PROD release flag absent',{...base,AMS_PROD_RELEASE_ENABLED:''},prod,'AMS_PROD_NOT_AUTHORIZED'],
['PROD wrong project',base,dev,'AMS_PROD_PROJECT_MISMATCH'],
['PROD sheet equals DEV',{...base,AMS_PROD_SSOT_SPREADSHEET_ID:devSheet},prod,'AMS_PROD_SHEET_NOT_ISOLATED'],
['PROD bridge equals DEV',{...base,AMS_PROD_GAS_WRITE_URL:base.GAS_DEV_WRITE_URL},prod,'AMS_PROD_GAS_BRIDGE_NOT_ISOLATED'],
['PROD bridge missing',{...base,AMS_PROD_GAS_WRITE_URL:''},prod,'AMS_PROD_GAS_WRITE_URL_REQUIRED'],
['PROD bridge key missing',{...base,AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY:''},prod,'AMS_PROD_WRITE_BRIDGE_KEY_REQUIRED'],
['PROD origin equals DEV',{...base,AMS_PROD_ALLOWED_ORIGIN:base.DEV_ALLOWED_ORIGIN},prod,'AMS_PROD_ORIGIN_NOT_ISOLATED'],
['PROD session secret too short',{...base,AMS_PROD_SESSION_SIGNING_SECRET:'short'},prod,'AMS_PROD_SESSION_SECRET_REQUIRED'],
['PROD writer key too short',{...base,AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY:'short'},prod,'AMS_PROD_WRITE_BRIDGE_KEY_REQUIRED'],
['PROD missing session secret',{...base,AMS_PROD_SESSION_SIGNING_SECRET:''},prod,'AMS_PROD_SESSION_SECRET_REQUIRED'],
['PROD reused DEV session secret',{...base,AMS_PROD_SESSION_SIGNING_SECRET:'shared-session',AMS_SESSION_SIGNING_SECRET:'shared-session'},prod,'AMS_PROD_SESSION_SECRET_NOT_ISOLATED'],
['PROD reused DEV bridge key',{...base,AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY:'shared-bridge',AMS_EXTERNAL_WRITE_BRIDGE_KEY:'shared-bridge'},prod,'AMS_PROD_WRITE_KEY_NOT_ISOLATED'],
['PROD origin missing',{...base,AMS_PROD_ALLOWED_ORIGIN:''},prod,'AMS_PROD_ORIGIN_NOT_ISOLATED'],
['PROD wrong mode',{...base,AMS_RUNTIME_ENV:'UNKNOWN'},prod,'AMS_RUNTIME_ENV_INVALID'],
['DEV valid',{AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet},dev,null],
['DEV project guard',{AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet},prod,'AVAILABILITY_DEV_PROJECT_ONLY'],
['DEV release guard',{AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet,AMS_PROD_RELEASE_ENABLED:'true'},dev,'AMS_PROD_RELEASE_FLAG_IN_DEV'],
];
for(const [name,env,project,error] of cases){
 if(error)assert.throws(()=>resolve(env,project),e=>e?.message===error,name);
 else {const cfg=resolve(env,project);assert.equal(cfg.project,project,name);assert.equal(Object.isFrozen(cfg),true,name);}
}
const approved=resolve(base,prod);
assert.equal(approved.isDev,false);
assert.equal(approved.spreadsheet,prodSheet);
assert.equal(approved.gasWriteUrl,base.AMS_PROD_GAS_WRITE_URL);
assert.equal(approved.origin,base.AMS_PROD_ALLOWED_ORIGIN);
console.log('AMS PROD environment regression: PASS ('+cases.length+' cases)');
