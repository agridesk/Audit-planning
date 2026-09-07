/**
 * FILE: RotationAuditorService.gs
 * BUILD: ROTATION_AUDITOR_SERVICE_SOLID_SCOPE_ALIAS_20260501
 * PURPOSE:
 *   Central owner for auditor rotation / consecutive audit logic.
 *
 * RULE:
 *   Missing audit years do NOT break the chain.
 *   The chain resets ONLY when another auditor performed the same company+scope audit.
 *
 * CONSUMERS:
 *   - Rotation Overview
 *   - Company Scope Manager eligible auditor dropdown
 *   - Manager Planning Toolkit rotation labels/validation
 *   - Auditor self-planning rotation protection
 *   - Rotation diagnostics
 */

var ROTATION_AUDITOR_SERVICE = Object.freeze({
  VERSION: '2026-05-01_SOLID_SCOPE_ALIAS',
  CACHE_KEY: 'RAS_PACK_V2',
  CACHE_TTL_SECONDS: 300
});

function RotationAuditorService_clearCache() {
  var keys = [
    ROTATION_AUDITOR_SERVICE.CACHE_KEY,
    'RAS_PACK_V1',
    'RAS_PACK_V2',
    'M5T_ROTATION_CACHE_V1',
    'M5T_ROTATION_CACHE_V2',
    'M5T_ROTATION_CACHE_V3',
    'M5T_ROTATION_CACHE_V4',
    'M5T_ROTATION_CACHE_V5',
    'M5T_ROTATION_CACHE_V6',
    'M5T_ROTATION_CACHE_V7'
  ];
  try {
    var c = CacheService.getScriptCache();
    for (var i = 0; i < keys.length; i++) c.remove(keys[i]);
  } catch (e) {}
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function') {
      AUDIT_CACHE.remove('manager_tools', ROTATION_AUDITOR_SERVICE.CACHE_KEY);
      AUDIT_CACHE.remove('auditors', ROTATION_AUDITOR_SERVICE.CACHE_KEY);
    }
  } catch (e2) {}
  return { success: true, cleared: keys, centralCacheCleared: true, version: ROTATION_AUDITOR_SERVICE.VERSION };
}

function RotationAuditorService_getOverview(forceFresh) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pack = RotationAuditorService_getPack_(ss, !!forceFresh);
  return {
    success: true,
    rows: pack.rows || [],
    version: ROTATION_AUDITOR_SERVICE.VERSION,
    cache: pack.cache || { used:false }
  };
}

function RotationAuditorService_getAuditorScopeResult(input) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  input = input || {};
  var pack = RotationAuditorService_getPack_(ss, false);
  var companyUid = RotationAuditorService_clean_(input.companyUid);
  var companyName = RotationAuditorService_clean_(input.companyName || input.company);
  var scope = RotationAuditorService_canonicalScope_(pack, input.scope);
  var auditor = RotationAuditorService_resolveAuditor_(pack, input.auditorEmail || input.auditor || input.auditorName || input.name);
  var group = RotationAuditorService_findGroup_(pack, companyUid, companyName, scope);
  var ownersByYear = group ? group.ownersByYear : {};
  var consecutiveYears = RotationAuditorService_countConsecutive_(ownersByYear, auditor, input.maxYearExclusive || null);
  var max = pack.maxByScope.hasOwnProperty(scope) ? RotationAuditorService_intOrNull_(pack.maxByScope[scope]) : null;
  var status = RotationAuditorService_status_(consecutiveYears, max);
  return {
    success: true,
    found: !!group,
    auditor: auditor,
    companyUid: companyUid || (group ? group.companyUid : ''),
    company: companyName || (group ? group.company : ''),
    scope: scope,
    consecutiveYears: consecutiveYears,
    maxConsecutive: max,
    hasMaximum: max !== null ? 'YES' : 'NO',
    status: status,
    years: RotationAuditorService_yearsForAuditor_(ownersByYear, auditor).join(','),
    detail: max !== null ? (scope + ': ' + consecutiveYears + '/' + max + ' ' + status) : (scope + ': no maximum')
  };
}

