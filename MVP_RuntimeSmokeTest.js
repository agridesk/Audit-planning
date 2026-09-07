/**
 * =========================================================
 * MVP RUNTIME SMOKE TEST
 * =========================================================
 * Purpose:
 * - Verify whether the deployed project contains the completion wrapper.
 * - Verify which runtime environment the backend resolves.
 * - Verify System_Config DEV/PROD columns.
 *
 * Safe:
 * - Read-only.
 * - Does not mutate audit data.
 *
 * Main function:
 * - MVP_RuntimeSmokeTest_Run
 * =========================================================
 */

function MVP_RuntimeSmokeTest_Run() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    checks: {
      managerCompletionWrapperExists: typeof ManagerV5_CommitCompletion === 'function',
      completionServiceExists: typeof CompletionService_CommitCompletion === 'function',
      sysSetRequestEnvExists: typeof SYS_setRequestEnv_ === 'function',
      sysGetRequestEnvExists: typeof SYS_getRequestEnv_ === 'function',
      sysResolveRuntimeEnvExists: typeof SYS_resolveRuntimeEnv_ === 'function'
    },
    env: {},
    systemConfig: {},
    recommendations: []
  };

  try {
    if (typeof SYS_setRequestEnv_ === 'function') {
      SYS_setRequestEnv_('PROD');
    }
  } catch (eSet) {
    out.env.setProdError = String(eSet && eSet.message ? eSet.message : eSet);
  }

  try {
    out.env.afterSetProd_SYS_getRequestEnv = (typeof SYS_getRequestEnv_ === 'function') ? SYS_getRequestEnv_() : '';
  } catch (eGet) {
    out.env.getEnvError = String(eGet && eGet.message ? eGet.message : eGet);
  }

  try {
    out.env.afterSetProd_SYS_resolveRuntimeEnv = (typeof SYS_resolveRuntimeEnv_ === 'function') ? SYS_resolveRuntimeEnv_('DEV') : '';
  } catch (eResolve) {
    out.env.resolveEnvError = String(eResolve && eResolve.message ? eResolve.message : eResolve);
  }

  try {
    out.systemConfig = MVP_RuntimeSmokeTest_ReadSystemConfig_();
  } catch (eCfg) {
    out.systemConfig.error = String(eCfg && eCfg.message ? eCfg.message : eCfg);
  }

  if (!out.checks.managerCompletionWrapperExists) {
    out.ok = false;
    out.recommendations.push('ManagerV5_CommitCompletion is not available in this runtime. Replace CompletionService.gs with CompletionService_FIXED.txt and deploy a NEW web app version.');
  }

  if (!out.checks.completionServiceExists) {
    out.ok = false;
    out.recommendations.push('CompletionService_CommitCompletion is missing. CompletionService.gs is not loaded in this project/deployment.');
  }

  if (String(out.env.afterSetProd_SYS_getRequestEnv || '').toUpperCase() !== 'PROD') {
    out.ok = false;
    out.recommendations.push('Backend environment bridge does not resolve PROD after SYS_setRequestEnv_(PROD). Replace EntryV5.gs with EntryV5_ENV_FIXED.txt.');
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function MVP_RuntimeSmokeTest_ReadSystemConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('System_Config');

  var result = {
    available: !!sh,
    devColumnFound: false,
    prodColumnFound: false,
    values: {}
  };

  if (!sh) return result;

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return result;

  var header = values[0].map(function(v) { return String(v || '').trim().toUpperCase(); });
  var keyCol = 0;
  var devCol = header.indexOf('DEV');
  var prodCol = header.indexOf('PROD');

  result.devColumnFound = devCol >= 0;
  result.prodColumnFound = prodCol >= 0;

  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][keyCol] || '').trim();
    if (!key) continue;

    result.values[key] = {
      DEV: devCol >= 0 ? values[r][devCol] : '',
      PROD: prodCol >= 0 ? values[r][prodCol] : ''
    };
  }

  return result;
}
