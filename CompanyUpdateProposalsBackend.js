// CompanyUpdateProposalsBackend.gs
// BUILD: COMPANY_UPDATE_PROPOSALS_COMPANIES_INDEX_ROW_BRIDGE_20260427
// Additive backend for auditor company-update proposals.
// Uses Company UID as key. No Entry changes needed.
// Companies stays SSOT. Auditors only write proposal rows.

function companyUpdate_getProposalSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Company_Update_Proposals');
  if (!sh) throw new Error('Sheet "Company_Update_Proposals" not found.');
  return sh;
}

function companyUpdate_getCompaniesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Companies');
  if (!sh) throw new Error('Companies sheet not found.');
  return sh;
}

function companyUpdate_getHeaders_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0];
}

function companyUpdate_normHeader_(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyUpdate_headerMap_(headers) {
  var map = {};
  headers.forEach(function(h, i) {
    var key = companyUpdate_normHeader_(h);
    if (key) map[key] = i + 1;
  });
  return map;
}

function companyUpdate_col_(map, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = map[companyUpdate_normHeader_(aliases[i])];
    if (idx) return idx;
  }
  return 0;
}

function companyUpdate_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function companyUpdate_nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function companyUpdate_makeId_(prefix) {
  return String(prefix || 'ID') + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function companyUpdate_parseLocations_(raw, fallbackLocation, fallbackGps) {
  var fallback = [
    { code: 'HQ', name: companyUpdate_clean_(fallbackLocation), gps: companyUpdate_clean_(fallbackGps), comment: '', active: true },
    { code: 'S1', name: '', gps: '', comment: '', active: false },
    { code: 'S2', name: '', gps: '', comment: '', active: false },
    { code: 'S3', name: '', gps: '', comment: '', active: false },
    { code: 'S4', name: '', gps: '', comment: '', active: false }
  ];

  var s = String(raw == null ? '' : raw).trim();
  if (!s) return fallback;

  try {
    var parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return companyUpdate_normalizeLocations_(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.locations)) {
      return companyUpdate_normalizeLocations_(parsed.locations);
    }
  } catch (e) {}
  return fallback;
}

function companyUpdate_normalizeLocations_(locations) {
  var byCode = {};
  (Array.isArray(locations) ? locations : []).forEach(function(loc) {
    var code = String((loc && loc.code) || '').trim().toUpperCase();
    if (['HQ', 'S1', 'S2', 'S3', 'S4'].indexOf(code) === -1) return;
    byCode[code] = {
      code: code,
      name: companyUpdate_clean_(loc && (loc.name || loc.label)),
      gps: companyUpdate_clean_(loc && loc.gps),
      comment: companyUpdate_clean_(loc && loc.comment),
      active: code === 'HQ' ? true : !!(loc && loc.active)
    };
  });
  return ['HQ', 'S1', 'S2', 'S3', 'S4'].map(function(code) {
    return byCode[code] || {
      code: code,
      name: '',
      gps: '',
      comment: '',
      active: code === 'HQ'
    };
  });
}

function companyUpdate_countActiveLocations_(locations) {
  var n = (Array.isArray(locations) ? locations : []).filter(function(x) { return !!(x && x.active); }).length;
  return n < 1 ? 1 : n;
}

function companyUpdate_findCompanyRowByUid_(companyUid) {
  companyUid = companyUpdate_clean_(companyUid);
  if (!companyUid) throw new Error('Company UID is required.');

  var sh = companyUpdate_getCompaniesSheet_();
  var headers = companyUpdate_getHeaders_(sh);
  var map = companyUpdate_headerMap_(headers);

  if (typeof CompaniesIndex_FindCompanyRowByUid === 'function') {
    try {
      var hit = CompaniesIndex_FindCompanyRowByUid(companyUid);
      if (hit && hit.ok && hit.rowNumber) {
        return {
          sheet: sh,
          headers: headers,
          headerMap: map,
          rowNumber: Number(hit.rowNumber),
          source: 'CompaniesIndexService'
        };
      }
    } catch (eBridge) {}
  }

  var uidCol = companyUpdate_col_(map, ['company uid', 'company_uid', 'uid']);
  if (!uidCol) throw new Error('Companies UID column not found.');

  var height = Math.max(0, sh.getLastRow() - 1);
  if (!height) throw new Error('Companies sheet has no data rows.');

  var match = sh.getRange(2, uidCol, height, 1)
    .createTextFinder(companyUid)
    .matchEntireCell(true)
    .findNext();

  if (!match) throw new Error('Company UID not found: ' + companyUid);

  return {
    sheet: sh,
    headers: headers,
    headerMap: map,
    rowNumber: match.getRow(),
    source: 'TextFinderFallback'
  };
}