function RotationAuditorService_getEligibleAuditors(input) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  input = input || {};
  var pack = RotationAuditorService_getPack_(ss, false);
  var companyUid = RotationAuditorService_clean_(input.companyUid);
  var companyName = RotationAuditorService_clean_(input.companyName || input.company);
  var scopes = Array.isArray(input.scopes) ? input.scopes : [];
  var selected = [];
  var seen = {};
  for (var s = 0; s < scopes.length; s++) {
    var canon = RotationAuditorService_canonicalScope_(pack, scopes[s]);
    if (!canon) continue;
    var sk = RotationAuditorService_key_(canon);
    if (seen[sk]) continue;
    seen[sk] = true;
    selected.push(canon);
  }

  var out = [];
  var blocked = [];
  var currentEmail = RotationAuditorService_normEmail_(input.currentEmail || '');

  for (var i = 0; i < pack.auditors.list.length; i++) {
    var aud = pack.auditors.list[i];
    var worstSeverity = 0;
    var worstLabel = '';
    var qualified = true;
    var detail = [];

    for (var j = 0; j < selected.length; j++) {
      var scope = selected[j];
      if (!RotationAuditorService_isQualified_(pack, aud, scope)) {
        qualified = false;
        worstSeverity = 2;
        worstLabel = 'Not qualified';
        detail.push(scope + ': not qualified');
        break;
      }

      var res = RotationAuditorService_getAuditorScopeResult({
        companyUid: companyUid,
        companyName: companyName,
        auditorEmail: aud.email,
        scope: scope
      });

      if (res.maxConsecutive !== null) {
        if (res.consecutiveYears >= res.maxConsecutive) {
          worstSeverity = 2;
          worstLabel = 'Hard block';
          detail.push(scope + ': ' + res.consecutiveYears + '/' + res.maxConsecutive + ' AT_LIMIT');
        } else if (res.consecutiveYears === (res.maxConsecutive - 1)) {
          if (worstSeverity < 1) {
            worstSeverity = 1;
            worstLabel = 'Soft block';
          }
          detail.push(scope + ': ' + res.consecutiveYears + '/' + res.maxConsecutive + ' NEAR_LIMIT');
        } else {
          detail.push(scope + ': ' + res.consecutiveYears + '/' + res.maxConsecutive);
        }
      } else {
        detail.push(scope + ': no maximum');
      }
    }

    var item = {
      email: aud.email,
      name: aud.name,
      display: aud.name + ' <' + aud.email + '>' + (worstSeverity === 1 ? ' ⚠ review' : ''),
      softBlock: worstSeverity === 1,
      hardBlock: worstSeverity === 2,
      disabled: worstSeverity === 2,
      ineligible: (!qualified || worstSeverity === 2),
      detail: detail.join(' | '),
      severity: worstSeverity,
      label: worstLabel
    };

    if (!qualified || worstSeverity === 2) blocked.push(item);
    else out.push(item);
  }

  out.sort(function(a,b){
    if (!!a.softBlock !== !!b.softBlock) return a.softBlock ? 1 : -1;
    return String(a.display || '').localeCompare(String(b.display || ''));
  });
  blocked.sort(function(a,b){ return String(a.display || '').localeCompare(String(b.display || '')); });

  return {
    success: true,
    auditors: out,
    blockedAuditors: blocked,
    keepSelected: !!(currentEmail && out.some(function(x){ return x.email === currentEmail; })),
    version: ROTATION_AUDITOR_SERVICE.VERSION
  };
}

function RotationAuditorService_countFor(ss, auditor, company, scope, companyUid) {
  var res = RotationAuditorService_getAuditorScopeResult({
    companyUid: companyUid || '',
    companyName: company || '',
    auditorEmail: auditor || '',
    scope: scope || ''
  });
  return res && res.success ? (RotationAuditorService_intOrNull_(res.consecutiveYears) || 0) : 0;
}

function RotationAuditorService_getMaxByScope() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return RotationAuditorService_getPack_(ss, false).maxByScope || {};
}

