// BUILD: 2026-10-01_AUDIT_MANAGER_AVAILABILITY_RELEASE_R2_TARGETED
/**
 * AuditManagerAvailabilityBridge.gs
 * Targeted Manager cancel/deny availability release.
 * Keeps managerV5_releaseAvailability_ name for compatibility.
 *
 * Hot-path rule: never full-scan, full-rewrite, sort, or flush the complete
 * Auditor Availability sheet merely to release one audit.
 */
function managerV5_releaseAvailability_(auditId, opts) {
  var t0 = Date.now();
  opts = opts || {};
  auditId = v5_normAuditId_(auditId);
  if (!auditId) return { success:false, message:'Missing auditId' };

  try {
    var ss = SpreadsheetApp.getActive();
    var shAv = ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
    if (!shAv) return { success:false, message:'Auditor Availability sheet not found' };

    var lastRow = shAv.getLastRow();
    var lastCol = shAv.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return { success:true, changed:0, rows:0, deletedRows:0, message:'No rows', perf:{totalMs:Date.now()-t0} };
    }

    var hdr = shAv.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v || '').trim(); });
    var lc = hdr.map(function(v){ return String(v || '').trim().toLowerCase().replace(/[_\s]+/g, ' '); });
    function hidx_(names) {
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

    if (iId1 < 0 && iId2 < 0) return { success:false, message:'Availability audit ID columns missing' };
    if (typeof AS_isDefaultOrManualBlock_ !== 'function') {
      throw new Error('AuditManagerAvailabilityBridge requires AS_isDefaultOrManualBlock_ from AvailabilityService.js');
    }

    var findT0 = Date.now();
    var rowMap = {};
    function collect_(colIdx) {
      if (colIdx < 0) return;
      var rg = shAv.getRange(2, colIdx + 1, lastRow - 1, 1);
      var hits = rg.createTextFinder(auditId).matchEntireCell(true).findAll() || [];
      for (var h = 0; h < hits.length; h++) rowMap[hits[h].getRow()] = true;
    }
    collect_(iId1);
    collect_(iId2);
    var rowNos = Object.keys(rowMap).map(Number).sort(function(a,b){ return a-b; });
    var findMs = Date.now() - findT0;

    if (!rowNos.length) {
      return { success:true, changed:0, rows:0, deletedRows:0, message:'No matching availability rows', perf:{findMs:findMs,totalMs:Date.now()-t0} };
    }

    var tz = ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
    var todayIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var nowStamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    var changed = 0, rowsTouched = 0, deletedRows = 0;
    var deleteRows = [], writeRows = [];
    var readWriteT0 = Date.now();

    for (var r = 0; r < rowNos.length; r++) {
      var rn = rowNos[r];
      var row = shAv.getRange(rn, 1, 1, lastCol).getValues()[0] || [];
      if (opts.pastOnly && iDate >= 0) {
        var rowDate = '';
        try { rowDate = v5_managerCellToYmd_(row[iDate]); } catch(eDate) {}
        if (rowDate && !(rowDate < todayIso)) continue;
      }

      var rowChanged = false;
      if (iId1 >= 0 && String(row[iId1] || '').trim() === auditId) {
        if (iS1 >= 0) row[iS1] = '';
        if (iE1 >= 0) row[iE1] = '';
        row[iId1] = '';
        if (iSt1 >= 0) row[iSt1] = '';
        changed++; rowChanged = true;
      }
      if (iId2 >= 0 && String(row[iId2] || '').trim() === auditId) {
        if (iS2 >= 0) row[iS2] = '';
        if (iE2 >= 0) row[iE2] = '';
        row[iId2] = '';
        if (iSt2 >= 0) row[iSt2] = '';
        changed++; rowChanged = true;
      }
      if (!rowChanged) continue;
      rowsTouched++;

      var hasAudit1 = iId1 >= 0 && String(row[iId1] || '').trim();
      var hasAudit2 = iId2 >= 0 && String(row[iId2] || '').trim();
      var keepBlocked = AS_isDefaultOrManualBlock_(iSt1 >= 0 ? row[iSt1] : '') || AS_isDefaultOrManualBlock_(iSt2 >= 0 ? row[iSt2] : '');

      if (!hasAudit1 && !hasAudit2 && !keepBlocked) {
        deleteRows.push(rn);
      } else {
        if (iAvail >= 0) row[iAvail] = 'NO';
        if (iUpd >= 0) row[iUpd] = nowStamp;
        writeRows.push({ rowNumber:rn, values:row });
      }
    }

    for (var w = 0; w < writeRows.length; w++) {
      shAv.getRange(writeRows[w].rowNumber, 1, 1, lastCol).setValues([writeRows[w].values]);
    }
    deleteRows.sort(function(a,b){ return b-a; });
    for (var d = 0; d < deleteRows.length; d++) {
      shAv.deleteRow(deleteRows[d]);
      deletedRows++;
    }

    try { if (typeof AS_clearAvailabilitySummaryMapCache_ === 'function') AS_clearAvailabilitySummaryMapCache_(); } catch(eCache) {}

    return {
      success:true,
      changed:changed,
      rows:rowsTouched,
      deletedRows:deletedRows,
      message:'Targeted availability release done',
      perf:{findMs:findMs,readWriteMs:Date.now()-readWriteT0,totalMs:Date.now()-t0},
      build:'2026-10-01_AUDIT_MANAGER_AVAILABILITY_RELEASE_R2_TARGETED'
    };
  } catch (e2) {
    return { success:false, message:String(e2 && e2.message ? e2.message : e2), perf:{totalMs:Date.now()-t0} };
  }
}

// === Rejected audits sheet writing (header-based) ============

