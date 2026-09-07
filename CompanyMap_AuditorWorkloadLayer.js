// CompanyMap_AuditorWorkloadLayer.gs
// BUILD: COMPANY_MAP_AUDITOR_WORKLOAD_LAYER_C05_20260524_TIME_IN_AUDIT_CARD
// Purpose: read-only auditor workload overlay for existing Company Map.
// Depends on existing CompanyMap_getDataset_C04()/getCompanyMapDataset_C04() and CompaniesBackend helpers.
// Owner: Company Map visualization dataset only. No planning/status/availability writes.

function getCompanyMapDataset_AuditorLayer(auditorEmail) {
  return CompanyMap_getDataset_AuditorLayer_C01(auditorEmail);
}

function getCompanyMapDataset_C05(auditorEmail) {
  return CompanyMap_getDataset_AuditorLayer_C01(auditorEmail);
}

function CompanyMap_getDataset_AuditorLayer_C01(auditorEmail) {
  var base = CompanyMap_getBaseDatasetForAuditorLayer_();
  base.build = 'COMPANY_MAP_AUDITOR_WORKLOAD_LAYER_C05_20260524_TIME_IN_AUDIT_CARD';
  base.auditLayers = CompanyMap_buildAuditLayers_C02_(base, auditorEmail);
  return base;
}

function CompanyMap_getBaseDatasetForAuditorLayer_() {
  if (typeof CompanyMap_getDataset_C04 === 'function') return CompanyMap_getDataset_C04();
  if (typeof getCompanyMapDataset_C04 === 'function') return getCompanyMapDataset_C04();
  if (typeof CompanyMap_getDataset === 'function') return CompanyMap_getDataset();
  if (typeof getCompanyMapDataset === 'function') return getCompanyMapDataset();
  throw new Error('Missing Company Map base dataset function: CompanyMap_getDataset_C04');
}

