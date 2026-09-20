/** AMS-01.6 Model C Toolkit cycle-year acceptance. READ-ONLY. */
var MODEL_C_TOOLKIT_CYCLE_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_TOOLKIT_CYCLE_TEST_R1';

function RUN_MODEL_C_TOOLKIT_CYCLE_YEAR_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var out = {
    success:false,
    build:MODEL_C_TOOLKIT_CYCLE_TEST_BUILD,
    ownerBuild:(typeof MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD !== 'undefined' ? MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD : ''),
    readOnly:true,
    writesPerformed:false,
    counts:{auditRows:0,certificateAudits:0,modelCycleResolved:0,abcOnly:0,fallbackToLegacyExpiry:0,mismatches:0},
    errors:[],
    samples:[]
  };
  if (!sh) {
    out.errors.push('Missing Audit planning');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var values = sh.getDataRange().getValues();
  var hdr = values[0] || [];
  var ai = _mp_findHeaderIdxCI_(hdr,['Audit ID','Audit_ID','AuditId','Audit Id']);
  if (ai < 0) {
    out.errors.push('Missing Audit ID header');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  for (var r=1; r<values.length; r++) {
    var row = values[r] || [];
    var auditId = String(row[ai] || '').trim();
    if (!auditId) continue;
    out.counts.auditRows++;

    var modelYear = ModelCToolkitCycle_yearForAudit_(ss,auditId);
    var resolved = _mp_getCurrentCycleYearFromAuditRow_(hdr,row);
    if (modelYear) {
      out.counts.certificateAudits++;
      out.counts.modelCycleResolved++;
      if (Number(resolved) !== Number(modelYear)) {
        out.counts.mismatches++;
        if (out.errors.length < 20) out.errors.push('Toolkit cycle year mismatch: '+auditId+' expected='+modelYear+' actual='+resolved);
      }
      if (out.samples.length < 8) out.samples.push({auditId:auditId,modelYear:modelYear,resolvedYear:resolved});
    } else {
      out.counts.abcOnly++;
      var ixExp = _mp_findHeaderIdxCI_(hdr,['Date - Will Expire','Will expire date','Expiry date']);
      var legacy = ixExp >= 0 ? String(row[ixExp] || '').trim() : '';
      if (legacy) out.counts.fallbackToLegacyExpiry++;
    }
  }

  out.gates = {
    ownerLoaded: typeof MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD !== 'undefined',
    allCertificateAuditsUseModelC: out.counts.certificateAudits === out.counts.modelCycleResolved,
    zeroMismatches: out.counts.mismatches === 0,
    noLegacyExpiryFallbackForAbc: out.counts.fallbackToLegacyExpiry === 0
  };
  out.success = Object.keys(out.gates).every(function(k){ return out.gates[k] === true; }) && out.errors.length === 0;
  Logger.log(JSON.stringify(out,null,2));
  if (!out.success) throw new Error('Model C Toolkit cycle-year acceptance failed: '+out.errors.join('; '));
  return out;
}