function companyUpdate_getCompanySnapshot(companyUid) {
  var found = companyUpdate_findCompanyRowByUid_(companyUid);
  var row = found.sheet.getRange(found.rowNumber, 1, 1, found.sheet.getLastColumn()).getValues()[0];
  var map = found.headerMap;

  function getv(aliases) {
    var col = companyUpdate_col_(map, aliases);
    return col ? row[col - 1] : '';
  }

  return {
    companyUid: companyUid,
    company: companyUpdate_clean_(getv(['company'])),
    principal: {
      contactperson: companyUpdate_clean_(getv(['contactperson'])),
      contact_email: companyUpdate_clean_(getv(['contactperson e-mail', 'contactperson email'])),
      contact_phone: companyUpdate_clean_(getv(['contactperson phone'])),
      comments: companyUpdate_clean_(getv(['comments']))
    },
    planning: {
      days: companyUpdate_clean_(getv(['audit planning limitations days', 'audit planning limitations - days', 'blocked weekdays', 'days', 'less suitable days'])),
      hours: companyUpdate_clean_(getv(['audit planning limitations hours', 'audit planning limitations - hours', 'time window', 'hours', 'typical working hours']))
    },
    locations: companyUpdate_parseLocations_(
      getv(['locations_json', 'locations json']),
      getv(['location']),
      getv(['gps-data', 'gps data', 'gps'])
    )
  };
}

function companyUpdate_submitProposalBundle(payload) {
  payload = payload || {};
  var companyUid = companyUpdate_clean_(payload.companyUid);
  var auditId = companyUpdate_clean_(payload.auditId);
  var auditorEmail = companyUpdate_clean_(payload.auditorEmail).toLowerCase();
  var changes = Array.isArray(payload.changes) ? payload.changes : [];

  if (!companyUid) throw new Error('companyUid is required.');
  if (!auditorEmail) throw new Error('auditorEmail is required.');
  if (!changes.length) throw new Error('No changes supplied.');

  var snapshot = companyUpdate_getCompanySnapshot(companyUid);
  var sh = companyUpdate_getProposalSheet_();
  var headers = companyUpdate_getHeaders_(sh);
  var nextRow = sh.getLastRow() + 1;
  var proposalId = companyUpdate_makeId_('CUP');
  var ts = companyUpdate_nowIso_();
  var out = [];

  changes.forEach(function(ch) {
    var section = companyUpdate_clean_(ch.section).toLowerCase();
    var fieldKey = companyUpdate_clean_(ch.fieldKey).toLowerCase();
    var locationCode = companyUpdate_clean_(ch.locationCode).toUpperCase();
    var proposedValue = companyUpdate_clean_(ch.proposedValue);
    if (!section || !fieldKey) return;

    var oldValue = '';
    if (section === 'principal') {
      oldValue = companyUpdate_clean_(snapshot.principal[fieldKey]);
    } else if (section === 'planning') {
      oldValue = companyUpdate_clean_(snapshot.planning[fieldKey]);
    } else if (section === 'location') {
      var loc = (snapshot.locations || []).filter(function(x) {
        return String(x.code || '').toUpperCase() === locationCode;
      })[0];
      if (!loc) return;
      oldValue = companyUpdate_clean_(loc[fieldKey]);
    } else {
      return;
    }

    if (oldValue === proposedValue) return;

    out.push({
      Timestamp: ts,
      Proposal_ID: proposalId,
      Audit_ID: auditId,
      Company_UID: companyUid,
      Company: snapshot.company,
      Auditor_Email: auditorEmail,
      Section: section,
      Field_Key: fieldKey,
      Location_Code: locationCode,
      Old_Value: oldValue,
      Proposed_Value: proposedValue,
      Status: 'Pending',
      Manager_Comment: '',
      Processed_By: '',
      Processed_At: ''
    });
  });

  if (!out.length) return { success: false, message: 'No effective changes detected.' };

  var matrix = out.map(function(obj) {
    return headers.map(function(h) {
      return obj[h] != null ? obj[h] : '';
    });
  });

  sh.getRange(nextRow, 1, matrix.length, headers.length).setValues(matrix);
  return {
    success: true,
    proposalId: proposalId,
    count: matrix.length,
    message: 'Proposal submitted.'
  };
}