function CompanyMap_buildAuditLayers_C02_(baseDataset, auditorEmail) {
  var email = CompanyMap_normEmail_(auditorEmail || CompanyMap_getSessionEmailSafe_());
  var out = {
    success: true,
    currentAuditorEmail: email,
    myAuditWorkload: [],
    otherFutureAudits: [],
    diagnostics: {
      rowsRead: 0,
      rowsSkippedNoAuditId: 0,
      rowsSkippedStatus: 0,
      rowsSkippedNoGpsMatch: 0,
      rowsSkippedNoAuditorForMyLayer: 0,
      myRowsIncluded: 0,
      otherRowsIncluded: 0,
      auditorEmailResolved: !!email
    }
  };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) {
    out.success = false;
    out.message = "Missing sheet 'Audit planning'";
    return out;
  }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return out;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0] || [];
  var col = CompanyMap_getAuditPlanningColumns_C01_(headers);
  var locIndex = CompanyMap_buildLocationEntityIndex_C01_(baseDataset);
  var scopeLabelMap = CompanyMap_buildScopeLabelMap_C03_(ss);

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    if (CompanyMap_rowIsEmpty_C01_(row)) continue;
    out.diagnostics.rowsRead++;

    var auditId = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.auditId));
    if (!auditId) auditId = 'ROW_' + (r + 1);

    var statusRaw = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.status));
    var status = CompanyMap_normalizeStatus_C01_(statusRaw);
    var allowedActiveStatus = CompanyMap_isActiveAuditStatusForMap_C01_(status);
    var pendingPlanning = status === 'Pending Planning';

    var companyUid = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.companyUid));
    var companyName = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.company));
    var locationRaw = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.location));
    var planningJsonRaw = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.planningJson));
    var planningInfo = CompanyMap_parsePlanningInfo_C01_(planningJsonRaw);

    var assignedAuditor = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.assignedAuditor));
    var preassignedAuditor = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.preassignedAuditor));
    if (!assignedAuditor && planningInfo.assignedAuditor) assignedAuditor = planningInfo.assignedAuditor;
    if (!preassignedAuditor && planningInfo.preassignedAuditor) preassignedAuditor = planningInfo.preassignedAuditor;

    var assignedEmail = CompanyMap_normEmail_(assignedAuditor);
    var preassignedEmail = CompanyMap_normEmail_(preassignedAuditor);
    var isOwnAssigned = !!(email && assignedEmail && email === assignedEmail);
    var isOwnPreassigned = !!(email && preassignedEmail && email === preassignedEmail);
    var isOwn = isOwnAssigned || isOwnPreassigned;

    if (!allowedActiveStatus && !(pendingPlanning && isOwnPreassigned)) {
      out.diagnostics.rowsSkippedStatus++;
      continue;
    }

    if (!email && (pendingPlanning || allowedActiveStatus)) {
      out.diagnostics.rowsSkippedNoAuditorForMyLayer++;
    }

    var scopesLabel = CompanyMap_extractScopesLabel_C03_(headers, row, col, planningInfo, scopeLabelMap);
    var dateLabel = CompanyMap_firstNonEmpty_C01_([
      planningInfo.dateLabel,
      CompanyMap_formatDateCell_C01_(CompanyMap_getCellByCol_(row, col.plannedDate)),
      CompanyMap_formatDateCell_C01_(CompanyMap_getCellByCol_(row, col.auditDate)),
      CompanyMap_formatDateCell_C01_(CompanyMap_getCellByCol_(row, col.startDate))
    ]);
    var timeLabel = CompanyMap_firstNonEmpty_C01_([
      planningInfo.timeLabel,
      CompanyMap_joinTimeLabel_C01_(CompanyMap_getCellByCol_(row, col.startTime), CompanyMap_getCellByCol_(row, col.endTime))
    ]);
    var auditHours = CompanyMap_firstNonEmpty_C01_([
      CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, col.auditHours)),
      planningInfo.auditHours
    ]);

    var locCode = CompanyMap_normLocationCodeForMap_C01_(planningInfo.locationCode || locationRaw);
    var matchedLocation = CompanyMap_findBestLocationEntity_C01_(locIndex, companyUid, companyName, locCode, locationRaw);
    if (!matchedLocation || !matchedLocation.gpsValid) {
      out.diagnostics.rowsSkippedNoGpsMatch++;
      continue;
    }

    var layerType = isOwn ? 'MY_AUDIT_WORKLOAD' : 'OTHER_FUTURE_AUDITS';
    if (!isOwn && !allowedActiveStatus) continue;

    var entity = CompanyMap_buildAuditEntity_C01_({
      auditId: auditId,
      rowNumber: r + 1,
      layerType: layerType,
      status: status || statusRaw,
      displayStatus: CompanyMap_displayStatus_C02_(statusRaw, status),
      companyUid: companyUid,
      companyName: companyName || matchedLocation.companyName,
      locationRaw: locationRaw,
      locationCode: matchedLocation.locationCode || locCode || 'HQ',
      locationLabel: matchedLocation.locationLabel || locationRaw || '',
      matchedLocation: matchedLocation,
      dateLabel: dateLabel,
      timeLabel: timeLabel,
      scopesLabel: scopesLabel,
      auditHours: auditHours,
      planningSource: planningInfo.__source || '',
      assignedAuditor: assignedAuditor,
      preassignedAuditor: preassignedAuditor
    });

    if (isOwn) {
      out.myAuditWorkload.push(entity);
      out.diagnostics.myRowsIncluded++;
    } else {
      out.otherFutureAudits.push(entity);
      out.diagnostics.otherRowsIncluded++;
    }
  }

  out.myAuditWorkload.sort(CompanyMap_sortAuditEntities_C01_);
  out.otherFutureAudits.sort(CompanyMap_sortAuditEntities_C01_);
  return out;
}

