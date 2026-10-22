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
 const allowedProject=String(env.AMS_PROD_GCP_PROJECT||'').trim();
 if(!allowedProject||allowedProject==='audit-management-system-dev'||project!==allowedProject)throw Error('AMS_PROD_PROJECT_MISMATCH');
 const spreadsheet=String(env.AMS_PROD_SSOT_SPREADSHEET_ID||'').trim();
 if(!spreadsheet||spreadsheet===String(env.DEV_SSOT_SPREADSHEET_ID||'').trim())throw Error('AMS_PROD_SHEET_NOT_ISOLATED');
 return Object.freeze({mode,project,spreadsheet,isDev:false});
}
