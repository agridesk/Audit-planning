/***********************************************************************
 * WorkspaceEligibilityBuildCompatibilityVerification.js
 * BUILD: 2026-09-12_WORKSPACE_ELIGIBILITY_BUILD_COMPAT_VERIFY_R1
 * Read-only verification. No cache writes/refreshes.
 ***********************************************************************/
var WORKSPACE_ELIGIBILITY_BUILD_COMPAT_VERIFY_BUILD='2026-09-12_WORKSPACE_ELIGIBILITY_BUILD_COMPAT_VERIFY_R1';
function RUN_WORKSPACE_ELIGIBILITY_BUILD_COMPATIBILITY_VERIFICATION(){
  var batch=EligibilityBatchReadModel_get({});
  var rows=batch&&batch.rows?batch.rows:[];
  var traceOld=0,traceNew=0,nonTraceLegacy=0,refresh=0;
  rows.forEach(function(r){
    var isTrace=false;(r.requiredScopes||[]).forEach(function(s){if(EBTBC_hasTracecert_([s]))isTrace=true;});
    if(r.requiresCanonicalRefresh===true)refresh++;
    if(isTrace&&r.computedBuild==='EligibilityService_d16_FORCE_REFRESH_20260702')traceOld++;
    if(isTrace&&r.computedBuild==='EligibilityService_d17_TRACECERT_HEADER_COMPAT_20260912')traceNew++;
    if(!isTrace&&r.computedBuild==='EligibilityService_d16_FORCE_REFRESH_20260702'&&r.cacheValidity&&r.cacheValidity.buildEquivalent===true)nonTraceLegacy++;
  });
  var out={ok:traceOld===0,build:WORKSPACE_ELIGIBILITY_BUILD_COMPAT_VERIFY_BUILD,rows:rows.length,tracecertOldBuildRows:traceOld,tracecertCompatBuildRows:traceNew,nonTraceLegacyAccepted:nonTraceLegacy,refreshRequired:refresh,meta:batch.meta||{},writes:false};
  console.log(JSON.stringify(out,null,2));return out;
}