function CompanyMap_getAuditPlanningColumns_C01_(headers) {
  return {
    auditId: CompanyMap_findHeader_C01_(headers, ['Audit ID', 'Audit_ID', 'auditId']),
    status: CompanyMap_findHeader_C01_(headers, ['Status', 'Audit status', 'Planning status']),
    companyUid: CompanyMap_findHeader_C01_(headers, ['Company_UID', 'Company UID', 'UID']),
    company: CompanyMap_findHeader_C01_(headers, ['Company', 'Company name', 'Client']),
    location: CompanyMap_findHeader_C01_(headers, ['Location', 'Site', 'Locatie']),
    planningJson: CompanyMap_findHeader_C01_(headers, ['Planning JSON', 'Planning_JSON', 'PlanningJSON', 'Planning']),
    assignedAuditor: CompanyMap_findHeader_C01_(headers, ['Assigned to', 'Assigned auditor', 'Assigned auditor email', 'Auditor', 'Auditor e-mail', 'Auditor email']),
    preassignedAuditor: CompanyMap_findHeader_C01_(headers, ['Preassigned auditor', 'Pre-assigned auditor', 'Preassigned to', 'Preassigned auditor email', 'Preassigned', 'Pre assignment', 'Preassignment']),
    scopes: CompanyMap_findHeader_C01_(headers, ['Scopes', 'Scope', 'Audit scopes', 'Audit scope', 'Standards']),
    plannedDate: CompanyMap_findHeader_C01_(headers, ['Planned date', 'Planned audit date', 'Planning date', 'Date planned']),
    auditDate: CompanyMap_findHeader_C01_(headers, ['Audit date', 'Date', 'Audit planned date']),
    startDate: CompanyMap_findHeader_C01_(headers, ['Start date', 'From date', 'Plan van', 'Planned from']),
    startTime: CompanyMap_findHeader_C01_(headers, ['Start time', 'Start', 'From time']),
    endTime: CompanyMap_findHeader_C01_(headers, ['End time', 'End', 'To time']),
    auditHours: CompanyMap_findHeader_C01_(headers, ['Audit hours', 'Hours', 'Audit time', 'Planned hours'])
  };
}

function CompanyMap_findHeader_C01_(headers, aliases) {
  var normHeaders = (headers || []).map(function(h){ return CompanyMap_normHeader_C01_(h); });
  var normAliases = (aliases || []).map(function(a){ return CompanyMap_normHeader_C01_(a); });
  for (var i = 0; i < normHeaders.length; i++) {
    for (var j = 0; j < normAliases.length; j++) {
      if (normHeaders[i] && normHeaders[i] === normAliases[j]) return i;
    }
  }
  for (var i2 = 0; i2 < normHeaders.length; i2++) {
    for (var j2 = 0; j2 < normAliases.length; j2++) {
      var nh = normHeaders[i2];
      var na = normAliases[j2];
      if (nh && na && (nh.indexOf(na) >= 0 || na.indexOf(nh) >= 0)) return i2;
    }
  }
  return -1;
}