function companyUpdate_listPendingProposals(limit) {
  var sh = companyUpdate_getProposalSheet_();
  var headers = companyUpdate_getHeaders_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { items: [], count: 0 };

  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var map = companyUpdate_headerMap_(headers);

  function idx(name) {
    var c = companyUpdate_col_(map, [name]);
    return c ? c - 1 : -1;
  }

  var cols = {
    ts: idx('Timestamp'),
    pid: idx('Proposal_ID'),
    auditId: idx('Audit_ID'),
    companyUid: idx('Company_UID'),
    company: idx('Company'),
    auditor: idx('Auditor_Email'),
    section: idx('Section'),
    fieldKey: idx('Field_Key'),
    loc: idx('Location_Code'),
    oldv: idx('Old_Value'),
    newv: idx('Proposed_Value'),
    status: idx('Status')
  };

  var items = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    if (companyUpdate_clean_(row[cols.status]) !== 'Pending') continue;
    items.push({
      rowNumber: i + 2,
      timestamp: companyUpdate_clean_(row[cols.ts]),
      proposalId: companyUpdate_clean_(row[cols.pid]),
      auditId: companyUpdate_clean_(row[cols.auditId]),
      companyUid: companyUpdate_clean_(row[cols.companyUid]),
      company: companyUpdate_clean_(row[cols.company]),
      auditorEmail: companyUpdate_clean_(row[cols.auditor]),
      section: companyUpdate_clean_(row[cols.section]),
      fieldKey: companyUpdate_clean_(row[cols.fieldKey]),
      locationCode: companyUpdate_clean_(row[cols.loc]),
      oldValue: companyUpdate_clean_(row[cols.oldv]),
      proposedValue: companyUpdate_clean_(row[cols.newv]),
      status: 'Pending'
    });
    if (limit && items.length >= Number(limit)) break;
  }

  return { items: items, count: items.length };
}

