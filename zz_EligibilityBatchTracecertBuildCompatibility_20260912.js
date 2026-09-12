/***********************************************************************
 * zz_EligibilityBatchTracecertBuildCompatibility_20260912.js
 * BUILD: 2026-09-12_ELIGIBILITY_BATCH_TRACECERT_BUILD_COMPAT_R1
 *
 * Purpose
 * - Keep the Tracecert qualification compatibility fix scoped to audits that
 *   actually require Florimark Tracecert.
 * - Existing d16 eligibility rows for all other scopes remain valid.
 * - Tracecert rows computed before the header fix remain invalid and require
 *   canonical refresh.
 *
 * No reads/writes. Classification only. EligibilityService remains owner.
 ***********************************************************************/
var ELIGIBILITY_BATCH_TRACECERT_BUILD_COMPAT_BUILD='2026-09-12_ELIGIBILITY_BATCH_TRACECERT_BUILD_COMPAT_R1';

function EBTBC_norm_(v){return String(v==null?'':v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'');}
function EBTBC_hasTracecert_(scopes){
  var a=Array.isArray(scopes)?scopes:[];
  for(var i=0;i<a.length;i++){
    var n=EBTBC_norm_(a[i]);
    if(n==='florimarktracecert'||n==='florimarktracecet'||n==='florimarktf')return true;
  }
  return false;
}

function EBRM_cacheValidity_(args){
  args=args||{};
  var reasons=[];
  var computedBuild=EBRM_clean_(args.computedBuild);
  var currentBuild=EBRM_clean_(args.currentBuild);
  var notes=EBRM_clean_(args.notes);
  var currentGeneration=EBRM_clean_(args.currentGeneration)||'GEN_LEGACY';
  var requiredScopes=Array.isArray(args.requiredScopes)?args.requiredScopes:[];
  var tracecert=EBTBC_hasTracecert_(requiredScopes);
  var legacyD16='EligibilityService_d16_FORCE_REFRESH_20260702';
  var tracecertD17='EligibilityService_d17_TRACECERT_HEADER_COMPAT_20260912';

  var buildEquivalent=false;
  if(computedBuild===currentBuild)buildEquivalent=true;
  else if(!tracecert&&computedBuild===legacyD16&&currentBuild===tracecertD17)buildEquivalent=true;

  var buildMismatch=!!currentBuild&&!buildEquivalent;
  if(buildMismatch)reasons.push('BUILD_MISMATCH');

  var generationMarkerPresent=notes.indexOf('auditorScopeGeneration=')>=0;
  var generationMismatch=generationMarkerPresent&&notes.indexOf('auditorScopeGeneration='+currentGeneration)<0;
  if(generationMismatch)reasons.push('AUDITOR_SCOPE_GENERATION_MISMATCH');

  return{
    validByEligibilityServiceSheetContract:!buildMismatch&&!generationMismatch,
    buildMismatch:buildMismatch,
    buildEquivalent:buildEquivalent,
    tracecertScope:tracecert,
    generationMarkerPresent:generationMarkerPresent,
    generationMismatch:generationMismatch,
    reasons:reasons
  };
}

function ELIGIBILITY_BATCH_TRACECERT_BUILD_COMPAT_contract(){return{
  build:ELIGIBILITY_BATCH_TRACECERT_BUILD_COMPAT_BUILD,
  legacyBuild:'EligibilityService_d16_FORCE_REFRESH_20260702',
  tracecertBuild:'EligibilityService_d17_TRACECERT_HEADER_COMPAT_20260912',
  nonTracecertLegacyAccepted:true,
  tracecertLegacyAccepted:false,
  writes:false,
  newSsot:false
};}