function RotationAuditorService_getPack_(ss, forceFresh) {
  var ns = 'manager_tools';
  var key = ROTATION_AUDITOR_SERVICE.CACHE_KEY;

  if (!forceFresh) {
    try {
      if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
        var central = AUDIT_CACHE.get(ns, key);
        if (central && central.version === ROTATION_AUDITOR_SERVICE.VERSION) {
          central.cache = { used:true, service:'AUDIT_CACHE', namespace:ns, key:key };
          return central;
        }
      }
    } catch (eCentralGet) {}

    // Fallback for older deployments where AUDIT_CACHE is unavailable.
    try {
      var cached = CacheService.getScriptCache().get(ROTATION_AUDITOR_SERVICE.CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.version === ROTATION_AUDITOR_SERVICE.VERSION) {
          parsed.cache = { used:true, service:'CacheService', key: ROTATION_AUDITOR_SERVICE.CACHE_KEY };
          return parsed;
        }
      }
    } catch (e0) {}
  }

  var pack = RotationAuditorService_buildPack_(ss);
  pack.version = ROTATION_AUDITOR_SERVICE.VERSION;
  pack.cache = { used:false, service:'build', key:key };

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(ns, key, pack, ROTATION_AUDITOR_SERVICE.CACHE_TTL_SECONDS);
    }
  } catch (eCentralPut) {}

  // Fallback write for older deployments.
  try {
    var payload = JSON.stringify(pack);
    if (payload.length < 90000) CacheService.getScriptCache().put(ROTATION_AUDITOR_SERVICE.CACHE_KEY, payload, ROTATION_AUDITOR_SERVICE.CACHE_TTL_SECONDS);
  } catch (e1) {}
  return pack;
}

function RotationAuditorService_buildPack_(ss) {
  var aliases = RotationAuditorService_readScopeAliases_(ss);
  var maxByScope = RotationAuditorService_readMaxByScope_(ss, aliases);
  var auditors = RotationAuditorService_readAuditors_(ss, aliases);
  var groups = RotationAuditorService_readLogEvents_(ss, aliases, auditors);
  var rows = RotationAuditorService_buildOverviewRows_(groups, maxByScope);
  return { aliases: aliases, maxByScope: maxByScope, auditors: auditors, groups: groups, rows: rows };
}

function RotationAuditorService_readScopeAliases_(ss) {
  var meta = { byAnyKey: {}, byLooseKey: {}, slots: [] };
  var sh = ss.getSheetByName('Config_Scopes');
  if (!sh) return meta;
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return meta;
  var headers = values[0] || [];
  var hm = RotationAuditorService_headerMap_(headers);
  var slotCol = RotationAuditorService_pick_(hm, ['SlotKey','Slot key','Slot']);
  var codeCol = RotationAuditorService_pick_(hm, ['ScopeCode','Scope code','Code']);
  var nameCol = RotationAuditorService_pick_(hm, ['DisplayName','Display name','Name','ScopeName','Scope']);
  var aliasCols = [];

  for (var h = 0; h < headers.length; h++) {
    var hk = RotationAuditorService_key_(headers[h]);
    if (!hk) continue;
    if (hk.indexOf('alias') >= 0 || hk.indexOf('aliases') >= 0 || hk.indexOf('alternative') >= 0 || hk.indexOf('alternatives') >= 0 || hk.indexOf('typo') >= 0 || hk.indexOf('synonym') >= 0 || hk.indexOf('synonyms') >= 0) {
      aliasCols.push(h);
    }
  }

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var slot = slotCol >= 0 ? RotationAuditorService_clean_(row[slotCol]) : '';
    var code = codeCol >= 0 ? RotationAuditorService_clean_(row[codeCol]) : '';
    var name = nameCol >= 0 ? RotationAuditorService_clean_(row[nameCol]) : '';
    var canonical = name || code || slot;
    if (!canonical) continue;

    meta.slots.push({ slot: slot, code: code, name: canonical });
    RotationAuditorService_registerScopeAlias_(meta, canonical, canonical);
    RotationAuditorService_registerScopeAlias_(meta, slot, canonical);
    RotationAuditorService_registerScopeAlias_(meta, code, canonical);
    RotationAuditorService_registerScopeAlias_(meta, name, canonical);

    for (var a = 0; a < aliasCols.length; a++) {
      var rawAliases = RotationAuditorService_clean_(row[aliasCols[a]]);
      if (!rawAliases) continue;
      rawAliases.split(/[;,|]/).forEach(function(x){
        RotationAuditorService_registerScopeAlias_(meta, x, canonical);
      });
    }

    RotationAuditorService_registerBuiltInScopeAliases_(meta, canonical);
  }
  return meta;
}