function CompanyMap_normHeader_C01_(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function CompanyMap_getCellByCol_(row, col) {
  return col >= 0 ? row[col] : '';
}

function CompanyMap_buildLocationEntityIndex_C01_(baseDataset) {
  var idx = {
    byUidCode: {},
    byUidLocationName: {},
    byUid: {},
    byNameCode: {},
    byNameLocationName: {},
    byName: {}
  };

  (baseDataset.entities || []).forEach(function(e) {
    if (!e || !e.gpsValid) return;

    var uid = CompanyMap_cellStr_(e.companyId);
    var companyNameKey = CompanyMap_normKey_C01_(e.companyName);
    var code = CompanyMap_normLocationCodeForMap_C01_(e.locationCode);
    var locationNameKey = CompanyMap_normKey_C04_(e.locationLabel || e.locationName || e.location || e.locationCode);

    if (uid && code) idx.byUidCode[uid + '|' + code] = e;
    if (uid && locationNameKey) idx.byUidLocationName[uid + '|' + locationNameKey] = e;
    if (uid && !idx.byUid[uid]) idx.byUid[uid] = e;

    if (companyNameKey && code) idx.byNameCode[companyNameKey + '|' + code] = e;
    if (companyNameKey && locationNameKey) idx.byNameLocationName[companyNameKey + '|' + locationNameKey] = e;
    if (companyNameKey && !idx.byName[companyNameKey]) idx.byName[companyNameKey] = e;
  });

  return idx;
}

function CompanyMap_findBestLocationEntity_C01_(idx, companyUid, companyName, locCode, locationRaw) {
  var uid = CompanyMap_cellStr_(companyUid);
  var companyNameKey = CompanyMap_normKey_C01_(companyName);
  var code = CompanyMap_normLocationCodeForMap_C01_(locCode || locationRaw || 'HQ') || 'HQ';
  var rawLocationKey = CompanyMap_normKey_C04_(locationRaw);
  var rawAsCode = CompanyMap_normLocationCodeForMap_C01_(locationRaw);

  return (uid && rawAsCode && idx.byUidCode[uid + '|' + rawAsCode]) ||
         (uid && code && idx.byUidCode[uid + '|' + code]) ||
         (uid && rawLocationKey && idx.byUidLocationName[uid + '|' + rawLocationKey]) ||
         (companyNameKey && rawAsCode && idx.byNameCode[companyNameKey + '|' + rawAsCode]) ||
         (companyNameKey && code && idx.byNameCode[companyNameKey + '|' + code]) ||
         (companyNameKey && rawLocationKey && idx.byNameLocationName[companyNameKey + '|' + rawLocationKey]) ||
         (uid && idx.byUid[uid]) ||
         (companyNameKey && idx.byName[companyNameKey]) ||
         null;
}

function CompanyMap_normKey_C04_(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9]+/g, '');
}

function CompanyMap_buildAuditEntity_C01_(p) {
  var e = p.matchedLocation || {};
  var isOwn = p.layerType === 'MY_AUDIT_WORKLOAD';
  return {
    entityType: isOwn ? 'AUDIT_MY_WORKLOAD' : 'AUDIT_OTHER_FUTURE',
    entityId: 'AUDIT|' + String(p.auditId || '') + '|' + String(p.locationCode || 'HQ') + '|' + p.layerType,
    auditLayer: p.layerType,
    source: 'Audit planning',
    auditId: String(p.auditId || ''),
    rowNumber: p.rowNumber || '',
    companyId: p.companyUid || e.companyId || '',
    companyName: p.companyName || e.companyName || '',
    locationCode: p.locationCode || e.locationCode || 'HQ',
    locationLabel: p.locationLabel || e.locationLabel || '',
    rawGps: e.rawGps || '',
    lat: e.lat,
    lng: e.lng,
    gpsValid: !!e.gpsValid,
    country: e.country || '',
    region: e.region || '',
    active: true,
    status: p.displayStatus || p.status || '',
    auditStatus: p.displayStatus || p.status || '',
    dateLabel: p.dateLabel || '',
    timeLabel: p.timeLabel || '',
    scopesLabel: p.scopesLabel || '',
    auditHours: p.auditHours || '',
    assignedAuditor: p.assignedAuditor || '',
    preassignedAuditor: p.preassignedAuditor || '',
    markerLabel: CompanyMap_compactAuditMarkerLabel_C01_(p.companyName || e.companyName || '', p.dateLabel || '', p.scopesLabel || ''),
    operationalTitle: CompanyMap_compactAuditMarkerLabel_C01_(p.companyName || e.companyName || '', p.dateLabel || '', p.scopesLabel || ''),
    mapsUrl: e.mapsUrl || ''
  };
}

