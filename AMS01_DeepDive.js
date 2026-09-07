/**
 * FILE: AMS01_DeepDive.js
 * BUILD: AMS01_DEEP_DIVE_20260907_R1
 * PURPOSE:
 *   Read-only diagnostics for two remaining P0 questions:
 *   1) Can getToolkitOpenLiteV5 replace the heavier getToolkitOpenFastV5 open stage
 *      when qualification is hydrated separately by the promoted bundle?
 *   2) Which exact operations dominate Auditor Portal active-grid loop time?
 *
 * SAFETY:
 *   - Read-only business data.
 *   - No status/planning/availability writes.
 *   - No canonical endpoint replacement.
 */

var AMS01_DEEP_DIVE_BUILD = 'AMS01_DEEP_DIVE_20260907_R1';

function AMS01_RunDeepDive() {
  var out = {
    build: AMS01_DEEP_DIVE_BUILD,
    generatedAt: new Date().toISOString(),
    runtimeEnv: (typeof AMS01_env_ === 'function') ? AMS01_env_() : 'UNKNOWN',
    toolkitOpen: AMS01_CompareFastVsLiteOpen_(),
    auditorLoop: AMS01_DiagnoseAuditorGridLoop_('david@agriqa.es')
  };
  try { Logger.log('[AMS01_DEEP_DIVE] ' + JSON.stringify(out)); } catch (eLog) {}
  return out;
}

function AMS01_CompareFastVsLiteOpen_() {
  var auditId = 'AUD_CultiusItxartSCP_HQ_1777531729225_18';
  var monthKey = '2026-09';
  var out = { auditId:auditId, monthKey:monthKey };

  var tFast = Date.now();
  var fast = null;
  try {
    fast = getToolkitOpenFastV5(auditId, monthKey, {
      role:'MANAGER',
      withCalendar:false,
      forceFresh:true
    });
    out.fastMs = Date.now() - tFast;
    out.fastOk = !!(fast && fast.success !== false);
  } catch (eFast) {
    out.fastMs = Date.now() - tFast;
    out.fastOk = false;
    out.fastError = String(eFast && eFast.message ? eFast.message : eFast);
  }

  var tLite = Date.now();
  var lite = null;
  try {
    lite = getToolkitOpenLiteV5(auditId);
    out.liteMs = Date.now() - tLite;
    out.liteOk = !!(lite && lite.success !== false);
  } catch (eLite) {
    out.liteMs = Date.now() - tLite;
    out.liteOk = false;
    out.liteError = String(eLite && eLite.message ? eLite.message : eLite);
  }

  function cleanScalar_(v) {
    if (v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return String(v); }
    }
    return String(v);
  }

  function critical_(res) {
    res = res || {};
    var a = res.audit || {};
    var w = res.window || {};
    var c = res.companyConstraints || {};
    var existingBlocks = Array.isArray(a.existingBlocks) ? a.existingBlocks : [];
    return {
      success:res.success !== false,
      auditId:cleanScalar_(a.auditId || res.auditId),
      companyUid:cleanScalar_(a.companyUid),
      company:cleanScalar_(a.company),
      location:cleanScalar_(a.location),
      status:cleanScalar_(a.status),
      requiredHours:cleanScalar_(a.requiredHours),
      preassignedAuditor:cleanScalar_(a.preassignedAuditor),
      assignedTo:cleanScalar_(a.assignedTo),
      willExpireDate:cleanScalar_(a.willExpireDate),
      extendedExpiryDate:cleanScalar_(a.extendedExpiryDate),
      extensionApplied:!!a.extensionApplied,
      scopesText:cleanScalar_(a.scopesText),
      existingBlocksJson:JSON.stringify(existingBlocks),
      windowStart:cleanScalar_(w.startDate),
      windowEnd:cleanScalar_(w.endDate),
      windowMode:cleanScalar_(w.mode),
      locationsCount:cleanScalar_(res.locationsCount || c.locationsCount),
      hqName:cleanScalar_(res.hqName || c.hqName),
      hqGps:cleanScalar_(res.hqGps || c.hqGps),
      defaultAuditorEmail:cleanScalar_(res.defaultAuditorEmail),
      defaultAuditorName:cleanScalar_(res.defaultAuditorName)
    };
  }

  var fastCrit = critical_(fast);
  var liteCrit = critical_(lite);
  var diffs = [];
  Object.keys(fastCrit).forEach(function(k) {
    if (JSON.stringify(fastCrit[k]) !== JSON.stringify(liteCrit[k])) {
      diffs.push({ field:k, fast:fastCrit[k], lite:liteCrit[k] });
    }
  });

  out.fastServerMs = fast && (fast.__serverMs != null ? fast.__serverMs : fast.serverMs);
  out.liteServerMs = lite && (lite.__serverMs != null ? lite.__serverMs : lite.serverMs);
  out.criticalEqual = diffs.length === 0;
  out.criticalDiffs = diffs;
  out.fastAuditorCount = fast && Array.isArray(fast.auditors) ? fast.auditors.length : null;
  out.liteAuditorCount = lite && Array.isArray(lite.auditors) ? lite.auditors.length : null;
  out.fastPayloadBytes = AMS01_DD_bytes_(fast);
  out.litePayloadBytes = AMS01_DD_bytes_(lite);
  out.fastCritical = fastCrit;
  out.liteCritical = liteCrit;
  return out;
}