function RotationAuditorService_readMaxByScope_(ss, aliases) {
  var out = {};
  var sh = ss.getSheetByName('Config_Scopes');
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return out;
  var hm = RotationAuditorService_headerMap_(values[0]);
  var nameCol = RotationAuditorService_pick_(hm, ['DisplayName','Display name','Name','ScopeName','Scope']);
  var codeCol = RotationAuditorService_pick_(hm, ['ScopeCode','Scope code','Code']);
  var slotCol = RotationAuditorService_pick_(hm, ['SlotKey','Slot key','Slot']);
  var maxCol = RotationAuditorService_pick_(hm, ['Max number audits','Max number audit','Max audits','Max audit','Maximum audits','Max consecutive','MaxConsecutive']);
  if (maxCol < 0) return out;
  for (var r = 1; r < values.length; r++) {
    var raw = nameCol >= 0 ? values[r][nameCol] : (codeCol >= 0 ? values[r][codeCol] : (slotCol >= 0 ? values[r][slotCol] : ''));
    var canonical = RotationAuditorService_canonicalScope_({ aliases: aliases }, raw);
    var max = RotationAuditorService_intOrNull_(values[r][maxCol]);
    if (canonical && max !== null) out[canonical] = max;
  }
  return out;
}

function RotationAuditorService_readAuditors_(ss, aliases) {
  var out = { byEmail: {}, byName: {}, list: [] };
  var sh = ss.getSheetByName('Auditors');
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return out;
  var headers = values[0];
  var hm = RotationAuditorService_headerMap_(headers);
  var nameCol = RotationAuditorService_pick_(hm, ['Name','Auditor','Auditor name']);
  var emailCol = RotationAuditorService_pick_(hm, ['E-mail','Email','E mail','Auditor email','Auditor_Email']);
  var activeCol = RotationAuditorService_pick_(hm, ['Active']);
  var roleCol = RotationAuditorService_pick_(hm, ['Role']);
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var email = emailCol >= 0 ? RotationAuditorService_normEmail_(row[emailCol]) : '';
    if (!email) continue;
    var role = roleCol >= 0 ? RotationAuditorService_clean_(row[roleCol]).toLowerCase() : '';
    var active = activeCol >= 0 ? RotationAuditorService_clean_(row[activeCol]).toUpperCase() : 'YES';
    if (role && role !== 'auditor') continue;
    if (active && active !== 'YES' && active !== 'TRUE' && active !== '1') continue;
    var name = nameCol >= 0 ? RotationAuditorService_clean_(row[nameCol]) : email;
    var qualifications = {};
    for (var c = 0; c < headers.length; c++) {
      var header = RotationAuditorService_clean_(headers[c]);
      if (!header) continue;
      var scope = RotationAuditorService_canonicalScope_({ aliases: aliases }, header);
      if (!scope) continue;
      if (RotationAuditorService_isYes_(row[c])) qualifications[scope] = true;
    }
    var item = { email: email, name: name || email, qualifications: qualifications };
    out.byEmail[email] = item;
    if (name) out.byName[name.toLowerCase()] = item;
    out.list.push(item);
  }
  return out;
}

