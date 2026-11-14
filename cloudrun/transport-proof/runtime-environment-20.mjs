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
 const availabilityCollection=String(env.AMS_PROD_AVAILABILITY_COLLECTION||'').trim();
 if(!/^ams_availability_20_prod(?:_[a-z0-9_]+)?$/.test(availabilityCollection))throw Error('AMS_PROD_AVAILABILITY_COLLECTION_REQUIRED');
 if(availabilityCollection===String(env.AMS_DEV_AVAILABILITY_COLLECTION||'ams_availability_20_dev').trim())throw Error('AMS_PROD_AVAILABILITY_COLLECTION_NOT_ISOLATED');
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
 return Object.freeze({mode,project,spreadsheet,isDev:false,origin,gasWriteUrl,runtimeServiceAccount,availabilityCollection});
}

/** A Cloud Run revision tag is never a second functional AMS DEV environment.
 * Only the fixed public DEV hostname may serve interactive traffic.
 */
export function canonicalDevEntry20({isDev,service,host,method,url,taggedPreflightReadOnly=false}={}){
 if(isDev!==true||service!=='ams-fase12-dev')return {action:'PASS'};
 const requestHost=String(host||'').toLowerCase().replace(/:443$/,'');
 const canonical='ams-fase12-dev-zwtcar7xpa-ew.a.run.app';
 const tagged=/^[a-z0-9-]+---ams-fase12-dev-zwtcar7xpa-ew\.a\.run\.app$/;
 if(!tagged.test(requestHost))return {action:'PASS'};
 const verb=String(method||'').toUpperCase();
 const path=String(url||'/');
 if(!path.startsWith('/')||path.startsWith('//'))
  return {action:'REJECT',status:400};
 // The exact preflight tag can serve a read-only browser acceptance session,
 // but only on an explicitly opted-in revision. This is never a second
 // writable DEV environment and does not change canonical writer authority.
 if(taggedPreflightReadOnly===true&&requestHost==='preflight---'+canonical){
  if(['GET','HEAD'].includes(verb))return {action:'PASS'};
  const authPosts=new Set(['/auth/otp/request','/auth/otp/verify','/auth/dev-login','/auth/logout']);
  if(verb==='POST'&&authPosts.has(path.split('?')[0]))return {action:'PASS'};
  return {action:'REJECT',status:421};
 }
 if(!['GET','HEAD'].includes(verb))return {action:'REJECT',status:421};
 return {action:'REDIRECT',status:302,location:'https://'+canonical+path};
}