function CompanyMap_compactAuditMarkerLabel_C01_(company, dateLabel, scopesLabel) {
  return [company, dateLabel, scopesLabel].filter(function(x){ return !!CompanyMap_cellStr_(x); }).join('\n');
}


function CompanyMap_displayStatus_C02_(rawStatus, normalizedStatus) {
  var raw = CompanyMap_cellStr_(rawStatus);
  if (raw) return raw;
  return CompanyMap_cellStr_(normalizedStatus);
}

function CompanyMap_extractScopesLabel_C03_(headers, row, col, planningInfo, scopeLabelMap) {
  var fromPlanning = CompanyMap_translateScopeLabelList_C03_(CompanyMap_cleanScopeLabel_C02_(planningInfo && planningInfo.scopesLabel), scopeLabelMap);
  if (fromPlanning) return fromPlanning;

  var explicit = CompanyMap_translateScopeLabelList_C03_(CompanyMap_cleanScopeLabel_C02_(CompanyMap_getCellByCol_(row, col.scopes)), scopeLabelMap);
  if (explicit && !CompanyMap_isMarkerOnly_C02_(explicit)) return explicit;

  var out = [];
  var seen = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var h = CompanyMap_cellStr_(headers[i]);
    var v = CompanyMap_cellStr_(row[i]);
    if (!h || !v) continue;
    if (!CompanyMap_headerLooksLikeScope_C02_(h)) continue;

    if (CompanyMap_isMarkerOnly_C02_(v)) {
      CompanyMap_pushScopeLabel_C03_(out, seen, h, scopeLabelMap);
    } else if (CompanyMap_valueLooksLikeScopeList_C02_(v)) {
      String(v).split(/[;,]/).forEach(function(part){ CompanyMap_pushScopeLabel_C03_(out, seen, part, scopeLabelMap); });
    }
  }
  return out.join(', ');
}

function CompanyMap_buildScopeLabelMap_C03_(ss) {
  var map = {};
  try {
    var sh = ss.getSheetByName('Config_Scopes');
    if (!sh) return map;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return map;

    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0] || [];
    var colSlot = CompanyMap_findHeader_C01_(headers, ['SlotKey', 'Slot Key', 'Slot']);
    var colCode = CompanyMap_findHeader_C01_(headers, ['ScopeCode', 'Scope Code', 'Code']);
    var colDisplay = CompanyMap_findHeader_C01_(headers, ['DisplayName', 'Display Name', 'Name']);
    var colActive = CompanyMap_findHeader_C01_(headers, ['Active']);
    var colArchived = CompanyMap_findHeader_C01_(headers, ['Archived']);

    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var slot = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, colSlot));
      var code = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, colCode));
      var display = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, colDisplay));
      if (!slot && !code && !display) continue;

      var active = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, colActive)).toLowerCase();
      var archived = CompanyMap_cellStr_(CompanyMap_getCellByCol_(row, colArchived)).toLowerCase();
      if (active && ['no','n','false','0','inactive'].indexOf(active) >= 0) continue;
      if (archived && ['yes','y','true','1','x'].indexOf(archived) >= 0) continue;

      var label = display || code || slot;
      [slot, code, display].forEach(function(k) {
        CompanyMap_putScopeMapKey_C03_(map, k, label);
      });
    }
  } catch (e) {
    try { Logger.log('[CompanyMap][C03] Config_Scopes scope map failed: ' + e); } catch (_) {}
  }
  return map;
}

function CompanyMap_putScopeMapKey_C03_(map, key, label) {
  var k = CompanyMap_scopeMapKey_C03_(key);
  if (!k || !label) return;
  map[k] = CompanyMap_cellStr_(label);
}