function RotationAuditorService_readLogEvents_(ss, aliases, auditors) {
  var sh = ss.getSheetByName('Log realized audits');
  var groups = {};
  if (!sh) return groups;
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return groups;
  var headers = values[0];
  var hm = RotationAuditorService_headerMap_(headers);
  var companyUidCol = RotationAuditorService_pick_(hm, ['Company_UID','Company UID','CompanyUID','COMPANY_UID']);
  var companyCol = RotationAuditorService_pick_(hm, ['Company','Customer','Bedrijf','COMPANY']);
  var auditorCol = RotationAuditorService_pick_(hm, ['Auditor','AUDITOR','Auditor email','AuditorEmail','Auditor_Email','E-mail','Email']);
  var yearCol = RotationAuditorService_pick_(hm, ['Year','YEAR']);
  var dateCol = RotationAuditorService_pick_(hm, ['Date','Audit date','Audit_Date','Completed date','Completion date','Execution date','Executed on']);
  var statusCol = RotationAuditorService_pick_(hm, ['Status','STATUS']);
  if (companyCol < 0 || auditorCol < 0) return groups;
  var scopeCols = RotationAuditorService_detectScopeColumns_(headers, hm, aliases);
  if (!scopeCols.length) return groups;

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var status = statusCol >= 0 ? RotationAuditorService_clean_(row[statusCol]).toLowerCase() : '';
    if (status) {
      if (status.indexOf('cancel') >= 0 || status.indexOf('reject') >= 0 || status.indexOf('deny') >= 0) continue;
      if (!(status.indexOf('complete') >= 0 || status.indexOf('realized') >= 0)) continue;
    }
    var company = companyCol >= 0 ? RotationAuditorService_clean_(row[companyCol]) : '';
    var companyUid = companyUidCol >= 0 ? RotationAuditorService_clean_(row[companyUidCol]) : '';
    var rawAuditor = auditorCol >= 0 ? RotationAuditorService_clean_(row[auditorCol]) : '';
    var auditor = RotationAuditorService_resolveAuditor_({ auditors: auditors }, rawAuditor);
    var year = yearCol >= 0 ? RotationAuditorService_intOrNull_(row[yearCol]) : null;
    if (!year && dateCol >= 0) year = RotationAuditorService_yearFromDate_(row[dateCol]);
    if (!company || !auditor || !year) continue;

    var scopes = [];
    if (scopeCols.length === 1 && scopeCols[0].single) {
      var rawScopes = RotationAuditorService_clean_(row[scopeCols[0].index]);
      rawScopes.split(',').forEach(function(x){
        var sc = RotationAuditorService_canonicalScope_({ aliases: aliases }, x);
        if (sc) scopes.push(sc);
      });
    } else {
      for (var s = 0; s < scopeCols.length; s++) {
        if (!RotationAuditorService_isYes_(row[scopeCols[s].index])) continue;
        scopes.push(scopeCols[s].scope);
      }
    }

    for (var q = 0; q < scopes.length; q++) {
      var scope = scopes[q];
      var groupKey = RotationAuditorService_groupKey_(companyUid, company, scope);
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          companyUid: companyUid,
          company: company,
          scope: scope,
          ownersByYear: {}
        };
      }
      if (!groups[groupKey].ownersByYear[year]) groups[groupKey].ownersByYear[year] = {};
      groups[groupKey].ownersByYear[year][auditor] = true;
    }
  }
  return groups;
}

function RotationAuditorService_detectScopeColumns_(headers, hm, aliases) {
  var out = [];
  var dateApprovedCol = -1;
  var hoursPlannedCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = RotationAuditorService_clean_(headers[i]).toLowerCase();
    if (h === 'date approved') dateApprovedCol = i;
    if (h === 'hours planned') hoursPlannedCol = i;
  }
  if (dateApprovedCol >= 0 && hoursPlannedCol > dateApprovedCol + 1) {
    for (var c = dateApprovedCol + 1; c < hoursPlannedCol; c++) {
      var sc = RotationAuditorService_canonicalScope_({ aliases: aliases }, headers[c]);
      if (sc) out.push({ index: c, scope: sc });
    }
    if (out.length) return out;
  }
  for (var j = 0; j < headers.length; j++) {
    var raw = RotationAuditorService_clean_(headers[j]);
    var canon = RotationAuditorService_canonicalScope_({ aliases: aliases }, raw);
    if (canon && /^SCOPE_\d+$/i.test(raw)) out.push({ index: j, scope: canon });
  }
  if (out.length) return out;
  var singleCol = RotationAuditorService_pick_(hm, ['Scope','Scopes','SCOPE','STANDARD','Standards']);
  if (singleCol >= 0) out.push({ index: singleCol, single: true });
  return out;
}

