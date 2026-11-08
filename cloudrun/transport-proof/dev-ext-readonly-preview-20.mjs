/** Allowlist for the isolated AMS Fase 1.2 DEV preview.
 * Read-only by default; narrowly permits authenticated, verified Model C EXT/Undo
 * on the named isolated DEV service when its dedicated direct-write gate is set.
 * No generic lifecycle, GAS or PROD write is authorized by this allowlist.
 */
const allowedGet = new Set([
  '/', '/health', '/manager-portal.js', '/api/v1/session',
  '/api/v1/manager/open', '/api/v1/manager/company-management',
  '/api/v1/manager/company-management/extension-obligations',
  '/api/v1/manager/ext-model-c-source-preflight',
  '/api/v1/manager/ext-model-c-pilot-preflight',
  '/api/v1/manager/ext-model-c-pilot-status',
  '/api/v1/manager/ext-model-c-stage-status',
  '/api/v1/manager/maps-config'
]);
const allowedPost = new Set([
  // DEV shortcut creates a signed session cookie; it does not mutate audit data.
  '/auth/dev-login', '/auth/legacy-handoff', '/api/v1/session/exchange',
  '/api/v1/manager/open-enrichment'
]);
export function extReadOnlyPreview20(env) {
  return env?.AMS_RUNTIME_ENV === 'DEV'
    && env?.K_SERVICE === 'ams-fase12-dev'
    && env?.AMS_DEV_EXT_READONLY_PREVIEW === 'true'
    && env?.AMS_DEV_MAINTENANCE_MODE === 'true';
}
const verifiedExtensionPosts = new Set([
  '/api/v1/manager/extension-obligation-command',
  '/api/v1/manager/extension-reconcile-projection'
]);
export function extPreviewRequestAllowed20({method,path,env}={}) {
  if(method==='GET' || method==='HEAD') return allowedGet.has(path);
  if(method==='POST') {
    if(allowedPost.has(path)) return true;
    if(path==='/api/v1/manager/self-planning-direct'
      &&extReadOnlyPreview20(env)
      &&env.AMS_DEV_EXT_DIRECT_ENABLED==='true'
      &&env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'
      &&env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED!=='true'
      &&env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED!=='true')return true;
    if(path==='/api/v1/manager/extension-obligation-command'
      &&extReadOnlyPreview20(env)
      &&env.AMS_DEV_EXT_DIRECT_ENABLED==='true'
      &&env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'
      &&env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED!=='true'
      &&env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED!=='true')return true;
    if(path==='/api/v1/manager/ext-model-c-stage')return extReadOnlyPreview20(env)&&env.AMS_DEV_EXT_STAGE_ENABLED==='true'&&env.AMS_DEV_EXT_COMMANDS_ENABLED!=='true'&&env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE';
    if(path==='/api/v1/manager/ext-model-c-pilot-promote')return extReadOnlyPreview20(env)&&env.AMS_DEV_EXT_PILOT_PROMOTION_ENABLED==='true'&&env.AMS_DEV_EXT_COMMANDS_ENABLED==='true'&&env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'&&env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED!=='true'&&env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED!=='true';
    const pilot=extReadOnlyPreview20(env)
      &&env.AMS_DEV_EXT_PILOT_PROMOTION_ENABLED==='true'
      &&env.AMS_DEV_EXT_COMMANDS_ENABLED==='true'
      &&env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'
      &&env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED!=='true'
      &&env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED!=='true';
    const global=extReadOnlyPreview20(env)
      &&env.AMS_DEV_EXT_COMMANDS_ENABLED==='true'
      &&env.AMS_SCOPE_EXTENSION_AUTHORITY==='FIRESTORE'
      &&env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED==='true'
      &&env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED==='true';
    return verifiedExtensionPosts.has(path)&&(pilot||global);
  }
  return false;
}
