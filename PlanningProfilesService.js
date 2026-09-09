/***********************************************************************
 * PlanningProfilesService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_PROFILES_R1_SPEED_FIRST
 *
 * PURPOSE
 *   Read-only CompanyPlanningProfile + AuditorPlanningProfile projection.
 *   Batch-oriented for Planning Demand / Concept Planning / Workspace 2.0.
 *
 * SPEED CONTRACT
 *   - At most one Companies bulk read and one Auditors bulk read per call.
 *   - No per-company or per-auditor Spreadsheet reads.
 *   - Requested entities filtered in-memory.
 *   - Scope catalog loaded once when auditor profiles are requested.
 *   - DEV-only timing through DevPerformanceLog.
 *   - No writes; no new source of truth.
 ***********************************************************************/

var PLANNING_PROFILES_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_PROFILES_R1_SPEED_FIRST';

function PPS_clean_(v) { return String(v == null ? '' : v).trim(); }
function PPS_norm_(v) { return PPS_clean_(v).toLowerCase(); }
function PPS_key_(v) { return PPS_norm_(v).replace(/[^a-z0-9]+/g, ''); }
function PPS_email_(v) { return PPS_norm_(v); }

function PPS_headerMap_(headers) {
  var out = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var raw = PPS_clean_(headers[i]);
    if (!raw) continue;
    out[raw] = i;
    out[raw.toLowerCase()] = i;
    out[PPS_key_(raw)] = i;
  }
  return out;
}

function PPS_col_(hm, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var c = PPS_clean_(candidates[i]);
    if (!c) continue;
    if (hm.hasOwnProperty(c)) return hm[c];
    if (hm.hasOwnProperty(c.toLowerCase())) return hm[c.toLowerCase()];
    var k = PPS_key_(c);
    if (hm.hasOwnProperty(k)) return hm[k];
  }
  return -1;
}

function PPS_val_(row, idx) { return idx >= 0 && idx < row.length ? row[idx] : ''; }

function PPS_requestedSet_(arr, normalizer) {
  if (!Array.isArray(arr) || !arr.length) return null;
  var out = {};
  for (var i = 0; i < arr.length; i++) {
    var k = normalizer(arr[i]);
    if (k) out[k] = true;
  }
  return Object.keys(out).length ? out : null;
}

function PPS_scopeNames_() {
  try {
    if (typeof ConfigScopes_GetActiveScopes === 'function') {
      var rows = ConfigScopes_GetActiveScopes(false) || [];
      var out = rows.map(function(x) { return PPS_clean_(x && (x.displayName || x.name || x.code)); }).filter(function(x){ return !!x; });
      if (out.length) return out;
    }
  } catch (e) {}
  return [];
}

function PPS_companyProfiles_(ss, input, perf) {
  var sh = ss.getSheetByName('Companies');
  if (!sh) return { rows: [], meta: { sourceRows: 0, columnsRead: 0, missingSheet: true } };

  var values = sh.getDataRange().getValues();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'companiesBulkRead', {
    rows: Math.max(0, values.length - 1),
    cols: values.length ? values[0].length : 0
  });
  if (!values.length) return { rows: [], meta: { sourceRows: 0, columnsRead: 0 } };

  var hdr = values[0] || [];
  var hm = PPS_headerMap_(hdr);
  var cUid = PPS_col_(hm, ['Company_UID','Company UID','CompanyUID','UID']);
  var cName = PPS_col_(hm, ['Company','Company name','Name','Bedrijf']);
  var cCountry = PPS_col_(hm, ['Country']);
  var cRegion = PPS_col_(hm, ['Region']);
  var cLocation = PPS_col_(hm, ['Location','HQ Location','HQ']);
  var cLocationsJson = PPS_col_(hm, ['Locations_JSON','Locations JSON','LocationsJSON']);
  var cDays = PPS_col_(hm, ['Audit planning limitations - days','Audit planning limitations days','Non working days','Non-working days']);
  var cHours = PPS_col_(hm, ['Audit planning limitations - hours','Audit planning limitations hours','Working hours','Hours working']);
  var cComments = PPS_col_(hm, ['Comments','Comment']);
  var cTz = PPS_col_(hm, ['Time zone','Timezone']);
  var cContact = PPS_col_(hm, ['Contactperson','Contact person','Contact name','Contact Name','Contact']);
  var cEmail = PPS_col_(hm, ['Contactperson e-mail','Contactperson email','Contact email','Contact Email']);
  var cPhone = PPS_col_(hm, ['Contactperson phone','Contact phone','Contact Phone','Phone']);
  var cActive = PPS_col_(hm, ['Active']);

  var uidSet = PPS_requestedSet_(input.companyUids || [], PPS_key_);
  var nameSet = PPS_requestedSet_(input.companyNames || [], PPS_key_);
  var out = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var uid = PPS_clean_(PPS_val_(row, cUid));
    var name = PPS_clean_(PPS_val_(row, cName));
    if (!uid && !name) continue;
    if (uidSet || nameSet) {
      var match = (uidSet && uidSet[PPS_key_(uid)]) || (nameSet && nameSet[PPS_key_(name)]);
      if (!match) continue;
    }

    out.push({
      companyUid: uid,
      companyName: name,
      active: PPS_clean_(PPS_val_(row, cActive)),
      country: PPS_clean_(PPS_val_(row, cCountry)),
      region: PPS_clean_(PPS_val_(row, cRegion)),
      hqLocation: PPS_clean_(PPS_val_(row, cLocation)),
      locationsJson: PPS_clean_(PPS_val_(row, cLocationsJson)),
      planningLimitsDays: PPS_clean_(PPS_val_(row, cDays)),
      planningLimitsHours: PPS_clean_(PPS_val_(row, cHours)),
      planningComments: PPS_clean_(PPS_val_(row, cComments)),
      timezone: PPS_clean_(PPS_val_(row, cTz)),
      contactName: PPS_clean_(PPS_val_(row, cContact)),
      contactEmail: PPS_clean_(PPS_val_(row, cEmail)),
      contactPhone: PPS_clean_(PPS_val_(row, cPhone))
    });
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'companiesProject', { returned: out.length });
  return { rows: out, meta: { sourceRows: Math.max(0, values.length - 1), columnsRead: hdr.length } };
}