function companyUpdate_applyProposalRow(rowNumber, managerEmail, managerComment) {
  rowNumber = Number(rowNumber || 0);
  managerEmail = companyUpdate_clean_(managerEmail).toLowerCase();
  managerComment = companyUpdate_clean_(managerComment);
  if (!rowNumber) throw new Error('rowNumber is required.');

  var psh = companyUpdate_getProposalSheet_();
  var pHeaders = companyUpdate_getHeaders_(psh);
  var pMap = companyUpdate_headerMap_(pHeaders);
  var prow = psh.getRange(rowNumber, 1, 1, pHeaders.length).getValues()[0];

  function pget(aliases) {
    var col = companyUpdate_col_(pMap, aliases);
    return col ? prow[col - 1] : '';
  }

  if (companyUpdate_clean_(pget(['Status'])) !== 'Pending') {
    return { success: false, message: 'Proposal row is not Pending.' };
  }

  var companyUid = companyUpdate_clean_(pget(['Company_UID']));
  var section = companyUpdate_clean_(pget(['Section'])).toLowerCase();
  var fieldKey = companyUpdate_clean_(pget(['Field_Key'])).toLowerCase();
  var locationCode = companyUpdate_clean_(pget(['Location_Code'])).toUpperCase();
  var proposedValue = companyUpdate_clean_(pget(['Proposed_Value']));

  var found = companyUpdate_findCompanyRowByUid_(companyUid);
  var csh = found.sheet;
  var cmap = found.headerMap;
  var crow = found.rowNumber;
  var allRow = csh.getRange(crow, 1, 1, csh.getLastColumn()).getValues()[0];

  function cget(aliases) {
    var col = companyUpdate_col_(cmap, aliases);
    return col ? allRow[col - 1] : '';
  }

  function cset(aliases, value) {
    var col = companyUpdate_col_(cmap, aliases);
    if (col) csh.getRange(crow, col).setValue(value);
  }

  if (section === 'principal') {
    if (fieldKey === 'contactperson') cset(['contactperson'], proposedValue);
    else if (fieldKey === 'contact_email') cset(['contactperson e-mail', 'contactperson email'], proposedValue);
    else if (fieldKey === 'contact_phone') cset(['contactperson phone'], proposedValue);
    else if (fieldKey === 'comments') cset(['comments'], proposedValue);
    else return { success: false, message: 'Unsupported principal fieldKey.' };
  } else if (section === 'planning') {
    if (fieldKey === 'days') cset(['audit planning limitations days', 'audit planning limitations - days', 'blocked weekdays', 'days', 'less suitable days'], proposedValue);
    else if (fieldKey === 'hours') cset(['audit planning limitations hours', 'audit planning limitations - hours', 'time window', 'hours', 'typical working hours'], proposedValue);
    else return { success: false, message: 'Unsupported planning fieldKey.' };
  } else if (section === 'location') {
    var locations = companyUpdate_parseLocations_(
      cget(['locations_json', 'locations json']),
      cget(['location']),
      cget(['gps-data', 'gps data', 'gps'])
    );

    var hit = false;
    locations.forEach(function(loc) {
      if (String(loc.code || '').toUpperCase() !== locationCode) return;
      if (fieldKey === 'name' || fieldKey === 'gps' || fieldKey === 'comment') {
        loc[fieldKey] = proposedValue;
        hit = true;
      }
    });

    if (!hit) return { success: false, message: 'Location code not found.' };

    var hq = locations.filter(function(x) { return String(x.code || '').toUpperCase() === 'HQ'; })[0] || { name: '', gps: '' };
    cset(['location'], companyUpdate_clean_(hq.name));
    cset(['gps-data', 'gps data', 'gps'], companyUpdate_clean_(hq.gps));
    cset(['locations_to_plan', 'locations to plan'], String(companyUpdate_countActiveLocations_(locations)));
    cset(['locations_json', 'locations json'], JSON.stringify(locations));
  } else {
    return { success: false, message: 'Unsupported section.' };
  }

  var now = companyUpdate_nowIso_();
  var statusCol = companyUpdate_col_(pMap, ['Status']);
  var commentCol = companyUpdate_col_(pMap, ['Manager_Comment']);
  var byCol = companyUpdate_col_(pMap, ['Processed_By']);
  var atCol = companyUpdate_col_(pMap, ['Processed_At']);

  if (statusCol) psh.getRange(rowNumber, statusCol).setValue('Applied');
  if (commentCol) psh.getRange(rowNumber, commentCol).setValue(managerComment);
  if (byCol) psh.getRange(rowNumber, byCol).setValue(managerEmail);
  if (atCol) psh.getRange(rowNumber, atCol).setValue(now);

  try {
    if (typeof CompaniesIndex_ClearCache === 'function') CompaniesIndex_ClearCache();
  } catch (eCache) {}

  // δ9 (2026-05-03): proposal applied → Companies row mutated → evict
  // persist cache + MP_CC_V1 (uid-key and NM-key) so manager UIs reading
  // _mp_companyConstraintsCached_ get fresh constraints on next call.
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_(['Companies']);
    }
    if (typeof _mp_invalidateCompanyConstraintsCache_ === 'function') {
      _mp_invalidateCompanyConstraintsCache_(
        companyUid,
        String(cget(['company']) || ''),
        String(cget(['location']) || '')
      );
    }
  } catch (_e9) {
    try { Logger.log('[δ9][applyProposalRow] invalidate failed: ' + _e9); } catch (_) {}
  }

  return { success: true, rowNumber: rowNumber, status: 'Applied', companyLookupSource: found.source || '' };
}

