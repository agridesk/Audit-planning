/***********************************************************************
 * ConceptPlanningService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_R2_DIRECT_DEMAND
 *
 * PURPOSE
 *   Read-only advisory shortlist for Concept Planning.
 *   Uses Planning Demand + Eligibility batch projection directly.
 *
 * GOVERNANCE
 *   - No writes, holds, commits or lifecycle changes.
 *   - EligibilityService remains canonical qualification/rotation owner.
 *   - Audit planning remains canonical demand/lifecycle source.
 *   - Stale/missing eligibility is never silently accepted.
 *   - Output is advisory only; Commit must revalidate canonically.
 *
 * SPEED CONTRACT
 *   - No PlanningContext hydration for this advisory path.
 *   - One PlanningDemand read.
 *   - One Eligibility_Cache batch read for all demand audits.
 *   - No Config_Scopes, Auditors, Availability or Planning Profiles reads.
 *   - Companies enrichment only when explicitly required by country/region
 *     filtering or includeCompanyMeta=true.
 *   - No per-audit/per-auditor Sheet calls.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var CONCEPT_PLANNING_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_R2_DIRECT_DEMAND';

function CPS_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CPS_norm_(v) {
  return CPS_clean_(v).toLowerCase();
}

function CPS_rankAuditors_(auditors) {
  var out = (auditors || []).slice();
  out.sort(function(a, b) {
    var ap = a && a.isPreassigned === true ? 0 : 1;
    var bp = b && b.isPreassigned === true ? 0 : 1;
    if (ap !== bp) return ap - bp;

    var ar = a && a.softBlockRotation === true ? 1 : 0;
    var br = b && b.softBlockRotation === true ? 1 : 0;
    if (ar !== br) return ar - br;

    var ac = Number(a && a.performedCount || 0) || 0;
    var bc = Number(b && b.performedCount || 0) || 0;
    if (ac !== bc) return ac - bc;

    var an = CPS_clean_(a && (a.name || a.email));
    var bn = CPS_clean_(b && (b.name || b.email));
    return an.localeCompare(bn);
  });
  return out;
}

function CPS_advisoryCandidate_(a) {
  return {
    name: CPS_clean_(a && a.name),
    email: CPS_norm_(a && a.email),
    isPreassigned: !!(a && a.isPreassigned === true),
    rotationWarning: !!(a && a.softBlockRotation === true),
    performedCount: Number(a && a.performedCount || 0) || 0,
    maxAllowed: Number(a && a.maxAllowed || 0) || 0,
    blockedWeekdays: Array.isArray(a && a.blockedWeekdays) ? a.blockedWeekdays.slice() : []
  };
}

function CPS_demandAuditIds_(rows) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var id = CPS_clean_(rows[i] && rows[i].auditId);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function CPS_demandInput_(input) {
  input = input || {};
  var out = {};
  var pass = ['from','start','periodFrom','to','end','periodTo','status','auditor','country','region','scope','limit'];
  for (var p = 0; p < pass.length; p++) {
    var k = pass[p];
    if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = input[k];
  }

  var needsCompanyMeta = !!(
    CPS_clean_(input.country) ||
    CPS_clean_(input.region) ||
    input.includeCompanyMeta === true
  );
  out.includeCompanyMeta = needsCompanyMeta;
  return { input: out, needsCompanyMeta: needsCompanyMeta };
}

function ConceptPlanningService_get(input) {
  input = input || {};
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('ConceptPlanningService_get', {
    from: input.from || input.start || input.periodFrom || '',
    to: input.to || input.end || input.periodTo || ''
  }) : null;

  if (typeof PlanningDemandService_get !== 'function') {
    throw new Error('ConceptPlanningService: PlanningDemandService_get unavailable');
  }
  if (typeof EligibilityBatchReadModel_get !== 'function') {
    throw new Error('ConceptPlanningService: EligibilityBatchReadModel_get unavailable');
  }

  var demandPlan = CPS_demandInput_(input);
  var demand = PlanningDemandService_get(demandPlan.input);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'planningDemand', {
    demandRows: demand && demand.rows ? demand.rows.length : 0,
    companyMetaLoaded: demandPlan.needsCompanyMeta
  });

  var demandRows = demand && Array.isArray(demand.rows) ? demand.rows : [];
  var auditIds = CPS_demandAuditIds_(demandRows);
  var eligibility = EligibilityBatchReadModel_get({ auditIds: auditIds });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'eligibilityBatch', {
    requested: auditIds.length,
    returned: eligibility && eligibility.rows ? eligibility.rows.length : 0,
    stale: eligibility && eligibility.meta ? eligibility.meta.stale || 0 : 0,
    missing: eligibility && eligibility.meta ? eligibility.meta.missing || 0 : 0,
    parseErrors: eligibility && eligibility.meta ? eligibility.meta.parseErrors || 0 : 0
  });

  var rows = [];
  var ready = 0;
  var refreshRequired = 0;
  var noCandidates = 0;
  var maxCandidates = Math.max(1, Math.min(20, Number(input.maxCandidates || 5) || 5));

  for (var i = 0; i < demandRows.length; i++) {
    var d = demandRows[i] || {};
    var id = CPS_clean_(d.auditId);
    var e = eligibility && eligibility.byAuditId ? eligibility.byAuditId[id] : null;
    var reason = '';
    var candidates = [];
    var requiresRefresh = false;

    if (!e) {
      requiresRefresh = true;
      reason = 'ELIGIBILITY_CACHE_MISSING';
    } else if (e.requiresCanonicalRefresh === true || e.stale === true) {
      requiresRefresh = true;
      reason = 'ELIGIBILITY_REFRESH_REQUIRED';
    } else {
      var ranked = CPS_rankAuditors_(e.auditors || []);
      candidates = ranked.slice(0, maxCandidates).map(CPS_advisoryCandidate_);
      if (!candidates.length) reason = 'NO_ELIGIBLE_AUDITORS';
    }

    if (requiresRefresh) refreshRequired++;
    else if (!candidates.length) noCandidates++;
    else ready++;

    rows.push({
      auditId: id,
      companyUid: CPS_clean_(d.companyUid),
      company: CPS_clean_(d.company),
      country: CPS_clean_(d.country),
      region: CPS_clean_(d.region),
      status: CPS_clean_(d.status),
      planningWindowFrom: CPS_clean_(d.planningWindowFrom),
      planningWindowTo: CPS_clean_(d.planningWindowTo),
      urgency: CPS_clean_(d.urgency),
      scopes: Array.isArray(d.scopes) ? d.scopes.slice() : [],
      hoursToPlan: Number(d.hoursToPlan || 0) || 0,
      candidateAuditors: candidates,
      advisoryState: requiresRefresh ? 'REFRESH_REQUIRED' : (candidates.length ? 'READY' : 'NO_CANDIDATES'),
      advisoryReason: reason,
      eligibilityStale: !!(e && e.stale === true),
      eligibilityComputedAt: CPS_clean_(e && e.computedAt),
      requiresCanonicalRefresh: requiresRefresh
    });
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'projectAdvisory', {
    returned: rows.length,
    ready: ready,
    refreshRequired: refreshRequired,
    noCandidates: noCandidates
  });

  var result = {
    success: true,
    build: CONCEPT_PLANNING_BUILD,
    period: demand.period,
    rows: rows,
    totals: {
      audits: rows.length,
      ready: ready,
      refreshRequired: refreshRequired,
      noCandidates: noCandidates
    },
    meta: {
      writes: false,
      advisoryOnly: true,
      commitRevalidationRequired: true,
      noPerAuditReads: true,
      directDemandFastPath: true,
      planningContextSkipped: true,
      companyMetaLoaded: demandPlan.needsCompanyMeta,
      canonicalOwners: {
        demand: 'Audit planning / lifecycle',
        eligibility: 'EligibilityService',
        company: 'Companies'
      }
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    audits: rows.length,
    ready: ready,
    refreshRequired: refreshRequired,
    noCandidates: noCandidates
  });
  return result;
}