function RotationAuditorService_buildOverviewRows_(groups, maxByScope) {
  var rows = [];
  Object.keys(groups || {}).forEach(function(k){
    var g = groups[k];
    var auditors = {};
    Object.keys(g.ownersByYear || {}).forEach(function(y){
      var owners = g.ownersByYear[y] || {};
      Object.keys(owners).forEach(function(a){ auditors[a] = true; });
    });
    Object.keys(auditors).forEach(function(auditor){
      var consec = RotationAuditorService_countConsecutive_(g.ownersByYear, auditor, null);
      var max = maxByScope.hasOwnProperty(g.scope) ? RotationAuditorService_intOrNull_(maxByScope[g.scope]) : null;
      var status = RotationAuditorService_status_(consec, max);
      rows.push({
        auditor: auditor,
        company: g.company || '',
        companyUid: g.companyUid || '',
        companyKey: g.companyUid ? ('UID|' + g.companyUid) : ('NAME|' + String(g.company || '').toLowerCase()),
        scope: g.scope,
        years: RotationAuditorService_yearsForAuditor_(g.ownersByYear, auditor).join(','),
        consecutiveYears: consec,
        maxConsecutive: max,
        hasMaximum: max !== null ? 'YES' : 'NO',
        status: status
      });
    });
  });
  var prio = { AT_LIMIT:0, NEAR_LIMIT:1, AVAILABLE:2, NO_LIMIT_DEFINED:3 };
  rows.sort(function(a,b){
    var pa = prio[a.status] !== undefined ? prio[a.status] : 9;
    var pb = prio[b.status] !== undefined ? prio[b.status] : 9;
    if (pa !== pb) return pa - pb;
    if (a.auditor !== b.auditor) return String(a.auditor).localeCompare(String(b.auditor));
    if (a.company !== b.company) return String(a.company).localeCompare(String(b.company));
    return String(a.scope).localeCompare(String(b.scope));
  });
  return rows;
}

function RotationAuditorService_countConsecutive_(ownersByYear, auditor, maxYearExclusive) {
  var target = RotationAuditorService_normEmail_(auditor || '');
  if (!target || !ownersByYear) return 0;
  var years = Object.keys(ownersByYear)
    .map(function(y){ return parseInt(y, 10); })
    .filter(function(n){ return !isNaN(n) && (!maxYearExclusive || n < maxYearExclusive); })
    .sort(function(a,b){ return b-a; });
  var count = 0;
  for (var i = 0; i < years.length; i++) {
    var owners = ownersByYear[years[i]] || {};
    if (!owners[target]) break;
    count++;
    for (var other in owners) {
      if (owners.hasOwnProperty(other) && other !== target) return count;
    }
  }
  return count;
}

function RotationAuditorService_findGroup_(pack, companyUid, companyName, scope) {
  var exactKey = RotationAuditorService_groupKey_(companyUid, companyName, scope);
  if (pack.groups && pack.groups[exactKey]) return pack.groups[exactKey];
  var targetName = RotationAuditorService_key_(companyName);
  var targetUid = RotationAuditorService_clean_(companyUid);
  var keys = Object.keys(pack.groups || {});
  for (var i = 0; i < keys.length; i++) {
    var g = pack.groups[keys[i]];
    if (g.scope !== scope) continue;
    if (targetUid && String(g.companyUid || '').trim() === targetUid) return g;
    if (targetName && RotationAuditorService_key_(g.company) === targetName) return g;
  }
  return null;
}

function RotationAuditorService_isQualified_(pack, auditor, scope) {
  if (!scope) return true;
  return !!(auditor && auditor.qualifications && auditor.qualifications[scope]);
}

function RotationAuditorService_yearsForAuditor_(ownersByYear, auditor) {
  var target = RotationAuditorService_normEmail_(auditor || '');
  var out = [];
  Object.keys(ownersByYear || {}).forEach(function(y){
    var owners = ownersByYear[y] || {};
    if (owners[target]) out.push(parseInt(y, 10));
  });
  out = out.filter(function(n){ return !isNaN(n); }).sort(function(a,b){ return a-b; });
  return out;
}

