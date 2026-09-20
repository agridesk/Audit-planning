/**
 * AMS-01.6 Model C Scope Manager UI read acceptance.
 * READ-ONLY.
 */
var MODEL_C_SCOPE_UI_READ_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_SCOPE_UI_READ_TEST_R1';

function RUN_MODEL_C_SCOPE_UI_READ_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActive();
  var auditId = 'AUD_TEST_AcceptedDelta_HQ_1777979469906_101';
  var companyUid = '89f8171f-0d7a-4de8-9c4c-14a27bd20bdf';
  var out = {
    success:false,
    build:MODEL_C_SCOPE_UI_READ_TEST_BUILD,
    ownerBuild:(typeof MODEL_C_SCOPE_OWNER_BUILD !== 'undefined' ? MODEL_C_SCOPE_OWNER_BUILD : ''),
    readOnly:true,
    writesPerformed:false,
    auditId:auditId,
    companyUid:companyUid,
    gates:{
      modelGapFound:false,
      uiGapFound:false,
      customHoursFromModelC:false,
      usedHoursFromModelC:false
    },
    modelGapHours:null,
    uiGapCustomHours:null,
    uiGapUsedHours:null,
    errors:[]
  };

  try {
    var target = ModelCRecon_readTargets_(ss);
    var rows = target.rows || {};
    var obligations = rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS] || [];
    var links = rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS] || [];
    var linked = {};
    links.forEach(function(link){
      if (String(link.Audit_ID||'') === auditId && String(link.Link_State||'').toUpperCase() === 'ACTIVE') {
        linked[String(link.Obligation_ID||'')] = true;
      }
    });
    var gap = null;
    obligations.some(function(ob){
      if (!linked[String(ob.Obligation_ID||'')]) return false;
      if (String(ob.ScopeCode||'') !== 'MPS-GAP') return false;
      gap = ob;
      return true;
    });
    if (gap) {
      out.gates.modelGapFound = true;
      out.modelGapHours = Number(gap.Formal_Hours);
    } else {
      out.errors.push('Linked Model C MPS-GAP obligation not found');
    }

    var cfg = m5t_getAuditPlanningConfig(companyUid);
    if (!cfg || cfg.success !== true) {
      out.errors.push('m5t_getAuditPlanningConfig failed');
    } else {
      var uiGap = null;
      (cfg.scopes || []).some(function(scope){
        if (String(scope.scope||'') !== 'MPS-GAP') return false;
        uiGap = scope;
        return true;
      });
      if (uiGap) {
        out.gates.uiGapFound = true;
        out.uiGapCustomHours = Number(uiGap.customHours);
        out.uiGapUsedHours = Number(uiGap.usedHours);
      } else {
        out.errors.push('Scope Manager MPS-GAP row not found');
      }
    }

    if (out.gates.modelGapFound && out.gates.uiGapFound) {
      out.gates.customHoursFromModelC = out.uiGapCustomHours === out.modelGapHours;
      out.gates.usedHoursFromModelC = out.uiGapUsedHours === out.modelGapHours;
      if (!out.gates.customHoursFromModelC) out.errors.push('customHours is not Model C Formal_Hours');
      if (!out.gates.usedHoursFromModelC) out.errors.push('usedHours is not Model C Formal_Hours');
    }

    out.success = Object.keys(out.gates).every(function(k){ return out.gates[k] === true; }) && out.errors.length === 0;
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e));
  }

  Logger.log(JSON.stringify(out,null,2));
  if (!out.success) throw new Error('Model C Scope UI read acceptance failed: ' + out.errors.join('; '));
  return out;
}
