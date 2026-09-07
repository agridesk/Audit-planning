/**
 * FILE: AMS01_RegressionGate.js
 * BUILD: AMS01_REGRESSION_GATE_20260907_R1
 * PURPOSE:
 *   Read-only semantic gate for the two measured AMS-01 P0 candidates.
 *   Stores one compact result row so no log copy/paste is required.
 */

var AMS01_REGRESSION_GATE_BUILD = 'AMS01_REGRESSION_GATE_20260907_R1';
var AMS01_REGRESSION_GATE_SHEET = 'AMS01_Regression_Gate';

function AMS01_RunRegressionGate() {
  var started = Date.now();
  var out = {
    build: AMS01_REGRESSION_GATE_BUILD,
    generatedAt: new Date().toISOString(),
    runtimeEnv: (typeof AMS01_env_ === 'function') ? AMS01_env_() : 'UNKNOWN',
    availability: null,
    qualification: null,
    pass: false,
    totalMs: 0
  };

  try {
    out.availability = (typeof AMS01_CompareAvailabilityOldVsCandidate === 'function')
      ? AMS01_CompareAvailabilityOldVsCandidate()
      : { error:'Missing AMS01_CompareAvailabilityOldVsCandidate' };
  } catch (e1) {
    out.availability = { error:String(e1 && e1.message ? e1.message : e1) };
  }

  try {
    out.qualification = (typeof AMS01_CompareQualificationCurrentVsCandidate === 'function')
      ? AMS01_CompareQualificationCurrentVsCandidate()
      : { error:'Missing AMS01_CompareQualificationCurrentVsCandidate' };
  } catch (e2) {
    out.qualification = { error:String(e2 && e2.message ? e2.message : e2) };
  }

  out.pass = !!(
    out.availability && out.availability.semanticOutputEqual === true &&
    out.qualification && out.qualification.membershipEqual === true
  );
  out.totalMs = Date.now() - started;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(AMS01_REGRESSION_GATE_SHEET);
    if (!sh) sh = ss.insertSheet(AMS01_REGRESSION_GATE_SHEET);
    if (sh.getLastRow() < 1) {
      sh.getRange(1,1,1,8).setValues([['Timestamp','Build','Runtime','Pass','Availability_Equal','Qualification_Equal','Total_Ms','Result_JSON']]);
    }
    sh.getRange(sh.getLastRow()+1,1,1,8).setValues([[
      new Date(),
      out.build,
      out.runtimeEnv,
      out.pass,
      !!(out.availability && out.availability.semanticOutputEqual === true),
      !!(out.qualification && out.qualification.membershipEqual === true),
      out.totalMs,
      JSON.stringify(out)
    ]]);
    out.storage = { success:true, sheet:AMS01_REGRESSION_GATE_SHEET, row:sh.getLastRow() };
  } catch (eStore) {
    out.storage = { success:false, message:String(eStore && eStore.message ? eStore.message : eStore) };
  }

  Logger.log('[AMS01_REGRESSION_GATE] ' + JSON.stringify(out));
  return out;
}