function RotationAuditorService_status_(consec, max) {
  if (max === null || max === undefined || isNaN(Number(max))) return 'NO_LIMIT_DEFINED';
  max = Number(max);
  consec = Number(consec || 0);
  if (consec >= max) return 'AT_LIMIT';
  if (consec === max - 1) return 'NEAR_LIMIT';
  return 'AVAILABLE';
}

function RotationAuditorService_canonicalScope_(pack, raw) {
  var s = RotationAuditorService_clean_(raw);
  if (!s) return '';
  var aliases = (pack && pack.aliases) ? pack.aliases : (pack || {});
  var byAny = aliases.byAnyKey || {};
  var byLoose = aliases.byLooseKey || {};
  var exact = RotationAuditorService_key_(s);
  if (exact && byAny[exact]) return byAny[exact];
  var loose = RotationAuditorService_scopeLooseKey_(s);
  if (loose && byLoose[loose]) return byLoose[loose];
  return s;
}


function RotationAuditorService_registerScopeAlias_(meta, aliasValue, canonical) {
  var alias = RotationAuditorService_clean_(aliasValue);
  canonical = RotationAuditorService_clean_(canonical);
  if (!alias || !canonical) return;
  var exact = RotationAuditorService_key_(alias);
  if (exact) meta.byAnyKey[exact] = canonical;
  var loose = RotationAuditorService_scopeLooseKey_(alias);
  if (loose) meta.byLooseKey[loose] = canonical;
}

function RotationAuditorService_registerBuiltInScopeAliases_(meta, canonical) {
  var looseCanonical = RotationAuditorService_scopeLooseKey_(canonical);
  if (!looseCanonical) return;

  // Known historical spelling issue kept intentionally in Config_Scopes:
  // "Florimark Tracecert" must also match "Florimark Tracecert" in Auditors/UI.
  if (looseCanonical.indexOf('florimarktracecert') >= 0 || looseCanonical.indexOf('florimarktracecert') >= 0) {
    RotationAuditorService_registerScopeAlias_(meta, 'Florimark Tracecert', canonical);
    RotationAuditorService_registerScopeAlias_(meta, 'Florimark Tracecert', canonical);
    RotationAuditorService_registerScopeAlias_(meta, 'Florimark Tracert', canonical);
    RotationAuditorService_registerScopeAlias_(meta, 'Tracecert', canonical);
    RotationAuditorService_registerScopeAlias_(meta, 'Tracecert', canonical);
  }
}

function RotationAuditorService_scopeLooseKey_(s) {
  var k = RotationAuditorService_key_(s);
  if (!k) return '';
  k = k.replace(/\s+/g, '');
  k = k.replace(/tracecert/g, 'tracecert');
  k = k.replace(/tracecert/g, 'tracecert');
  k = k.replace(/tracert/g, 'tracecert');
  return k;
}

function RotationAuditorService_resolveAuditor_(pack, raw) {
  var s = RotationAuditorService_clean_(raw).toLowerCase();
  if (!s) return '';
  if (s.indexOf('@') > 0) return RotationAuditorService_normEmail_(s);
  var auditors = pack && pack.auditors ? pack.auditors : null;
  if (auditors && auditors.byName && auditors.byName[s]) return auditors.byName[s].email;
  return s;
}

function RotationAuditorService_groupKey_(companyUid, companyName, scope) {
  var c = RotationAuditorService_clean_(companyUid);
  var n = RotationAuditorService_key_(companyName);
  return (c ? ('UID|' + c) : ('NAME|' + n)) + '|' + RotationAuditorService_clean_(scope);
}

function RotationAuditorService_headerMap_(headers) {
  var map = { __raw: headers || [] };
  for (var i = 0; i < (headers || []).length; i++) {
    var k = RotationAuditorService_key_(headers[i]);
    if (k && map[k] === undefined) map[k] = i;
  }
  return map;
}

function RotationAuditorService_pick_(hm, names) {
  for (var i = 0; i < (names || []).length; i++) {
    var k = RotationAuditorService_key_(names[i]);
    if (hm[k] !== undefined) return hm[k];
  }
  return -1;
}

function RotationAuditorService_key_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9_\- ]/g, '');
}

function RotationAuditorService_clean_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function RotationAuditorService_normEmail_(v) {
  return RotationAuditorService_clean_(v).toLowerCase();
}