function CompanyMap_scopeMapKey_C03_(v) {
  var s = CompanyMap_cellStr_(v);
  if (!s) return '';
  return s.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function CompanyMap_translateScopeToken_C03_(token, scopeLabelMap) {
  var s = CompanyMap_cellStr_(token).trim();
  if (!s) return '';
  var k = CompanyMap_scopeMapKey_C03_(s);
  return (scopeLabelMap && scopeLabelMap[k]) ? scopeLabelMap[k] : s.replace(/_/g, '-');
}

function CompanyMap_translateScopeLabelList_C03_(value, scopeLabelMap) {
  var s = CompanyMap_cellStr_(value);
  if (!s) return '';
  var out = [];
  var seen = {};
  String(s).split(/[;,]/).forEach(function(part){
    CompanyMap_pushScopeLabel_C03_(out, seen, part, scopeLabelMap);
  });
  return out.join(', ');
}

function CompanyMap_pushScopeLabel_C03_(out, seen, raw, scopeLabelMap) {
  var translated = CompanyMap_translateScopeToken_C03_(raw, scopeLabelMap);
  var s = CompanyMap_cellStr_(translated).replace(/\s+/g, ' ').trim();
  if (!s) return;
  var key = s.toLowerCase();
  if (seen[key]) return;
  seen[key] = true;
  out.push(s);
}

function CompanyMap_cleanScopeLabel_C02_(value) {
  if (Array.isArray(value)) {
    return value.map(function(x){ return CompanyMap_cleanScopeLabel_C02_(x); }).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    return CompanyMap_firstNonEmpty_C01_([
      value.label, value.name, value.code, value.scope, value.standard, value.qualification
    ]);
  }
  var s = CompanyMap_cellStr_(value);
  if (!s) return '';
  if (CompanyMap_isMarkerOnly_C02_(s)) return '';
  return s;
}

function CompanyMap_pushScopeLabel_C02_(out, seen, raw) {
  var s = CompanyMap_cellStr_(raw).replace(/_/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return;
  var key = s.toLowerCase();
  if (seen[key]) return;
  seen[key] = true;
  out.push(s);
}

function CompanyMap_isMarkerOnly_C02_(v) {
  var s = CompanyMap_cellStr_(v).toLowerCase();
  return s === 'x' || s === 'yes' || s === 'ja' || s === 'true' || s === '1' || s === '✓' || s === 'y';
}

function CompanyMap_valueLooksLikeScopeList_C02_(v) {
  var s = CompanyMap_cellStr_(v);
  if (!s) return false;
  if (CompanyMap_isMarkerOnly_C02_(s)) return false;
  return /mps|global|grasp|trace|planet|gap|sq|abc|spring|tesco|leaf|rhp|organic|bio|scope|cert/i.test(s) || s.indexOf(',') >= 0 || s.indexOf(';') >= 0;
}

function CompanyMap_headerLooksLikeScope_C02_(header) {
  var h = CompanyMap_cellStr_(header);
  var n = CompanyMap_normHeader_C01_(h);
  if (!h || !n) return false;
  var blocked = {
    'audit id':true,'status':true,'audit status':true,'planning status':true,'company':true,'company name':true,
    'company uid':true,'company_uid':true,'location':true,'site':true,'planned date':true,'audit date':true,
    'start date':true,'end date':true,'start time':true,'end time':true,'assigned to':true,'auditor':true,
    'assigned auditor':true,'preassigned auditor':true,'planning json':true,'planning_json':true,
    'audit hours':true,'hours':true,'comments':true,'country':true,'region':true
  };
  if (blocked[n]) return false;
  return /mps|global|grasp|trace|planet|gap|sq|abc|spring|tesco|leaf|rhp|organic|bio|scope|cert/i.test(h);
}

function CompanyMap_parsePlanningInfo_C01_(raw) {
  var out = { dateLabel: '', timeLabel: '', scopesLabel: '', auditHours: '', locationCode: '', assignedAuditor: '', preassignedAuditor: '', __source: '' };
  var s = CompanyMap_cellStr_(raw);
  if (!s) return out;
  var obj = null;
  try { obj = JSON.parse(s); } catch (e) { return out; }
  if (!obj || typeof obj !== 'object') return out;

  out.assignedAuditor = CompanyMap_firstFromObject_C01_(obj, ['assignedAuditor','assignedTo','auditor','auditorEmail','assigned_auditor']);
  out.preassignedAuditor = CompanyMap_firstFromObject_C01_(obj, ['preassignedAuditor','preassignedTo','preassigned','preassignedAuditorEmail']);
  out.scopesLabel = CompanyMap_arrayOrString_C01_(CompanyMap_firstFromObjectDeep_C02_(obj, ['scopes','auditScopes','scope','standards','scopeCodes','selectedScopes','scopeLabels']));
  out.auditHours = CompanyMap_firstFromObjectDeep_C02_(obj, ['auditHours','hours','plannedHours','totalHours','durationHours']);
  out.locationCode = CompanyMap_firstFromObjectDeep_C02_(obj, ['locationCode','location_code','siteCode','code','location_code_target']);

  var segments = [];
  ['segments','days','planning','plannedDays','items','slots','intervals','plannedSegments','auditDays'].forEach(function(k){
    if (Array.isArray(obj[k])) segments = segments.concat(obj[k]);
  });
  if (!segments.length && obj.date) segments = [obj];

  var dates = [];
  var times = [];
  segments.forEach(function(seg) {
    if (!seg || typeof seg !== 'object') return;
    var d = CompanyMap_firstFromObjectDeep_C02_(seg, ['date','plannedDate','auditDate','startDate','day','planned_date']);
    var fd = CompanyMap_formatDateValue_C01_(d);
    if (fd && dates.indexOf(fd) === -1) dates.push(fd);
    var t = CompanyMap_joinTimeLabel_C01_(CompanyMap_firstFromObjectDeep_C02_(seg, ['startTime','start','from','start_time']), CompanyMap_firstFromObjectDeep_C02_(seg, ['endTime','end','to','end_time']));
    if (t && times.indexOf(t) === -1) times.push(t);
    if (!out.locationCode) out.locationCode = CompanyMap_firstFromObjectDeep_C02_(seg, ['locationCode','location_code','siteCode','code']);
  });

  if (!dates.length) {
    var directDate = CompanyMap_firstFromObjectDeep_C02_(obj, ['date','plannedDate','auditDate','startDate','planned_date']);
    var formatted = CompanyMap_formatDateValue_C01_(directDate);
    if (formatted) dates.push(formatted);
  }
  if (!times.length) {
    var directTime = CompanyMap_joinTimeLabel_C01_(CompanyMap_firstFromObjectDeep_C02_(obj, ['startTime','start','from','start_time']), CompanyMap_firstFromObjectDeep_C02_(obj, ['endTime','end','to','end_time']));
    if (directTime) times.push(directTime);
  }

  out.dateLabel = CompanyMap_compactDateList_C01_(dates);
  out.timeLabel = times.join(', ');
  out.__source = 'Planning JSON';
  return out;
}


function CompanyMap_firstFromObjectDeep_C02_(obj, keys) {
  var direct = CompanyMap_firstFromObject_C01_(obj, keys);
  if (direct !== '') return direct;
  var found = '';
  function walk(x, depth) {
    if (found !== '' || depth > 3 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length; i++) walk(x[i], depth + 1);
      return;
    }
    for (var k in x) {
      if (!Object.prototype.hasOwnProperty.call(x, k)) continue;
      for (var j = 0; j < keys.length; j++) {
        if (CompanyMap_normHeader_C01_(k) === CompanyMap_normHeader_C01_(keys[j])) {
          if (CompanyMap_cellStr_(x[k]) !== '') { found = x[k]; return; }
        }
      }
    }
    for (var k2 in x) {
      if (!Object.prototype.hasOwnProperty.call(x, k2)) continue;
      walk(x[k2], depth + 1);
      if (found !== '') return;
    }
  }
  walk(obj, 0);
  return found;
}

function CompanyMap_firstFromObject_C01_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (obj && typeof obj[k] !== 'undefined' && obj[k] !== null && CompanyMap_cellStr_(obj[k]) !== '') return obj[k];
  }
  return '';
}