function companyUpdate_rejectProposalRow(rowNumber, managerEmail, managerComment) {
  rowNumber = Number(rowNumber || 0);
  managerEmail = companyUpdate_clean_(managerEmail).toLowerCase();
  managerComment = companyUpdate_clean_(managerComment);
  if (!rowNumber) throw new Error('rowNumber is required.');

  var sh = companyUpdate_getProposalSheet_();
  var headers = companyUpdate_getHeaders_(sh);
  var map = companyUpdate_headerMap_(headers);
  var statusCol = companyUpdate_col_(map, ['Status']);
  var commentCol = companyUpdate_col_(map, ['Manager_Comment']);
  var byCol = companyUpdate_col_(map, ['Processed_By']);
  var atCol = companyUpdate_col_(map, ['Processed_At']);

  if (statusCol) sh.getRange(rowNumber, statusCol).setValue('Rejected');
  if (commentCol) sh.getRange(rowNumber, commentCol).setValue(managerComment);
  if (byCol) sh.getRange(rowNumber, byCol).setValue(managerEmail);
  if (atCol) sh.getRange(rowNumber, atCol).setValue(companyUpdate_nowIso_());

  return { success: true, rowNumber: rowNumber, status: 'Rejected' };
}


function companyUpdate_hoursParts_(hoursText) {
  var s = companyUpdate_clean_(hoursText);
  var m = s.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  return { from: m ? m[1] : '', to: m ? m[2] : '' };
}

function companyUpdate_joinHours_(fromValue, toValue) {
  var from = companyUpdate_clean_(fromValue);
  var to = companyUpdate_clean_(toValue);
  if (!from && !to) return '';
  if (!from || !to) return from && to ? (from + '-' + to) : '';
  return from + '-' + to;
}

function companyUpdate_normalizeDaysString_(daysValue) {
  if (Array.isArray(daysValue)) {
    return daysValue.map(function(x){ return companyUpdate_clean_(x); }).filter(Boolean).join(',');
  }
  return companyUpdate_clean_(daysValue);
}

function companyUpdate_getEditorSeed(companyUid) {
  var snap = companyUpdate_getCompanySnapshot(companyUid);
  var hp = companyUpdate_hoursParts_(snap.planning.hours);
  return {
    companyUid: snap.companyUid,
    company: snap.company,
    current: snap,
    form: {
      principal: {
        contactperson: snap.principal.contactperson || '',
        contact_email: snap.principal.contact_email || '',
        contact_phone: snap.principal.contact_phone || '',
        comments: snap.principal.comments || ''
      },
      planning: {
        days: companyUpdate_normalizeDaysString_(snap.planning.days),
        hours_from: hp.from,
        hours_to: hp.to
      },
      locations: (snap.locations || []).map(function(loc){
        return {
          code: companyUpdate_clean_(loc.code),
          name: companyUpdate_clean_(loc.name),
          gps: companyUpdate_clean_(loc.gps),
          comment: companyUpdate_clean_(loc.comment)
        };
      })
    }
  };
}

function companyUpdate_submitCompanyFormProposal(payload) {
  payload = payload || {};
  var companyUid = companyUpdate_clean_(payload.companyUid);
  var auditId = companyUpdate_clean_(payload.auditId);
  var auditorEmail = companyUpdate_clean_(payload.auditorEmail).toLowerCase();
  var form = payload.form || {};
  var snap = companyUpdate_getCompanySnapshot(companyUid);
  var changes = [];
  function pushChange(section, fieldKey, locationCode, currentValue, newValue) {
    currentValue = companyUpdate_clean_(currentValue);
    newValue = companyUpdate_clean_(newValue);
    if (currentValue === newValue) return;
    changes.push({ section: section, fieldKey: fieldKey, locationCode: locationCode || '', proposedValue: newValue });
  }
  var p = form.principal || {};
  pushChange('principal', 'contactperson', '', snap.principal.contactperson, p.contactperson);
  pushChange('principal', 'contact_email', '', snap.principal.contact_email, p.contact_email);
  pushChange('principal', 'contact_phone', '', snap.principal.contact_phone, p.contact_phone);
  pushChange('principal', 'comments', '', snap.principal.comments, p.comments);
  var pl = form.planning || {};
  pushChange('planning', 'days', '', snap.planning.days, companyUpdate_normalizeDaysString_(pl.days));
  pushChange('planning', 'hours', '', snap.planning.hours, companyUpdate_joinHours_(pl.hours_from, pl.hours_to));
  var byCode = {};
  (snap.locations || []).forEach(function(loc){ byCode[String(loc.code || '').toUpperCase()] = loc; });
  (form.locations || []).forEach(function(loc){
    var code = companyUpdate_clean_(loc.code).toUpperCase();
    if (!code) return;
    var cur = byCode[code] || { code: code, name: '', gps: '', comment: '' };
    pushChange('location', 'name', code, cur.name, loc.name);
    pushChange('location', 'gps', code, cur.gps, loc.gps);
    pushChange('location', 'comment', code, cur.comment, loc.comment);
  });
  return companyUpdate_submitProposalBundle({ companyUid: companyUid, auditId: auditId, auditorEmail: auditorEmail, changes: changes });
}