function RotationAuditorService_isYes_(v) {
  var s = RotationAuditorService_clean_(v).toLowerCase();
  return s === 'x' || s === 'yes' || s === 'true' || s === '1';
}

function RotationAuditorService_intOrNull_(v) {
  if (v === null || v === '' || typeof v === 'undefined') return null;
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function RotationAuditorService_yearFromDate_(cell) {
  if (!cell) return null;
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) return cell.getFullYear();
  var s = String(cell).trim();
  var m = s.match(/^(\d{4})[-\/]/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function RUN_ROTATION_AUDITOR_SERVICE_SELFTEST() {
  var gap = {
    2023: { x:true },
    2024: { x:true },
    2026: { x:true }
  };
  var other = {
    2023: { x:true },
    2024: { y:true },
    2025: { x:true }
  };
  return {
    success: true,
    version: ROTATION_AUDITOR_SERVICE.VERSION,
    gapDoesNotBreak: RotationAuditorService_countConsecutive_(gap, 'x', null),
    otherAuditorBreaks: RotationAuditorService_countConsecutive_(other, 'x', null)
  };
}

/*****************************************************************************************
 * QUALIFICATION DIAGNOSTICS PATCH — 2026-04-30
 * PURPOSE:
 *   Diagnose why Toolkit/Scope Manager may show all auditors even when selected scopes
 *   require qualification filtering.
 *
 * PUBLIC RUNNERS:
 *   RAS_DiagnoseQualificationMatrix()
 *   RAS_ClearCache()
 *****************************************************************************************/

function RAS_ClearCache() {
  if (typeof RotationAuditorService_clearCache === 'function') {
    return RotationAuditorService_clearCache();
  }
  return { success:false, error:'RotationAuditorService_clearCache missing' };
}

function RAS_DiagnoseQualificationMatrix() {
  var started = new Date().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pack = RotationAuditorService_getPack_(ss, true);
  var aliases = pack.aliases || { slots: [], byAnyKey: {} };
  var auditors = (pack.auditors && pack.auditors.list) ? pack.auditors.list : [];
  var rows = [];

  for (var i = 0; i < auditors.length; i++) {
    var aud = auditors[i];
    for (var s = 0; s < (aliases.slots || []).length; s++) {
      var slot = aliases.slots[s] || {};
      var scope = RotationAuditorService_canonicalScope_(pack, slot.name || slot.code || slot.slot);
      if (!scope) continue;
      rows.push([
        aud.name || '',
        aud.email || '',
        slot.slot || '',
        slot.code || '',
        scope,
        aud.qualifications && aud.qualifications[scope] ? 'YES' : 'NO'
      ]);
    }
  }

  var sh = ss.getSheetByName('RAS_Qualification_Diagnostics') || ss.insertSheet('RAS_Qualification_Diagnostics');
  sh.clearContents();
  var header = ['Auditor name', 'Auditor email', 'SlotKey', 'ScopeCode', 'Canonical scope', 'Qualified'];
  sh.getRange(1, 1, rows.length + 1, header.length).setValues([header].concat(rows));
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, header.length); } catch (e) {}

  var result = {
    success: true,
    durationMs: new Date().getTime() - started,
    version: ROTATION_AUDITOR_SERVICE.VERSION,
    auditors: auditors.length,
    configScopes: (aliases.slots || []).length,
    aliasKeys: Object.keys(aliases.byAnyKey || {}).length,
    looseAliasKeys: Object.keys(aliases.byLooseKey || {}).length,
    reportSheet: 'RAS_Qualification_Diagnostics',
    warning: 'If Toolkit still shows all auditors, the Toolkit is probably calling getEligibleAuditors with an empty scopes[] payload or using another endpoint. If it shows zero auditors, compare ScopeCode/DisplayName/Auditors headers in this report.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RAS_TestEligibleAuditorsForScope(scopeNameOrSlotKey) {
  scopeNameOrSlotKey = String(scopeNameOrSlotKey || 'SCOPE_07').trim();
  var res = RotationAuditorService_getEligibleAuditors({
    companyUid: '',
    companyName: '',
    scopes: [scopeNameOrSlotKey]
  });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}
