/**
 * FILE: AMS01_AuditorPortalDiagnostic.js
 * BUILD: AMS01_AUDITOR_PORTAL_DIAG_20260907_R1
 * PURPOSE:
 *   Read-only diagnostic for Auditor Portal active-grid fallback cost.
 *   Quantifies how many rows trigger Availability summary fallback today,
 *   and how many of those are still Pending Planning with no plan yet.
 */

var AMS01_AUDITOR_PORTAL_DIAG_BUILD = 'AMS01_AUDITOR_PORTAL_DIAG_20260907_R1';

function AMS01_DiagnoseAuditorPortalFallback() {
  return AMS01_DiagnoseAuditorPortalFallbackFor_('david@agriqa.es');
}

function AMS01_DiagnoseAuditorPortalFallbackFor_(auditorEmail) {
  var t0 = Date.now();
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { success:true, rows:0 };

  var tRead = Date.now();
  var hdr = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(x){ return String(x || '').trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxAuditId = H(['Audit ID','Audit Id','AuditID','AuditId','auditId','Audit UID','Audit_UID','AuditUID']);
  var idxAssigned = H(['Assigned to']);
  var idxPreassigned = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
  var idxStatus = H(['Status']);
  var idxPlanning = H(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
  var idxDatePlanned = H(['Date - Planned','Date planned','Date Planned','Planned date']);
  var idxHoursPlanned = H(['Hours planned','Planned hours','Hours Planned']);

  var maps = auditorV5_buildAuditorMaps_();
  var auditorName = String((maps.emailToName && maps.emailToName[auditorEmail]) || '').trim().toLowerCase();
  var body = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var readMs = Date.now() - tRead;

  var diag = {
    build:AMS01_AUDITOR_PORTAL_DIAG_BUILD,
    auditorEmail:auditorEmail,
    auditorName:auditorName,
    rowsScanned:body.length,
    relevantRows:0,
    currentFallbackRows:0,
    pendingPlanningFallbackRows:0,
    plannedLifecycleFallbackRows:0,
    rowsWithPlanningJson:0,
    rowsWithDatePlanned:0,
    rowsWithHoursPlanned:0,
    rowsWhereSheetColumnsCouldAvoidFallback:0,
    statusCounts:{},
    readMs:readMs,
    availabilitySummaryBuildMs:null,
    availabilitySummarySize:null,
    totalMs:0,
    examples:[]
  };

  function normStatus_(v) {
    try {
      if (typeof Status_normalizeStatus_ === 'function') return Status_normalizeStatus_(v);
    } catch (e) {}
    return String(v || '').trim().toUpperCase().replace(/\s+/g,'_');
  }

  for (var r=0; r<body.length; r++) {
    var row = body[r] || [];
    var assigned = idxAssigned >= 0 ? String(row[idxAssigned] || '').trim().toLowerCase() : '';
    var preassigned = idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim().toLowerCase() : '';
    var assignedMatch = assigned && (assigned === auditorEmail || (auditorName && assigned === auditorName));
    var preassignedMatch = !assignedMatch && !assigned && preassigned && (preassigned === auditorEmail || (auditorName && preassigned === auditorName));
    if (!assignedMatch && !preassignedMatch) continue;

    var status = normStatus_(idxStatus >= 0 ? row[idxStatus] : '');
    if (status === 'COMPLETED') continue;
    if (['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].indexOf(status) < 0) continue;

    diag.relevantRows++;
    diag.statusCounts[status] = Number(diag.statusCounts[status] || 0) + 1;

    var planningCell = idxPlanning >= 0 ? row[idxPlanning] : '';
    var planned = auditorV5_extractPlannedSummary_(planningCell);
    var missingSummary = !planned.plannedDates || !planned.plannedHours;
    var hasPlanningJson = !!String(planningCell || '').trim();
    var hasDatePlanned = idxDatePlanned >= 0 && !!String(row[idxDatePlanned] || '').trim();
    var hasHoursPlanned = idxHoursPlanned >= 0 && row[idxHoursPlanned] !== '' && row[idxHoursPlanned] != null;

    if (hasPlanningJson) diag.rowsWithPlanningJson++;
    if (hasDatePlanned) diag.rowsWithDatePlanned++;
    if (hasHoursPlanned) diag.rowsWithHoursPlanned++;

    if (!missingSummary) continue;
    diag.currentFallbackRows++;

    if (status === 'PENDING_PLANNING' && preassignedMatch && !assignedMatch) {
      diag.pendingPlanningFallbackRows++;
    } else {
      diag.plannedLifecycleFallbackRows++;
    }

    if (hasDatePlanned && hasHoursPlanned) diag.rowsWhereSheetColumnsCouldAvoidFallback++;

    if (diag.examples.length < 8) {
      diag.examples.push({
        row:r+2,
        auditId:idxAuditId >= 0 ? String(row[idxAuditId] || '').trim() : '',
        status:status,
        assignedMatch:!!assignedMatch,
        preassignedMatch:!!preassignedMatch,
        hasPlanningJson:hasPlanningJson,
        hasDatePlanned:hasDatePlanned,
        hasHoursPlanned:hasHoursPlanned
      });
    }
  }

  if (diag.currentFallbackRows > 0 && typeof auditorV5_buildAvailabilitySummaryMap_ === 'function') {
    var tMap = Date.now();
    try {
      var summaryMap = auditorV5_buildAvailabilitySummaryMap_();
      diag.availabilitySummaryBuildMs = Date.now() - tMap;
      diag.availabilitySummarySize = summaryMap ? Object.keys(summaryMap).length : 0;
    } catch (eMap) {
      diag.availabilitySummaryBuildMs = Date.now() - tMap;
      diag.availabilitySummaryError = String(eMap && eMap.message ? eMap.message : eMap);
    }
  }

  diag.totalMs = Date.now() - t0;
  diag.pendingPlanningFallbackSharePct = diag.currentFallbackRows
    ? Math.round((diag.pendingPlanningFallbackRows / diag.currentFallbackRows) * 1000) / 10
    : 0;

  Logger.log('[AMS01_AUDITOR_PORTAL_DIAG] ' + JSON.stringify(diag));
  return { success:true, diagnostics:diag };
}
