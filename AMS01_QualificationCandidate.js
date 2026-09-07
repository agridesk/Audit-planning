/**
 * FILE: AMS01_QualificationCandidate.js
 * BUILD: AMS01_QUALIFICATION_CANDIDATE_20260907_R1
 * PURPOSE:
 *   Read-only AMS-01 candidate for true qualification-only Toolkit membership.
 *   It intentionally excludes rotation/history work from first-paint membership.
 *
 * GOVERNANCE:
 *   - Membership remains Active YES + Role auditor + HARD qualification.
 *   - Rotation is not evaluated here and is explicitly marked pending.
 *   - Email remains auditor identity.
 *   - No business-data writes and no canonical endpoint replacement.
 */

var AMS01_QUALIFICATION_CANDIDATE_BUILD = 'AMS01_QUALIFICATION_CANDIDATE_20260907_R1';

function AMS01_GetQualifiedAuditorsFastCandidate(auditId) {
  var t0 = Date.now();
  auditId = String(auditId || '').trim();
  if (!auditId) return { success:false, message:'Missing auditId' };
  if (typeof TK3S_readAuditContext_R24_ !== 'function') return { success:false, message:'Missing TK3S_readAuditContext_R24_' };
  if (typeof TK3S_isAuditorQualified_R24_ !== 'function') return { success:false, message:'Missing TK3S_isAuditorQualified_R24_' };

  var tCtx = Date.now();
  var ctx = TK3S_readAuditContext_R24_(auditId);
  var contextMs = Date.now() - tCtx;
  var ss = ctx.ss;

  var tAud = Date.now();
  var pack = (typeof __mp_getSheetDataPersistCached_ === 'function')
    ? __mp_getSheetDataPersistCached_(ss, 'Auditors', 300)
    : null;
  if (!pack || !pack.sh) return { success:false, message:"Missing sheet 'Auditors'" };

  var data = pack.data || [];
  var hdr = pack.hdr || data[0] || [];
  var idxName = _mp_findHeaderIdxCI_(hdr, ['Name','Auditor','Auditor name']);
  var idxEmail = _mp_findHeaderIdxCI_(hdr, ['E-mail','Email','E-mail address','Mail']);
  var idxActive = _mp_findHeaderIdxCI_(hdr, ['Active','Is active']);
  var idxRole = _mp_findHeaderIdxCI_(hdr, ['Role','Function']);
  var idxBW = _mp_findHeaderIdxCI_(hdr, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  if (idxName < 0 || idxEmail < 0 || idxActive < 0 || idxRole < 0) {
    return { success:false, message:'Auditors headers missing (Name/E-mail/Active/Role)' };
  }
  var auditorsReadMs = Date.now() - tAud;

  var pre = String(ctx.preassigned || '').trim().toLowerCase();
  var out = [];
  var tFilter = Date.now();

  for (var r=1; r<data.length; r++) {
    var row = data[r] || [];
    if (!_mp_isYes_(row[idxActive])) continue;
    if (String(row[idxRole] || '').trim().toLowerCase() !== 'auditor') continue;
    if (!TK3S_isAuditorQualified_R24_(ss, row, hdr, ctx.requiredScopes || [])) continue;

    var name = String(row[idxName] || '').trim();
    var email = String(row[idxEmail] || '').trim();
    if (!name && !email) continue;
    var isPre = !!pre && (name.toLowerCase() === pre || email.toLowerCase() === pre);

    out.push({
      name:name,
      email:email,
      blockedWeekdays:idxBW >= 0 ? String(row[idxBW] || '').trim() : '',
      isPreassigned:isPre,
      softBlockRotation:false,
      nearRotationLimit:false,
      ineligible:false,
      hardBlockQualification:false,
      ineligibleReason:'',
      performedByScope:{},
      performedCount:0,
      maxAllowed:null,
      qualifiedCanonical:true,
      eligibilityOwner:'AMS01_TRUE_QUALIFICATION_ONLY_CANDIDATE',
      rotationPending:true,
      qualifiedFast:true
    });
  }

  out.sort(function(a,b){
    if (!!a.isPreassigned !== !!b.isPreassigned) return a.isPreassigned ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return {
    success:true,
    build:AMS01_QUALIFICATION_CANDIDATE_BUILD,
    auditId:auditId,
    auditors:out,
    auditorEligibilityMeta:{
      requiredScopes:ctx.requiredScopes || [],
      membershipMode:'HARD_QUALIFICATION_ONLY',
      rotationMode:'NOT_INCLUDED',
      rotationPending:true,
      owner:'TK3S_isAuditorQualified_R24_'
    },
    perf:{
      contextMs:contextMs,
      auditorsReadMs:auditorsReadMs,
      filterMs:Date.now()-tFilter,
      serverMs:Date.now()-t0,
      rowsRead:data.length > 0 ? data.length-1 : 0,
      rowsReturned:out.length
    }
  };
}

function AMS01_CompareQualificationCurrentVsCandidate() {
  var auditId = 'AUD_CultiusItxartSCP_HQ_1777531729225_18';

  var tCurrent = Date.now();
  var current = getToolkitEligibilityLightV5(auditId);
  var currentMs = Date.now() - tCurrent;

  var tCandidate = Date.now();
  var candidate = AMS01_GetQualifiedAuditorsFastCandidate(auditId);
  var candidateMs = Date.now() - tCandidate;

  function ids_(res) {
    return ((res && res.auditors) || []).map(function(a){
      return String((a && (a.email || a.name)) || '').trim().toLowerCase();
    }).filter(Boolean).sort();
  }

  var currentIds = ids_(current);
  var candidateIds = ids_(candidate);
  var result = {
    build:AMS01_QUALIFICATION_CANDIDATE_BUILD,
    auditId:auditId,
    currentMs:currentMs,
    candidateMs:candidateMs,
    improvementMs:currentMs-candidateMs,
    improvementPct:currentMs > 0 ? Math.round(((currentMs-candidateMs)/currentMs)*1000)/10 : 0,
    membershipEqual:JSON.stringify(currentIds) === JSON.stringify(candidateIds),
    currentMembers:currentIds,
    candidateMembers:candidateIds,
    currentServerMs:current && current.__serverMs,
    candidatePerf:candidate && candidate.perf
  };
  Logger.log('[AMS01_QUAL_COMPARE] ' + JSON.stringify(result));
  return result;
}