function companyUpdate_listPendingProposalGroups(limit) {
  var list = companyUpdate_listPendingProposals(limit);
  var items = list.items || [];
  var groupsByProposal = {};
  items.forEach(function(it){
    var pid = companyUpdate_clean_(it.proposalId);
    if (!pid) return;
    if (!groupsByProposal[pid]) {
      groupsByProposal[pid] = {
        proposalId: pid,
        companyUid: companyUpdate_clean_(it.companyUid),
        company: companyUpdate_clean_(it.company),
        auditorEmail: companyUpdate_clean_(it.auditorEmail),
        auditId: companyUpdate_clean_(it.auditId),
        rowCount: 0,
        items: []
      };
    }
    groupsByProposal[pid].items.push(it);
    groupsByProposal[pid].rowCount++;
  });
  var groups = Object.keys(groupsByProposal).map(function(k){ return groupsByProposal[k]; });
  groups.sort(function(a,b){ return String(a.company || '').localeCompare(String(b.company || '')); });
  return { groups: groups, count: groups.length };
}

function companyUpdate_getProposalGroup(proposalId) {
  proposalId = companyUpdate_clean_(proposalId);
  var list = companyUpdate_listPendingProposals(1000);
  var items = (list.items || []).filter(function(it){ return companyUpdate_clean_(it.proposalId) === proposalId; });
  if (!items.length) return { success: false, message: 'Proposal group not found.' };
  return {
    success: true,
    proposalId: proposalId,
    companyUid: companyUpdate_clean_(items[0].companyUid),
    company: companyUpdate_clean_(items[0].company),
    auditorEmail: companyUpdate_clean_(items[0].auditorEmail),
    auditId: companyUpdate_clean_(items[0].auditId),
    items: items
  };
}

