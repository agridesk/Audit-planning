/***********************************************************************
 * EligibilityBatchReadModel.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_BATCH_READ_R3_CACHE_VALIDITY_PARITY
 *
 * PURPOSE
 *   Read-only batch projection of canonical EligibilityService cache data.
 *   Intended for Concept Planning / Workspace 2.0 to avoid one eligibility
 *   cache read per audit.
 *
 * GOVERNANCE
 *   - EligibilityService remains canonical eligibility owner.
 *   - Eligibility_Cache is derived acceleration data, never a new SSoT.
 *   - This model never computes eligibility and never writes/refreshes cache.
 *   - Cache-validity classification mirrors EligibilityService sheet-cache
 *     acceptance signals only; it does not own eligibility rules.
 *   - Missing/stale/invalid rows are surfaced explicitly and must be
 *     canonically refreshed/validated before Commit.
 *
 * SPEED CONTRACT
 *   - One header read + one bounded bulk data read per request.
 *   - Requested audit IDs filtered in memory.
 *   - Current auditor-scope generation resolved once per batch, never per row.
 *   - No per-audit Sheet calls.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var ELIGIBILITY_BATCH_READ_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_BATCH_READ_R3_CACHE_VALIDITY_PARITY';

function EBRM_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function EBRM_bool_(v) {
  var s = EBRM_clean_(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'x';
}

function EBRM_findCol_(headers, names) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    map[EBRM_clean_(headers[i]).toLowerCase()] = i;
  }
  for (var j = 0; j < (names || []).length; j++) {
    var k = EBRM_clean_(names[j]).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
  }
  return -1;
}

function EBRM_requestedSet_(input) {
  var raw = input && (input.auditIds || input.auditId);
  if (!raw) return null;
  var arr = Array.isArray(raw) ? raw : [raw];
  var set = {};
  for (var i = 0; i < arr.length; i++) {
    var id = EBRM_clean_(arr[i]);
    if (id) set[id] = true;
  }
  return Object.keys(set).length ? set : null;
}

function EBRM_parseJson_(s, fallback) {
  s = EBRM_clean_(s);
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

function EBRM_joinChunks_(row, cols) {
  var parts = [];
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    if (c < 0) continue;
    var v = row[c];
    if (v == null || v === '') continue;
    parts.push(String(v));
  }
  return parts.join('');
}

function EBRM_normalizeAuditorsPayload_(raw) {
  var parsed = EBRM_parseJson_(raw, null);
  if (Array.isArray(parsed)) return { ok: true, auditors: parsed };
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.auditors)) {
    return { ok: true, auditors: parsed.auditors };
  }
  return { ok: !raw, auditors: [] };
}

function EBRM_normalizeMetaPayload_(raw) {
  var parsed = EBRM_parseJson_(raw, null);
  if (!raw) {
    return {
      ok: true,
      meta: {},
      requiredScopes: [],
      scopesRes: { scopes: [], scopesText: '' }
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      meta: {},
      requiredScopes: [],
      scopesRes: { scopes: [], scopesText: '' }
    };
  }
  var meta = parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
    ? parsed.meta
    : parsed;
  var requiredScopes = Array.isArray(parsed.requiredScopes)
    ? parsed.requiredScopes
    : (Array.isArray(meta.requiredScopes) ? meta.requiredScopes : []);
  var scopesRes = parsed.scopesRes && typeof parsed.scopesRes === 'object'
    ? parsed.scopesRes
    : { scopes: [], scopesText: '' };
  return {
    ok: true,
    meta: meta || {},
    requiredScopes: requiredScopes,
    scopesRes: scopesRes
  };
}

function EBRM_currentEligibilityBuild_() {
  return (typeof ELIG_BUILD !== 'undefined') ? EBRM_clean_(ELIG_BUILD) : '';
}

function EBRM_currentAuditorScopeGeneration_() {
  var generation = 'GEN_LEGACY';
  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      generation = EBRM_clean_(AUDITOR_SCOPE_getCacheGeneration_()) || 'GEN_LEGACY';
    }
  } catch (e) {}
  return generation;
}

function EBRM_cacheValidity_(args) {
  args = args || {};
  var reasons = [];
  var computedBuild = EBRM_clean_(args.computedBuild);
  var currentBuild = EBRM_clean_(args.currentBuild);
  var notes = EBRM_clean_(args.notes);
  var currentGeneration = EBRM_clean_(args.currentGeneration) || 'GEN_LEGACY';

  var buildMismatch = !!currentBuild && computedBuild !== currentBuild;
  if (buildMismatch) reasons.push('BUILD_MISMATCH');

  var generationMarkerPresent = notes.indexOf('auditorScopeGeneration=') >= 0;
  var generationMismatch = generationMarkerPresent &&
    notes.indexOf('auditorScopeGeneration=' + currentGeneration) < 0;
  if (generationMismatch) reasons.push('AUDITOR_SCOPE_GENERATION_MISMATCH');

  return {
    validByEligibilityServiceSheetContract: !buildMismatch && !generationMismatch,
    buildMismatch: buildMismatch,
    generationMarkerPresent: generationMarkerPresent,
    generationMismatch: generationMismatch,
    reasons: reasons
  };
}

function EligibilityBatchReadModel_get(input) {
  input = input || {};
  var requested = EBRM_requestedSet_(input);
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('EligibilityBatchReadModel_get', {
    requestedAuditIds: requested ? Object.keys(requested).length : 0
  }) : null;

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Eligibility_Cache');
  if (!sh) {
    var missing = {
      success: true,
      build: ELIGIBILITY_BATCH_READ_BUILD,
      rows: [],
      byAuditId: {},
      meta: {
        sourceRows: 0,
        returned: 0,
        missingSheet: true,
        writes: false,
        canonicalOwner: 'EligibilityService',
        cacheRole: 'derived acceleration only'
      }
    };
    if (typeof DPL_end_ === 'function') missing.devPerformance = DPL_end_(perf, { returned: 0, missingSheet: true });
    return missing;
  }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) {
    var empty = {
      success: true,
      build: ELIGIBILITY_BATCH_READ_BUILD,
      rows: [],
      byAuditId: {},
      meta: { sourceRows: 0, returned: 0, writes: false, canonicalOwner: 'EligibilityService', cacheRole: 'derived acceleration only' }
    };
    if (typeof DPL_end_ === 'function') empty.devPerformance = DPL_end_(perf, { returned: 0 });
    return empty;
  }

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var cAuditId = EBRM_findCol_(headers, ['Audit_ID','Audit ID']);
  var cCompanyUid = EBRM_findCol_(headers, ['Company_UID','Company UID']);
  var cA1 = EBRM_findCol_(headers, ['Eligible_Auditors_JSON']);
  var cA2 = EBRM_findCol_(headers, ['Eligible_Auditors_JSON_2']);
  var cA3 = EBRM_findCol_(headers, ['Eligible_Auditors_JSON_3']);
  var cA4 = EBRM_findCol_(headers, ['Eligible_Auditors_JSON_4']);
  var cMeta = EBRM_findCol_(headers, ['Eligibility_Meta_JSON']);
  var cComputedAt = EBRM_findCol_(headers, ['Computed_At']);
  var cComputedBuild = EBRM_findCol_(headers, ['Computed_Build']);
  var cStale = EBRM_findCol_(headers, ['Stale']);
  var cScopesHash = EBRM_findCol_(headers, ['Scopes_Hash']);
  var cSourceHash = EBRM_findCol_(headers, ['Source_Mtime_Hash']);
  var cNotes = EBRM_findCol_(headers, ['Notes']);

  if (cAuditId < 0) throw new Error("EligibilityBatchReadModel: missing 'Audit_ID' column");

  var used = [cAuditId,cCompanyUid,cA1,cA2,cA3,cA4,cMeta,cComputedAt,cComputedBuild,cStale,cScopesHash,cSourceHash,cNotes]
    .filter(function(x){ return x >= 0; });
  var maxCol = used.length ? Math.max.apply(null, used) + 1 : lastCol;
  var values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, maxCol).getValues() : [];
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'bulkRead', { rows: values.length, cols: maxCol });

  var currentBuild = EBRM_currentEligibilityBuild_();
  var currentGeneration = EBRM_currentAuditorScopeGeneration_();

  var rows = [];
  var byAuditId = {};
  var staleCount = 0;
  var parseErrors = 0;
  var buildMismatchCount = 0;
  var generationMismatchCount = 0;
  var refreshRequiredCount = 0;

  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    var auditId = EBRM_clean_(row[cAuditId]);
    if (!auditId) continue;
    if (requested && !requested[auditId]) continue;

    var auditorsRaw = EBRM_joinChunks_(row, [cA1,cA2,cA3,cA4]);
    var auditorsPayload = EBRM_normalizeAuditorsPayload_(auditorsRaw);
    var metaRaw = cMeta >= 0 ? EBRM_clean_(row[cMeta]) : '';
    var metaPayload = EBRM_normalizeMetaPayload_(metaRaw);
    if (!auditorsPayload.ok) parseErrors++;
    if (!metaPayload.ok) parseErrors++;

    var stale = cStale >= 0 ? EBRM_bool_(row[cStale]) : false;
    if (stale) staleCount++;

    var computedBuild = cComputedBuild >= 0 ? EBRM_clean_(row[cComputedBuild]) : '';
    var notes = cNotes >= 0 ? EBRM_clean_(row[cNotes]) : '';
    var validity = EBRM_cacheValidity_({
      computedBuild: computedBuild,
      currentBuild: currentBuild,
      notes: notes,
      currentGeneration: currentGeneration
    });
    if (validity.buildMismatch) buildMismatchCount++;
    if (validity.generationMismatch) generationMismatchCount++;

    var requiresRefresh = stale || !auditorsRaw || !auditorsPayload.ok || !metaPayload.ok ||
      !validity.validByEligibilityServiceSheetContract;
    if (requiresRefresh) refreshRequiredCount++;

    var refreshReasons = validity.reasons.slice();
    if (stale) refreshReasons.push('STALE');
    if (!auditorsRaw) refreshReasons.push('AUDITORS_PAYLOAD_MISSING');
    if (!auditorsPayload.ok) refreshReasons.push('AUDITORS_PAYLOAD_INVALID');
    if (!metaPayload.ok) refreshReasons.push('META_PAYLOAD_INVALID');

    var rec = {
      auditId: auditId,
      companyUid: cCompanyUid >= 0 ? EBRM_clean_(row[cCompanyUid]) : '',
      auditors: auditorsPayload.auditors,
      eligibilityMeta: metaPayload.meta,
      requiredScopes: metaPayload.requiredScopes,
      scopesRes: metaPayload.scopesRes,
      computedAt: cComputedAt >= 0 ? EBRM_clean_(row[cComputedAt]) : '',
      computedBuild: computedBuild,
      currentEligibilityBuild: currentBuild,
      stale: stale,
      scopesHash: cScopesHash >= 0 ? EBRM_clean_(row[cScopesHash]) : '',
      sourceMtimeHash: cSourceHash >= 0 ? EBRM_clean_(row[cSourceHash]) : '',
      notes: notes,
      auditorScopeGeneration: currentGeneration,
      cacheValidity: validity,
      requiresCanonicalRefresh: requiresRefresh,
      refreshReasons: refreshReasons,
      sourceRow: r + 2
    };

    rows.push(rec);
    byAuditId[auditId] = rec;
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'filterProject', {
    returned: rows.length,
    stale: staleCount,
    parseErrors: parseErrors,
    buildMismatch: buildMismatchCount,
    generationMismatch: generationMismatchCount,
    refreshRequired: refreshRequiredCount
  });

  var requestedIds = requested ? Object.keys(requested) : [];
  var missingIds = [];
  for (var i2 = 0; i2 < requestedIds.length; i2++) {
    if (!byAuditId[requestedIds[i2]]) missingIds.push(requestedIds[i2]);
  }

  var result = {
    success: true,
    build: ELIGIBILITY_BATCH_READ_BUILD,
    rows: rows,
    byAuditId: byAuditId,
    missingAuditIds: missingIds,
    meta: {
      sourceRows: values.length,
      returned: rows.length,
      requested: requestedIds.length,
      missing: missingIds.length,
      stale: staleCount,
      parseErrors: parseErrors,
      buildMismatch: buildMismatchCount,
      generationMismatch: generationMismatchCount,
      refreshRequired: refreshRequiredCount,
      currentEligibilityBuild: currentBuild,
      auditorScopeGeneration: currentGeneration,
      columnsRead: maxCol,
      writes: false,
      canonicalOwner: 'EligibilityService',
      cacheRole: 'derived acceleration only',
      cacheValidityContract: 'EligibilityService sheet acceptance parity'
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    returned: rows.length,
    missing: missingIds.length,
    stale: staleCount,
    parseErrors: parseErrors,
    buildMismatch: buildMismatchCount,
    generationMismatch: generationMismatchCount,
    refreshRequired: refreshRequiredCount
  });
  return result;
}