function PPS_auditorProfiles_(ss, input, perf) {
  var sh = ss.getSheetByName('Auditors');
  if (!sh) return { rows: [], meta: { sourceRows: 0, columnsRead: 0, missingSheet: true } };

  var values = sh.getDataRange().getValues();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'auditorsBulkRead', {
    rows: Math.max(0, values.length - 1),
    cols: values.length ? values[0].length : 0
  });
  if (!values.length) return { rows: [], meta: { sourceRows: 0, columnsRead: 0 } };

  var hdr = values[0] || [];
  var hm = PPS_headerMap_(hdr);
  var cEmail = PPS_col_(hm, ['E-mail','Email','Auditor email','Auditor_Email']);
  var cName = PPS_col_(hm, ['Name','Auditor','Auditor name','Auditor Name']);
  var cActive = PPS_col_(hm, ['Active']);
  var cRole = PPS_col_(hm, ['Role','Function']);
  var cBlocked = PPS_col_(hm, ['Blocked weekdays','Default blocked weekdays','Default blocked days','Blocked weekdays (default)']);
  var cTz = PPS_col_(hm, ['Timezone','Time zone','Default timezone']);
  var cBase = PPS_col_(hm, ['Base','Home base','Home location','Location','City']);
  var cCapacity = PPS_col_(hm, ['Capacity','Expected capacity','Annual capacity','Capacity hours']);
  var wanted = PPS_requestedSet_(input.auditorEmails || [], PPS_email_);

  var scopeNames = PPS_scopeNames_();
  var scopeCols = [];
  for (var s = 0; s < scopeNames.length; s++) {
    var ci = PPS_col_(hm, [scopeNames[s]]);
    if (ci >= 0) scopeCols.push({ name: scopeNames[s], col: ci });
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'scopeCatalog', { activeScopes: scopeNames.length, matchedColumns: scopeCols.length });

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var email = PPS_email_(PPS_val_(row, cEmail));
    if (!email) continue;
    if (wanted && !wanted[email]) continue;

    var role = PPS_clean_(PPS_val_(row, cRole));
    var active = PPS_clean_(PPS_val_(row, cActive));
    var qualifiedScopes = [];
    for (var q = 0; q < scopeCols.length; q++) {
      var v = PPS_norm_(PPS_val_(row, scopeCols[q].col));
      if (v === 'x' || v === 'yes' || v === 'true' || v === '1') qualifiedScopes.push(scopeCols[q].name);
    }

    out.push({
      email: email,
      name: PPS_clean_(PPS_val_(row, cName)) || email,
      active: active,
      role: role,
      blockedWeekdays: PPS_clean_(PPS_val_(row, cBlocked)),
      timezone: PPS_clean_(PPS_val_(row, cTz)),
      baseLocation: PPS_clean_(PPS_val_(row, cBase)),
      capacityHours: PPS_clean_(PPS_val_(row, cCapacity)),
      qualifiedScopes: qualifiedScopes
    });
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'auditorsProject', { returned: out.length });
  return { rows: out, meta: { sourceRows: Math.max(0, values.length - 1), columnsRead: hdr.length, scopeColumns: scopeCols.length } };
}

/**
 * input:
 *   companyUids?: string[]
 *   companyNames?: string[]
 *   auditorEmails?: string[]
 *   includeCompanies?: boolean (default true)
 *   includeAuditors?: boolean (default true)
 */
function PlanningProfilesService_get(input) {
  input = input || {};
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningProfilesService_get', {
    companyUidCount: Array.isArray(input.companyUids) ? input.companyUids.length : 0,
    companyNameCount: Array.isArray(input.companyNames) ? input.companyNames.length : 0,
    auditorCount: Array.isArray(input.auditorEmails) ? input.auditorEmails.length : 0
  }) : null;

  var ss = SpreadsheetApp.getActive();
  var includeCompanies = input.includeCompanies !== false;
  var includeAuditors = input.includeAuditors !== false;

  var companies = includeCompanies ? PPS_companyProfiles_(ss, input, perf) : { rows: [], meta: { skipped: true } };
  var auditors = includeAuditors ? PPS_auditorProfiles_(ss, input, perf) : { rows: [], meta: { skipped: true } };

  var result = {
    success: true,
    build: PLANNING_PROFILES_BUILD,
    companies: companies.rows,
    auditors: auditors.rows,
    meta: {
      companyMeta: companies.meta,
      auditorMeta: auditors.meta,
      writes: false,
      canonicalOwners: {
        company: 'Companies',
        auditor: 'Auditors',
        scope: 'Config_Scopes'
      }
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    companies: result.companies.length,
    auditors: result.auditors.length
  });
  return result;
}