function AMS01_DiagnoseAuditorGridLoop_(auditorEmail) {
  var t0 = Date.now();
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  var ss = auditorV5_getSs_();
  var maps = auditorV5_buildAuditorMaps_();
  var auditorName = String((maps.emailToName && maps.emailToName[auditorEmail]) || '').trim();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:'Missing Audit planning' };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(x){ return String(x||'').trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxAuditId = H(['Audit ID','Audit Id','AuditID','AuditId']);
  var idxCompany = H(['Company','Company name','Client']);
  var idxAssigned = H(['Assigned to']);
  var idxPreassigned = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
  var idxStatus = H(['Status']);
  var idxPlanning = H(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
  var idxAllowSelfPlanning = H(['Self planning','Self Planning','Allow self planning','Allow Self Planning','SelfPlanning']);

  var tRead = Date.now();
  var body = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var readMs = Date.now() - tRead;

  var matched = [];
  var wantedCompanies = {};
  var tMatch = Date.now();
  for (var r=0; r<body.length; r++) {
    var row = body[r] || [];
    var assigned = idxAssigned >= 0 ? String(row[idxAssigned] || '').trim().toLowerCase() : '';
    var preassigned = idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim().toLowerCase() : '';
    var assignedMatch = !!assigned && (assigned === auditorEmail || (!!auditorName && assigned === auditorName.toLowerCase()));
    var preassignedMatch = !assignedMatch && !assigned && !!preassigned && (preassigned === auditorEmail || (!!auditorName && preassigned === auditorName.toLowerCase()));
    if (!assignedMatch && !preassignedMatch) continue;

    var statusRaw = idxStatus >= 0 ? String(row[idxStatus] || '').trim() : '';
    var statusNorm = (typeof Status_normalizeStatus_ === 'function')
      ? Status_normalizeStatus_(statusRaw)
      : statusRaw.toUpperCase().replace(/\s+/g,'_');
    if (['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].indexOf(statusNorm) < 0) continue;
    var company = idxCompany >= 0 ? String(row[idxCompany] || '').trim() : '';
    if (company) wantedCompanies[company.toLowerCase()] = true;
    matched.push({ row:row, rowNumber:r+2, statusNorm:statusNorm, assignedMatch:assignedMatch, preassignedMatch:preassignedMatch });
  }
  var matchMs = Date.now() - tMatch;

  var tCompanies = Date.now();
  var companyInfo = auditorV5_buildCompaniesLookupForNames_(Object.keys(wantedCompanies));
  var companiesMs = Date.now() - tCompanies;

  var availabilityMap = null;
  var timings = {
    extractPlannedMs:0,
    availabilityBuildMs:0,
    availabilityLookupMs:0,
    scopesMs:0,
    miscMs:0
  };
  var counts = {
    matched:matched.length,
    pendingPlanning:0,
    availabilityFallbackRowsCurrent:0,
    availabilityFallbackRowsNeededIfPendingSkipped:0,
    scopesCalls:0
  };
  var examples = [];
  var tLoop = Date.now();

  for (var m=0; m<matched.length; m++) {
    var item = matched[m];
    var row = item.row;
    if (item.statusNorm === 'PENDING_PLANNING') counts.pendingPlanning++;
    var auditId = idxAuditId >= 0 ? String(row[idxAuditId] || '').trim() : '';
    var js = idxPlanning >= 0 ? row[idxPlanning] : '';

    var tx = Date.now();
    var planned = auditorV5_extractPlannedSummary_(js);
    timings.extractPlannedMs += Date.now() - tx;

    var currentNeedsFallback = (!planned.plannedDates || !planned.plannedHours) && !!auditId;
    if (currentNeedsFallback) {
      counts.availabilityFallbackRowsCurrent++;
      if (item.statusNorm !== 'PENDING_PLANNING') counts.availabilityFallbackRowsNeededIfPendingSkipped++;
      if (!availabilityMap) {
        tx = Date.now();
        availabilityMap = auditorV5_buildAvailabilitySummaryMap_();
        timings.availabilityBuildMs += Date.now() - tx;
      }
      tx = Date.now();
      var pf = auditorV5_plannedSummaryFromAvailabilityMap_(availabilityMap, auditId);
      timings.availabilityLookupMs += Date.now() - tx;
      if (pf) {
        planned.plannedDates = planned.plannedDates || pf.plannedDates;
        planned.plannedHours = planned.plannedHours || pf.plannedHours;
      }
    }

    tx = Date.now();
    var scopesPack = auditorV5_extractScopesForRow_(hdr, row);
    timings.scopesMs += Date.now() - tx;
    counts.scopesCalls++;

    tx = Date.now();
    var company = idxCompany >= 0 ? String(row[idxCompany] || '').trim() : '';
    var ci = (companyInfo.byName && companyInfo.byName[company.toLowerCase()]) || {};
    var allowSelfPlanning = idxAllowSelfPlanning >= 0 ? String(row[idxAllowSelfPlanning] || '') : '';
    var sink = [company, ci.companyUid || '', allowSelfPlanning, scopesPack && scopesPack.scopesText || '', planned.plannedDates || ''].join('|');
    timings.miscMs += Date.now() - tx;

    if (examples.length < 5 && currentNeedsFallback) {
      examples.push({ auditId:auditId, status:item.statusNorm, planningJsonPresent:!!js, fallbackAfterPendingSkip:item.statusNorm !== 'PENDING_PLANNING', sinkLength:sink.length });
    }
  }

  var loopMs = Date.now() - tLoop;
  return {
    success:true,
    build:AMS01_DEEP_DIVE_BUILD,
    auditorEmail:auditorEmail,
    auditorName:auditorName,
    rowsScanned:body.length,
    readMs:readMs,
    matchMs:matchMs,
    companiesMs:companiesMs,
    loopMs:loopMs,
    totalMs:Date.now()-t0,
    counts:counts,
    timings:timings,
    examples:examples
  };
}

function AMS01_DD_bytes_(obj) {
  try { return Utilities.newBlob(JSON.stringify(obj || {})).getBytes().length; } catch (e) { return null; }
}
