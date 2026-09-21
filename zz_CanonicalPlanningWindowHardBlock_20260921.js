/**
 * AMS-01.6 — canonical planning-window hard-block guard.
 *
 * Empty scope-window intersections are displayable as a union for diagnostics,
 * but they MUST never be accepted for planning commit.
 */
var MODEL_C_PLANNING_WINDOW_HARD_BLOCK_BUILD='2026-09-21_AMS_01_6_MODEL_C_WINDOW_HARD_BLOCK_R1';

function CPV_planningWindowFromResolved_(ctx,resolved){
  var subject=CPV_subject_(ctx);
  var source='_mp_resolvePlanningWindowCached_/_mp_resolvePlanningWindow_';
  var fromISO=CPV_isoDate_(resolved&&resolved.startDate);
  var toISO=CPV_isoDate_(resolved&&resolved.endDate);

  if(!fromISO||!toISO){
    return CPV_ownerFailure_(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_UNAVAILABLE',
      'Planning window is unavailable for this audit',
      subject,
      source,
      resolved
    );
  }

  if(resolved&&resolved.hardBlock===true){
    var hardWarnings=Array.isArray(resolved.warnings)?resolved.warnings:[];
    var hardCode='SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION';
    for(var hw=0;hw<hardWarnings.length;hw++){
      if(CPV_clean_(hardWarnings[hw]&&hardWarnings[hw].code)){
        hardCode=CPV_clean_(hardWarnings[hw].code);
        break;
      }
    }
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.PLANNING_WINDOW,
      hardCode,
      'Selected scopes have no shared planning window',
      {
        subject:subject,
        source:source,
        evidence:{
          from:fromISO,
          to:toISO,
          mode:resolved.mode||'',
          hardBlock:true,
          warnings:hardWarnings,
          activeScopes:resolved.activeScopes||[],
          scopeWindows:resolved.scopeWindows||[]
        }
      }
    );
  }

  var blocks=Array.isArray(ctx.blocks)?ctx.blocks:[];
  for(var b=0;b<blocks.length;b++){
    var d=CPV_isoDate_(blocks[b]&&blocks[b].date);
    if(!d){
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.PLANNING_WINDOW,
        'PLANNING_WINDOW_INVALID_DATE',
        'Invalid planned date',
        {subject:subject,source:source,evidence:resolved}
      );
    }
    if(d<fromISO||d>toISO){
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.PLANNING_WINDOW,
        'PLANNING_WINDOW_OUTSIDE',
        'Planned date '+d+' is outside planning window '+fromISO+' to '+toISO,
        {
          subject:subject,
          source:source,
          evidence:{
            plannedDate:d,
            from:fromISO,
            to:toISO,
            mode:resolved.mode||'',
            warnings:resolved.warnings||[],
            activeScopes:resolved.activeScopes||[],
            scopeWindows:resolved.scopeWindows||[]
          }
        }
      );
    }
  }

  var warnings=Array.isArray(resolved.warnings)?resolved.warnings:[];
  if(warnings.length){
    return CanonicalValidator_warning(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_SOFT_WARNING',
      CPV_clean_(warnings[0]&&warnings[0].message)||'Planning window contains a soft warning',
      {
        subject:subject,
        source:source,
        evidence:{
          from:fromISO,
          to:toISO,
          mode:resolved.mode||'',
          warnings:warnings,
          activeScopes:resolved.activeScopes||[],
          scopeWindows:resolved.scopeWindows||[]
        }
      }
    );
  }

  return CanonicalValidator_ok(
    CanonicalValidatorKind.PLANNING_WINDOW,
    'PLANNING_WINDOW_OK',
    'Planning date(s) are within the canonical planning window',
    {
      subject:subject,
      source:source,
      evidence:{
        from:fromISO,
        to:toISO,
        mode:resolved.mode||'',
        activeScopes:resolved.activeScopes||[],
        scopeWindows:resolved.scopeWindows||[]
      }
    }
  );
}