function CompanyMap_arrayOrString_C01_(v) {
  if (Array.isArray(v)) return v.map(function(x){ return CompanyMap_cellStr_(x); }).filter(Boolean).join(', ');
  return CompanyMap_cellStr_(v);
}

function CompanyMap_formatDateCell_C01_(v) {
  return CompanyMap_formatDateValue_C01_(v);
}

function CompanyMap_formatDateValue_C01_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'dd MMM yyyy');
  }
  var s = CompanyMap_cellStr_(v);
  if (!s) return '';
  var d = new Date(s);
  if (!isNaN(d.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'dd MMM yyyy');
  }
  return s;
}

function CompanyMap_joinTimeLabel_C01_(start, end) {
  var s = CompanyMap_timeStr_C01_(start);
  var e = CompanyMap_timeStr_C01_(end);
  if (s && e) return s + '-' + e;
  return s || e || '';
}

function CompanyMap_timeStr_C01_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'HH:mm');
  return CompanyMap_cellStr_(v);
}

function CompanyMap_compactDateList_C01_(dates) {
  dates = (dates || []).filter(Boolean);
  if (!dates.length) return '';
  if (dates.length === 1) return dates[0];
  if (dates.length === 2) return dates[0] + ' + ' + dates[1];
  return dates[0] + ' + ' + (dates.length - 1) + ' days';
}

