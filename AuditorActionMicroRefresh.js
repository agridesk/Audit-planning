// BUILD: 2026-10-01_AUDITOR_ACTION_MICRO_REREAD_R1
// Targeted client contract for Cancel/Deny after StatusMachine has confirmed the write.
// StatusMachine remains the sole lifecycle writer. This file is read-only.

function AuditorV5B_GetAuditPatch_U20261001(req) {
  req = req || {};
  var auditId = String(req.auditId || '').trim();
  var auditorEmail = String(req.auditorEmail || '').trim().toLowerCase();
  if (!auditId) return { success:false, message:'AUDIT_ID_REQUIRED' };
  if (!auditorEmail) return { success:false, message:'AUDITOR_EMAIL_REQUIRED' };

  var started = Date.now();
  var grid;
  try {
    grid = AuditorV5B_GetAuditorGrid_U20409({
      view: 'all',
      auditorEmail: auditorEmail,
      noCache: true,
      background: true
    });
  } catch (eGrid) {
    return { success:false, message:'AUDITOR_CANONICAL_REREAD_FAILED: ' + String(eGrid && eGrid.message ? eGrid.message : eGrid) };
  }
  if (!grid || grid.success === false) return grid || { success:false, message:'AUDITOR_CANONICAL_REREAD_FAILED' };

  var rows = Array.isArray(grid.rows) ? grid.rows : [];
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i] && rows[i].auditId || '').trim() === auditId) { row = rows[i]; break; }
  }
  if (!row) return { success:false, message:'AUDIT_NOT_VISIBLE_AFTER_CANONICAL_REREAD', auditId:auditId };

  try {
    var ss = auditorV5_getSs_();
    var sh = ss.getSheetByName('Audit planning');
    if (sh) {
      var values = sh.getDataRange().getValues();
      if (values && values.length > 1) {
        var h = values[0].map(function(x){ return String(x == null ? '' : x).trim(); });
        function ix(names) {
          for (var n = 0; n < names.length; n++) {
            var j = h.indexOf(names[n]);
            if (j >= 0) return j;
          }
          return -1;
        }
        var iAudit = ix(['Audit ID','Audit_ID','AuditId','Audit Id']);
        var iMc = ix(['Manager comment (last)']);
        var iMd = ix(['Last manager decision']);
        var iMt = ix(['Last decision timestamp']);
        var iAc = ix(['Auditor comment (last)']);
        var iAd = ix(['Last auditor decision']);
        var iAt = ix(['Last auditor decision timestamp']);
        var iSs = ix(['Status since']);
        for (var r = 1; r < values.length; r++) {
          if (iAudit >= 0 && String(values[r][iAudit] || '').trim() === auditId) {
            function v(idx){ return idx >= 0 ? String(values[r][idx] == null ? '' : values[r][idx]).trim() : ''; }
            row.managerComment = v(iMc);
            row.managerDecision = v(iMd);
            row.managerDecisionTimestamp = v(iMt);
            row.auditorComment = v(iAc);
            row.auditorDecision = v(iAd);
            row.auditorDecisionTimestamp = v(iAt);
            row.statusSince = v(iSs);
            var latestTs = '', latestComment = '', latestActor = '', latestAction = '';
            if (row.managerComment || row.managerDecisionTimestamp) {
              latestTs = row.managerDecisionTimestamp;
              latestComment = row.managerComment;
              latestActor = 'Manager';
              latestAction = row.managerDecision;
            }
            if ((row.auditorComment || row.auditorDecisionTimestamp) && (!latestTs || row.auditorDecisionTimestamp > latestTs)) {
              latestTs = row.auditorDecisionTimestamp;
              latestComment = row.auditorComment;
              latestActor = 'Auditor';
              latestAction = row.auditorDecision;
            }
            row.latestComment = latestComment;
            row.latestCommentActor = latestActor;
            row.latestCommentAction = latestAction;
            row.latestCommentTimestamp = latestTs;
            break;
          }
        }
      }
    }
  } catch (eComment) {
    row.commentReadWarning = String(eComment && eComment.message ? eComment.message : eComment);
  }

  return {
    success:true,
    auditId:auditId,
    row:row,
    serverMs:Date.now() - started,
    build:'2026-10-01_AUDITOR_ACTION_MICRO_REREAD_R1'
  };
}
