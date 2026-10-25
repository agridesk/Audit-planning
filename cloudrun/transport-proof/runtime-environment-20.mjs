import {resolveProdRuntimeIdentity} from './prod-runtime-identity-20.mjs';
// Deployment configuration for the shared AMS 2.0 runtime.
// PROD is opt-in and must be configured independently from DEV.
export function resolveAmsRuntimeConfig(env, projectId) {
 const project=String(projectId||'').trim();
 const mode=String(env.AMS_RUNTIME_ENV||'DEV').trim().toUpperCase();
 if(!['DEV','PROD'].includes(mode))throw Error('AMS_RUNTIME_ENV_INVALID');
 if(mode==='DEV'){
  if(project!=='audit-management-system-dev')throw Error('AVAILABILITY_DEV_PROJECT_ONLY');
  const spreadsheet=String(env.DEV_SSOT_SPREADSHEET_ID||'').trim();
  if(!spreadsheet)throw Error('AVAILABILITY_DEV_SHEET_REQUIRED');
  if(env.AMS_PROD_RELEASE_ENABLED==='true')throw Error('AMS_PROD_RELEASE_FLAG_IN_DEV');
  return Object.freeze({mode,project,spreadsheet,isDev:true});
 }
 // An explicit release switch, exact project binding and independent sheet prevent DEV data reaching PROD.
 if(env.AMS_PROD_RELEASE_ENABLED!=='true')throw Error('AMS_PROD_NOT_AUTHORIZED');
 if(env.AMS_PROD_AUTH_OTP_ENABLED!=='true')throw Error('AMS_PROD_OTP_NOT_ENABLED');
 if(env.AMS_AUTH_LOGOUT_REVOCATION_ENABLED!=='true')throw Error('AMS_PROD_LOGOUT_REVOCATION_REQUIRED');
 const allowedProject=String(env.AMS_PROD_GCP_PROJECT||'').trim();
 if(!allowedProject||allowedProject==='audit-management-system-dev'||project!==allowedProject)throw Error('AMS_PROD_PROJECT_MISMATCH');
 const runtimeServiceAccount=resolveProdRuntimeIdentity(env,project);
 const spreadsheet=String(env.AMS_PROD_SSOT_SPREADSHEET_ID||'').trim();
 if(!spreadsheet||spreadsheet===String(env.DEV_SSOT_SPREADSHEET_ID||'').trim())throw Error('AMS_PROD_SHEET_NOT_ISOLATED');
 const gasWriteUrl=String(env.AMS_PROD_GAS_WRITE_URL||'').trim();
 if(!/^https:\/\//.test(gasWriteUrl))throw Error('AMS_PROD_GAS_WRITE_URL_REQUIRED');
 if(gasWriteUrl===String(env.GAS_DEV_WRITE_URL||'').trim())throw Error('AMS_PROD_GAS_BRIDGE_NOT_ISOLATED');
 const prodWriteKey=String(env.AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY||'').trim();
 if(prodWriteKey.length<32)throw Error('AMS_PROD_WRITE_BRIDGE_KEY_REQUIRED');
 if(prodWriteKey===String(env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'').trim())throw Error('AMS_PROD_WRITE_KEY_NOT_ISOLATED');
 const prodSessionSecret=String(env.AMS_PROD_SESSION_SIGNING_SECRET||'').trim();
 if(prodSessionSecret.length<32)throw Error('AMS_PROD_SESSION_SECRET_REQUIRED');
 if(prodSessionSecret===String(env.AMS_SESSION_SIGNING_SECRET||'').trim())throw Error('AMS_PROD_SESSION_SECRET_NOT_ISOLATED');
 const origin=String(env.AMS_PROD_ALLOWED_ORIGIN||'').trim();
 if(!/^https:\/\//.test(origin)||origin===String(env.DEV_ALLOWED_ORIGIN||'').trim())throw Error('AMS_PROD_ORIGIN_NOT_ISOLATED');
 return Object.freeze({mode,project,spreadsheet,isDev:false,origin,gasWriteUrl,runtimeServiceAccount});
}