function CompanyMap_isActiveAuditStatusForMap_C01_(status) {
  return status === 'Pending Approval' || status === 'Approved' || status === 'Accepted';
}

function CompanyMap_normalizeStatus_C01_(v) {
  var s = CompanyMap_cellStr_(v).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (s === 'pending planning') return 'Pending Planning';
  if (s === 'pending approval') return 'Pending Approval';
  if (s === 'approved') return 'Approved';
  if (s === 'accepted' || s === 'pending acceptance') return s === 'pending acceptance' ? 'Approved' : 'Accepted';
  if (s === 'completed') return 'Completed';
  if (s === 'rejected') return 'Rejected';
  return CompanyMap_cellStr_(v);
}

function CompanyMap_normLocationCodeForMap_C01_(v) {
  var s = CompanyMap_cellStr_(v).toUpperCase();
  if (!s) return '';
  if (s === 'HQ') return 'HQ';
  var m = s.match(/^S([1-9])$/);
  if (m) return 'S' + m[1];
  var m2 = s.match(/^SEC[-_ ]?(\d+)$/);
  if (m2) return 'S' + Number(m2[1]);
  return '';
}

function CompanyMap_sortAuditEntities_C01_(a, b) {
  var ad = String(a.dateLabel || '9999');
  var bd = String(b.dateLabel || '9999');
  var c = ad.localeCompare(bd);
  if (c !== 0) return c;
  return String(a.companyName || '').localeCompare(String(b.companyName || ''), undefined, { sensitivity: 'base' });
}

function CompanyMap_getSessionEmailSafe_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function CompanyMap_normEmail_(v) {
  var s = CompanyMap_cellStr_(v).toLowerCase();
  var m = s.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

function CompanyMap_normKey_C01_(v) {
  return CompanyMap_cellStr_(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function CompanyMap_cellStr_(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v).trim();
}

function CompanyMap_firstNonEmpty_C01_(arr) {
  for (var i = 0; i < arr.length; i++) {
    var s = CompanyMap_cellStr_(arr[i]);
    if (s) return s;
  }
  return '';
}

function CompanyMap_rowIsEmpty_C01_(row) {
  for (var i = 0; i < row.length; i++) {
    if (CompanyMap_cellStr_(row[i]) !== '') return false;
  }
  return true;
}
