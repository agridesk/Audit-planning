/** Allowlist for the isolated IAP-secured AMS Fase 1.2 DEV preview.
 * This gate never authorizes a Model C or lifecycle write.
 * Only the named copied Cloud Run service can enter the preview.
 */
const allowedGet = new Set([
  '/', '/health', '/manager-portal.js', '/api/v1/session',
  '/api/v1/manager/open', '/api/v1/manager/company-management',
  '/api/v1/manager/company-management/extension-obligations',
  '/api/v1/manager/maps-config'
]);
const allowedPost = new Set([
  '/auth/legacy-handoff',
  '/api/v1/manager/open-enrichment'
]);
export function extReadOnlyPreview20(env) {
  return env?.AMS_RUNTIME_ENV === 'DEV'
    && env?.K_SERVICE === 'ams-fase12-dev'
    && env?.AMS_DEV_EXT_READONLY_PREVIEW === 'true'
    && env?.AMS_DEV_MAINTENANCE_MODE === 'true';
}
export function extPreviewRequestAllowed20({method,path}={}) {
  if(method==='GET' || method==='HEAD') return allowedGet.has(path);
  if(method==='POST') return allowedPost.has(path);
  return false;
}
