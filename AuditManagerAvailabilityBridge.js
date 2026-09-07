// BUILD: AUDIT_MANAGER_AVAILABILITY_BRIDGE_SPLIT_20260425
/**
 * AuditManagerAvailabilityBridge.gs
 * Extracted from ManagerV5.js without behavior changes.
 * Keeps managerV5_releaseAvailability_ name for compatibility.
 */
function managerV5_releaseAvailability_(auditId, opts) {
  opts = opts || {};
  auditId = v5_normAuditId_(auditId);
  if (!auditId) return { success:false, message:'Missing auditId' };

  try {
    if (!opts.pastOnly && typeof V5_availabilityClearAuditId_ === 'function') {
      var fast = V5_availabilityClearAuditId_(auditId);
      if (fast && fast.success !== false) return fast;
    }
  } catch (e0) {}

  try {
    var ss = SpreadsheetApp.getActive();
    var shAv = ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
    if (!shAv) return { success:false, message:'Auditor Availability sheet not found' };

    var lastRow = shAv.getLastRow();
    var lastCol = shAv.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { success:true, changed:0, rows:0, message:'No rows' };

    var hdr = shAv.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v || '').trim(); });
    function hidx_(names) {
      var lc = hdr.map(function(v){ return String(v || '').trim().toLowerCase().replace(/[_\s]+/g, ' '); });
      for (var i = 0; i < names.length; i++) {
        var key = String(names[i] || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
        var idx = lc.indexOf(key);
        if (idx >= 0) return idx;
      }
      return -1;
    }

    var iDate = hidx_(['Date']);
    var iAvail = hidx_(['Available']);
    var iS1 = hidx_(['First_Audit_Start_Time','First Audit Start Time']);
    var iE1 = hidx_(['First_Audit_End_Time','First Audit End Time']);
    var iId1 = hidx_(['Audit_ID_1','Audit ID 1']);
    var iS2 = hidx_(['Second_Audit_Start_Time','Second Audit Start Time']);
    var iE2 = hidx_(['Second_Audit_End_Time','Second Audit End Time']);
    var iId2 = hidx_(['Audit_ID_2','Audit ID 2']);
    var iSt1 = hidx_(['Status_1','Status 1','Status']);
    var iSt2 = hidx_(['Status_2','Status 2']);
    var iUpd = hidx_(['Last_Updated','Last Updated','Timestamp']);
    var iEmail = hidx_(['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']);

    var tz = (function(){
      try {
        var ss2 = SpreadsheetApp.getActive();
        return (ss2 && ss2.getSpreadsheetTimeZone) ? ss2.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
      } catch(e){ return Session.getScriptTimeZone(); }
    })();

    var todayIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var vals = shAv.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var changed = 0, rowsTouched = 0;
    var deleteRowIdxs_ = [];

    if (typeof AS_isDefaultOrManualBlock_ !== 'function') {
      throw new Error('AuditManagerAvailabilityBridge requires AS_isDefaultOrManualBlock_ from AvailabilityService.js');
    }

    for (var rr = 0; rr < vals.length; rr++) {
      var row = vals[rr];
      var rowChanged = false;
      var rowDate = '';
      if (iDate >= 0) {
        try { rowDate = v5_managerCellToYmd_(row[iDate]); } catch(e1) { rowDate = ''; }
      }
      if (opts.pastOnly && rowDate && !(rowDate < todayIso)) continue;

      if (iId1 >= 0 && String(row[iId1] || '').trim() === auditId) {
        if (iS1 >= 0) row[iS1] = '';
        if (iE1 >= 0) row[iE1] = '';
        row[iId1] = '';
        if (iSt1 >= 0) row[iSt1] = '';
        changed++;
        rowChanged = true;
      }
      if (iId2 >= 0 && String(row[iId2] || '').trim() === auditId) {
        if (iS2 >= 0) row[iS2] = '';
        if (iE2 >= 0) row[iE2] = '';
        row[iId2] = '';
        if (iSt2 >= 0) row[iSt2] = '';
        changed++;
        rowChanged = true;
      }

      if (!rowChanged) continue;
      rowsTouched++;

      var hasAudit1 = (iId1 >= 0) && String(row[iId1] || '').trim();
      var hasAudit2 = (iId2 >= 0) && String(row[iId2] || '').trim();
      var keepBlocked = AS_isDefaultOrManualBlock_(iSt1 >= 0 ? row[iSt1] : '') || AS_isDefaultOrManualBlock_(iSt2 >= 0 ? row[iSt2] : '');

      if (!hasAudit1 && !hasAudit2) {
        if (keepBlocked) {
          if (iAvail >= 0) row[iAvail] = 'NO';
          if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
        } else {
          deleteRowIdxs_.push(rr + 2);
        }
      } else {
        if (iAvail >= 0) row[iAvail] = 'NO';
        if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
      }
    }

    if (changed) {
      shAv.getRange(2, 1, lastRow - 1, lastCol).setValues(vals);
      if (deleteRowIdxs_.length) {
        deleteRowIdxs_.sort(function(a, b){ return b - a; });
        for (var dd = 0; dd < deleteRowIdxs_.length; dd++) shAv.deleteRow(deleteRowIdxs_[dd]);
      }
      try {
        var sortDateCol = (iDate >= 0) ? (iDate + 1) : 1;
        var lrNow = shAv.getLastRow();
        if (lrNow >= 3) {
          if (iEmail >= 0) shAv.getRange(2, 1, lrNow - 1, lastCol).sort([{column:sortDateCol, ascending:true},{column:iEmail + 1, ascending:true}]);
          else shAv.getRange(2, 1, lrNow - 1, lastCol).sort([{column:sortDateCol, ascending:true}]);
        }
      } catch (eSort) {}
      SpreadsheetApp.flush();
    }

    return { success:true, changed:changed, rows:rowsTouched, message:'Availability release done' };
  } catch (e2) {
    return { success:false, message:String(e2 && e2.message ? e2.message : e2) };
  }
}

// === Rejected audits sheet writing (header-based) ============