function companyUpdate_applyProposalValueRow(rowNumber, appliedValue, managerEmail, managerComment) {
  rowNumber = Number(rowNumber || 0);
  appliedValue = companyUpdate_clean_(appliedValue);
  managerEmail = companyUpdate_clean_(managerEmail).toLowerCase();
  managerComment = companyUpdate_clean_(managerComment);
  if (!rowNumber) throw new Error('rowNumber is required.');

  var psh = companyUpdate_getProposalSheet_();
  var pHeaders = companyUpdate_getHeaders_(psh);
  var pMap = companyUpdate_headerMap_(pHeaders);
  var prow = psh.getRange(rowNumber, 1, 1, pHeaders.length).getValues()[0];
  function pget(aliases) { var col = companyUpdate_col_(pMap, aliases); return col ? prow[col - 1] : ''; }
  if (companyUpdate_clean_(pget(['Status'])) !== 'Pending') return { success:false, message:'Proposal row is not Pending.' };

  var companyUid = companyUpdate_clean_(pget(['Company_UID']));
  var section = companyUpdate_clean_(pget(['Section'])).toLowerCase();
  var fieldKey = companyUpdate_clean_(pget(['Field_Key'])).toLowerCase();
  var locationCode = companyUpdate_clean_(pget(['Location_Code'])).toUpperCase();

  var found = companyUpdate_findCompanyRowByUid_(companyUid);
  var csh = found.sheet;
  var cmap = found.headerMap;
  var crow = found.rowNumber;
  var allRow = csh.getRange(crow, 1, 1, csh.getLastColumn()).getValues()[0];
  function cget(aliases) { var col = companyUpdate_col_(cmap, aliases); return col ? allRow[col - 1] : ''; }
  function cset(aliases, value) { var col = companyUpdate_col_(cmap, aliases); if (col) csh.getRange(crow, col).setValue(value); }

  if (section === 'principal') {
    if (fieldKey === 'contactperson') cset(['contactperson'], appliedValue);
    else if (fieldKey === 'contact_email') cset(['contactperson e-mail', 'contactperson email'], appliedValue);
    else if (fieldKey === 'contact_phone') cset(['contactperson phone'], appliedValue);
    else if (fieldKey === 'comments') cset(['comments'], appliedValue);
    else return { success:false, message:'Unsupported principal fieldKey.' };
  } else if (section === 'planning') {
    if (fieldKey === 'days') cset(['audit planning limitations days', 'audit planning limitations - days', 'blocked weekdays', 'days', 'less suitable days'], appliedValue);
    else if (fieldKey === 'hours') cset(['audit planning limitations hours', 'audit planning limitations - hours', 'time window', 'hours', 'typical working hours'], appliedValue);
    else return { success:false, message:'Unsupported planning fieldKey.' };
  } else if (section === 'location') {
    var locations = companyUpdate_parseLocations_(cget(['locations_json', 'locations json']), cget(['location']), cget(['gps-data', 'gps data', 'gps']));
    var hit = false;
    locations.forEach(function(loc){
      if (String(loc.code || '').toUpperCase() !== locationCode) return;
      if (fieldKey === 'name' || fieldKey === 'gps' || fieldKey === 'comment') {
        loc[fieldKey] = appliedValue;
        hit = true;
      }
    });
    if (!hit) return { success:false, message:'Location code not found.' };
    var hq = locations.filter(function(x){ return String(x.code || '').toUpperCase() === 'HQ'; })[0] || { name:'', gps:'' };
    cset(['location'], companyUpdate_clean_(hq.name));
    cset(['gps-data', 'gps data', 'gps'], companyUpdate_clean_(hq.gps));
    cset(['locations_to_plan', 'locations to plan'], String(companyUpdate_countActiveLocations_(locations)));
    cset(['locations_json', 'locations json'], JSON.stringify(locations));
  } else return { success:false, message:'Unsupported section.' };

  var now = companyUpdate_nowIso_();
  var statusCol = companyUpdate_col_(pMap, ['Status']);
  var commentCol = companyUpdate_col_(pMap, ['Manager_Comment']);
  var byCol = companyUpdate_col_(pMap, ['Processed_By']);
  var atCol = companyUpdate_col_(pMap, ['Processed_At']);
  if (statusCol) psh.getRange(rowNumber, statusCol).setValue('Applied');
  if (commentCol) psh.getRange(rowNumber, commentCol).setValue(managerComment);
  if (byCol) psh.getRange(rowNumber, byCol).setValue(managerEmail);
  if (atCol) psh.getRange(rowNumber, atCol).setValue(now);

  // δ9 (2026-05-03): value-row proposal applied → same invalidation as
  // applyProposalRow. Without this, the value-row path (used by section
  // managers approving individual fields) leaks stale MP_CC_V1 cache.
  try {
    if (typeof CompaniesIndex_ClearCache === 'function') CompaniesIndex_ClearCache();
  } catch (_eCacheV) {}
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_(['Companies']);
    }
    if (typeof _mp_invalidateCompanyConstraintsCache_ === 'function') {
      _mp_invalidateCompanyConstraintsCache_(
        companyUid,
        String(cget(['company']) || ''),
        String(cget(['location']) || '')
      );
    }
  } catch (_e9) {
    try { Logger.log('[δ9][applyProposalValueRow] invalidate failed: ' + _e9); } catch (_) {}
  }

  return { success:true, rowNumber:rowNumber, status:'Applied', appliedValue: appliedValue };
}

function companyUpdate_saveManagerReview(payload) {
  payload = payload || {};
  var managerEmail = companyUpdate_clean_(payload.managerEmail).toLowerCase();
  var managerComment = companyUpdate_clean_(payload.managerComment);
  var decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
  if (!decisions.length) throw new Error('No decisions supplied.');
  var out = [];
  decisions.forEach(function(d){
    var mode = companyUpdate_clean_(d.decision).toLowerCase();
    var rowNumber = Number(d.rowNumber || 0);
    if (!rowNumber || !mode) return;
    if (mode === 'accept') out.push(companyUpdate_applyProposalRow(rowNumber, managerEmail, managerComment));
    else if (mode === 'reject') out.push(companyUpdate_rejectProposalRow(rowNumber, managerEmail, managerComment));
    else if (mode === 'adjust') out.push(companyUpdate_applyProposalValueRow(rowNumber, d.adjustedValue, managerEmail, managerComment));
  });
  return { success: true, results: out, count: out.length };
}
