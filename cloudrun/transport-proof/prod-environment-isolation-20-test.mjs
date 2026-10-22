import assert from 'node:assert/strict';
import {resolveAmsRuntimeConfig} from './runtime-environment-20.mjs';

const devProject='audit-management-system-dev';
const prodProject='ams-prod-isolation-test';
const devSheet='dev-isolation-sheet-id';
const prodSheet='prod-isolation-sheet-id';
function reject(env,project,reason){
 assert.throws(()=>resolveAmsRuntimeConfig(env,project),Error,reason);
}
const dev=resolveAmsRuntimeConfig({AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet},devProject);
assert.equal(dev.mode,'DEV');
assert.equal(dev.spreadsheet,devSheet);
assert.equal(dev.isDev,true);
reject({AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet},prodProject,'DEV cannot use PROD project');
reject({AMS_RUNTIME_ENV:'DEV',DEV_SSOT_SPREADSHEET_ID:devSheet,AMS_PROD_RELEASE_ENABLED:'true'},devProject,'PROD flag forbidden in DEV');
reject({AMS_RUNTIME_ENV:'PROD',AMS_PROD_GCP_PROJECT:prodProject,AMS_PROD_SSOT_SPREADSHEET_ID:prodSheet},prodProject,'Explicit release flag required');
reject({AMS_RUNTIME_ENV:'PROD',AMS_PROD_RELEASE_ENABLED:'true',AMS_PROD_GCP_PROJECT:prodProject,AMS_PROD_SSOT_SPREADSHEET_ID:prodSheet},devProject,'PROD project identity required');
reject({AMS_RUNTIME_ENV:'PROD',AMS_PROD_RELEASE_ENABLED:'true',AMS_PROD_GCP_PROJECT:prodProject,AMS_PROD_SSOT_SPREADSHEET_ID:devSheet,DEV_SSOT_SPREADSHEET_ID:devSheet},prodProject,'PROD and DEV sheet must differ');
reject({AMS_RUNTIME_ENV:'PROD',AMS_PROD_RELEASE_ENABLED:'true',AMS_PROD_GCP_PROJECT:prodProject},prodProject,'PROD sheet required');
reject({AMS_RUNTIME_ENV:'UNKNOWN',DEV_SSOT_SPREADSHEET_ID:devSheet},devProject,'Unexpected mode fails closed');
const prod=resolveAmsRuntimeConfig({AMS_RUNTIME_ENV:'PROD',AMS_PROD_RELEASE_ENABLED:'true',AMS_PROD_AUTH_OTP_ENABLED:'true',AMS_PROD_GCP_PROJECT:prodProject,AMS_PROD_SSOT_SPREADSHEET_ID:prodSheet,DEV_SSOT_SPREADSHEET_ID:devSheet,AMS_PROD_GAS_WRITE_URL:'https://prod.example.test/gas',AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY:'fixture-production-gas-writer-key-0123456789',AMS_PROD_SESSION_SIGNING_SECRET:'fixture-production-session-signing-secret-0123456789',AMS_PROD_ALLOWED_ORIGIN:'https://prod.example.test'},prodProject);
assert.equal(prod.isDev,false);
assert.equal(prod.spreadsheet,prodSheet);
assert.equal(prod.mode,'PROD');
assert.equal(Object.isFrozen(prod),true);
process.stdout.write('AMS 2.0 deployment environment isolation: PASS (9 cases)\n');
