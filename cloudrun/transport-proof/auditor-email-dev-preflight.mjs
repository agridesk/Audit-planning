#!/usr/bin/env node
// AMS auditor identity cutover: read-only DEV deployment preflight.
// No mutation, no feature flag changes, no PROD access.
import {execSync} from 'node:child_process';
const project='audit-management-system-dev',region='europe-west1',service='ams-transport-proof';
const spreadsheet='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const checks=[];
function check(name,ok,detail){checks.push({name,ok,detail});console.log((ok?'PASS':'BLOCK')+' '+name+' '+detail)}
function gcloud(args){return execSync('gcloud '+args.join(' '),{encoding:'utf8',timeout:30000,windowsHide:true,shell:process.platform==='win32'?'cmd.exe':'/bin/sh'}).trim()}
function requiredEnv(vars,key){return vars.find(x=>x.name===key)?.value||''}
try{
  const raw=gcloud(['run','services','describe',service,'--project',project,'--region',region,'--format=json']);
  const svc=JSON.parse(raw);
  const containers=svc.spec?.template?.spec?.containers||svc.template?.containers||[];
  const env=containers.flatMap(x=>x.env||[]);
  const flags=['AMS_AUDITOR_UID_LOGIN_ENABLED','AMS_AUDITOR_IDENTITY_DISTRIBUTED_LOCK_ENABLED','AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED'];
  check('DEV runtime',requiredEnv(env,'AMS_RUNTIME_ENV')==='DEV',requiredEnv(env,'AMS_RUNTIME_ENV')||'missing');
  check('DEV spreadsheet',requiredEnv(env,'DEV_SSOT_SPREADSHEET_ID')===spreadsheet,'exact SSOT ID required');
  check('Write flags remain OFF',flags.every(k=>requiredEnv(env,k)!=='true'),flags.map(k=>k+':'+(requiredEnv(env,k)||'unset')).join(' '));
  const configuredProject=requiredEnv(env,'GOOGLE_CLOUD_PROJECT')||requiredEnv(env,'GCLOUD_PROJECT');
  check('Cloud Run project context',!configuredProject||configuredProject===project,configuredProject||'implicit metadata project');
  const account=svc.spec?.template?.spec?.serviceAccountName||svc.template?.serviceAccount||'default';
  check('Service account identified',Boolean(account),account);
}catch(e){check('Cloud Run config',false,String(e.message).slice(0,240))}
let token='';
try{token=gcloud(['auth','print-access-token']);check('gcloud access token',!!token,'obtained')}catch(e){check('gcloud access token',false,String(e.message).slice(0,160))}
if(token){
  console.log('INFO: API probes use the local gcloud USER token, not the Cloud Run runtime identity.');
  const headers={authorization:'Bearer '+token};
  async function request(name,url,accepted){
    try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});if(response.status===403){console.log('INFO '+name+' HTTP 403 (local user lacks access; runtime service account remains unverified)');return response}check(name,accepted.includes(response.status),'HTTP '+response.status);return response}
    catch(e){check(name,false,String(e.message).slice(0,160));return null}
  }
  const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)';
  await request('Firestore database accessible',root,[200]);
  const lock=await request('Identity lock document absent',root+'/documents/ams_identity_cutover_locks/global_auditor_email',[404]);
  if(lock?.status===200)console.log('ACTION: existing lock requires manual reconciliation; do not delete automatically');
  const sheetBase='https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheet;
  const sheets=await request('DEV Sheets metadata',sheetBase+'?fields=sheets.properties.title',[200]);
  if(sheets?.ok){
    const data=await sheets.json(),titles=new Set((data.sheets||[]).map(x=>x.properties?.title));
    for(const name of ['Auditors','Auditor_Identity_Versions','Auditor_Tokens','Audit planning','Diagnostics_Log']){
      check('Sheet '+name,titles.has(name),titles.has(name)?'present':'missing');
    }
  }
}
const failed=checks.filter(x=>!x.ok);
console.log('\nAMS DEV READ-ONLY PREFLIGHT: '+(failed.length?'BLOCKED':'PASSED')+' ('+checks.length+' checks, '+failed.length+' blockers)');
console.log('NOTE: local user HTTP 403 is informational; Cloud Run service-account IAM and write permissions require separate runtime verification.');
console.log('NOTE: PASSED is not authorization to enable identity email writes.');
process.exitCode=failed.length?1:0;
