/***********************************************************************
 * ConceptPlanningService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_R1
 *
 * PURPOSE
 *   Read-only advisory shortlist for Concept Planning.
 *   Uses Planning Context + Eligibility batch cache projection.
 *
 * GOVERNANCE
 *   - No writes, holds, commits or lifecycle changes.
 *   - EligibilityService remains canonical qualification/rotation owner.
 *   - Stale/missing eligibility is never silently accepted.
 *   - Output is advisory only; Commit must revalidate canonically.
 *
 * SPEED CONTRACT
 *   - One PlanningContext RPC composition.
 *   - One Eligibility_Cache batch read for all demand audits.
 *   - No per-audit/per-auditor Sheet calls.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var CONCEPT_PLANNING_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_R1';

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

function ConceptPlanningService_get(input) {
  input = input || {};
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('ConceptPlanningService_get', {
    from: input.from || input.start || input.periodFrom || '',
    to: input.to || input.end || input.periodTo || ''
  }) : null;

  if (typeof PlanningContextReadModel_get !== 'function') {
    throw new Error('ConceptPlanningService: PlanningContextReadModel_get unavailable');
  }
  if (typeof EligibilityBatchReadModel_get !== 'function') {
    throw new Error('ConceptPlanningService: EligibilityBatchReadModel_get unavailable');
  }

  var contextInput = {};
  var pass = ['from','start','periodFrom','to','end','periodTo','status','auditor','country','region','scope','limit'];
  for (var p = 0; p < pass.length; p++) {
    var k = pass[p];
    if (Object.prototype.hasOwnProperty.call(input, k)) contextInput[k] = input[k];
  }
  contextInput.includeAvailability = false;
  contextInput.includeCompanies = input.includeCompanies !== false;
  contextInput.includeAuditors = false;

  var context = PlanningContextReadModel_get(contextInput);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'planningContext', {
    demandRows: context && context.demand && context.demand.rows ? context.demand.rows.length : 0
  });

  var demandRows = context && context.demand && Array.isArray(context.demand.rows) ? context.demand.rows : [];
  var auditIds = CPS_demandAuditIds_(demandRows);
  var eligibility = EligibilityBatchReadModel_get({ auditIds: auditIds });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'eligibilityBatch', {
    requested: auditIds.length,
    returned: eligibility && eligibility.rows ? eligibility.rows.length : 0,
    stale: eligibility && eligibility.meta ? eligibility.meta.stale || 0 : 0,
    missing: eligibility && eligibility.meta ? eligibility.meta.missing || 0 : 0
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
    period: context.period,
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
