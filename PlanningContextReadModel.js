/***********************************************************************
 * PlanningContextReadModel.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_CONTEXT_R1
 *
 * PURPOSE
 *   Coarse-grained, read-only planning context for Concept Planning and
 *   Planning Workspace 2.0.
 *
 * COMPOSES
 *   - PlanningDemandService_get
 *   - PlanningProfilesService_get
 *   - AvailabilityPeriodReadModel_get
 *
 * GOVERNANCE
 *   - No new source of truth.
 *   - Audit planning remains demand/lifecycle source.
 *   - Companies / Auditors / Config_Scopes remain profile owners.
 *   - AvailabilityService / Auditor Availability remains availability owner.
 *   - No writes and no lifecycle side effects.
 *
 * SPEED CONTRACT
 *   - One server RPC can hydrate demand + relevant profiles + availability.
 *   - Scope catalog loaded once and reused as canonical precomputed evidence.
 *   - Company profiles limited to companies appearing in demand result.
 *   - Availability limited to auditor profiles returned by this request.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var PLANNING_CONTEXT_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_CONTEXT_R1';

function PCRM_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PCRM_unique_(arr, normalizer) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (arr || []).length; i++) {
    var raw = PCRM_clean_(arr[i]);
    if (!raw) continue;
    var key = normalizer ? normalizer(raw) : raw;
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(raw);
  }
  return out;
}

function PCRM_activeScopeNames_() {
  if (typeof ConfigScopes_GetActiveScopes !== 'function') return [];
  var rows = ConfigScopes_GetActiveScopes(false) || [];
  return PCRM_unique_(rows.map(function(x) {
    return PCRM_clean_(x && (x.displayName || x.name || x.code));
  }), function(x) { return x.toLowerCase(); });
}

function PCRM_companySelectors_(demandRows) {
  var uids = [];
  var names = [];
  for (var i = 0; i < (demandRows || []).length; i++) {
    var r = demandRows[i] || {};
    if (r.companyUid) uids.push(r.companyUid);
    if (r.company) names.push(r.company);
  }
  return {
    companyUids: PCRM_unique_(uids, function(x){ return x.toLowerCase(); }),
    companyNames: PCRM_unique_(names, function(x){ return x.toLowerCase(); })
  };
}

function PCRM_auditorEmails_(auditors) {
  return PCRM_unique_((auditors || []).map(function(x) {
    return PCRM_clean_(x && x.email).toLowerCase();
  }), function(x){ return x; });
}

/**
 * input:
 *   from/to required
 *   Optional PlanningDemand filters are passed through:
 *     status, auditor, country, region, scope, limit, includeCompanyMeta
 *   includeCompanies?: boolean (default true)
 *   includeAuditors?: boolean (default true)
 *   includeAvailability?: boolean (default true)
 */
function PlanningContextReadModel_get(input) {
  input = input || {};

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningContextReadModel_get', {
    from: input.from || input.start || input.periodFrom || '',
    to: input.to || input.end || input.periodTo || '',
    includeAvailability: input.includeAvailability !== false
  }) : null;

  if (typeof PlanningDemandService_get !== 'function') {
    throw new Error('PlanningContextReadModel: PlanningDemandService_get unavailable');
  }
  if (typeof PlanningProfilesService_get !== 'function') {
    throw new Error('PlanningContextReadModel: PlanningProfilesService_get unavailable');
  }
  if (input.includeAvailability !== false && typeof AvailabilityPeriodReadModel_get !== 'function') {
    throw new Error('PlanningContextReadModel: AvailabilityPeriodReadModel_get unavailable');
  }

  var demand = PlanningDemandService_get(input);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'demand', {
    returned: demand && demand.rows ? demand.rows.length : 0
  });

  var scopeNames = PCRM_activeScopeNames_();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'scopeEvidence', {
    activeScopes: scopeNames.length
  });

  var selectors = PCRM_companySelectors_(demand.rows || []);
  var profiles = PlanningProfilesService_get({
    companyUids: selectors.companyUids,
    companyNames: selectors.companyNames,
    includeCompanies: input.includeCompanies !== false,
    includeAuditors: input.includeAuditors !== false,
    precomputedEvidence: {
      activeScopeNames: scopeNames
    }
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'profiles', {
    companies: profiles && profiles.companies ? profiles.companies.length : 0,
    auditors: profiles && profiles.auditors ? profiles.auditors.length : 0
  });

  var availability = null;
  if (input.includeAvailability !== false) {
    var auditorEmails = PCRM_auditorEmails_(profiles.auditors || []);
    availability = AvailabilityPeriodReadModel_get({
      from: demand.period.from,
      to: demand.period.to,
      auditorEmails: auditorEmails
    });
    if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'availability', {
      auditors: auditorEmails.length,
      rows: availability && availability.rows ? availability.rows.length : 0
    });
  }

  var result = {
    success: true,
    build: PLANNING_CONTEXT_BUILD,
    period: demand.period,
    demand: demand,
    profiles: profiles,
    availability: availability,
    meta: {
      writes: false,
      coarseGrainedRpc: true,
      canonicalOwners: {
        demand: 'Audit planning / lifecycle',
        company: 'Companies',
        auditor: 'Auditors',
        scope: 'Config_Scopes',
        availability: 'AvailabilityService / Auditor Availability'
      },
      scopeEvidenceSource: 'Config_Scopes',
      companySelectors: {
        uids: selectors.companyUids.length,
        names: selectors.companyNames.length
      }
    }
  };

  if (typeof DPL_end_ === 'function') {
    result.devPerformance = DPL_end_(perf, {
      demandRows: demand && demand.rows ? demand.rows.length : 0,
      companies: profiles && profiles.companies ? profiles.companies.length : 0,
      auditors: profiles && profiles.auditors ? profiles.auditors.length : 0,
      availabilityRows: availability && availability.rows ? availability.rows.length : 0
    });
  }

  return result;
}
