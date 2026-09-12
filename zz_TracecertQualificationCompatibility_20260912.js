/***********************************************************************
 * zz_TracecertQualificationCompatibility_20260912.js
 * BUILD: 2026-09-12_TRACECERT_QUALIFICATION_COMPAT_R1
 *
 * Compatibility for the legacy Auditors header typo "Florimark Tracecet".
 * Config_Scopes remains the canonical scope owner. This only canonicalizes
 * the legacy header spelling to the existing Florimark Tracecert scope.
 *
 * Cache versions are bumped because qualification semantics changed; old
 * derived eligibility rows must be classified for refresh, never trusted.
 ***********************************************************************/
var TRACECERT_QUALIFICATION_COMPAT_BUILD='2026-09-12_TRACECERT_QUALIFICATION_COMPAT_R1';

// EligibilityBatchReadModel compares sheet rows against ELIG_BUILD.
ELIG_BUILD='EligibilityService_d17_TRACECERT_HEADER_COMPAT_20260912';

// TEC keys include this version. Bump prevents reuse of an empty result that
// was computed while the legacy Tracecet header was not canonicalized.
TOOLKIT_ELIG_CACHE_VERSION='TEC_V4_TRACECERT_HEADER_COMPAT_20260912';

function ConfigScopes_CanonicalName(rawScope){
  var raw=String(rawScope==null?'':rawScope).trim();
  if(!raw)return'';
  var norm=(typeof ConfigScopes_normKey_==='function')
    ? ConfigScopes_normKey_(raw)
    : raw.toLowerCase().replace(/[^a-z0-9]+/g,'');

  // Legacy production header spelling in Auditors.
  if(norm==='florimarktracecet')return'Florimark Tracecert';

  var meta=null;
  try{meta=ConfigScopes_GetAliasMeta(false);}catch(e){}
  return meta&&meta.byAnyKey&&meta.byAnyKey[norm]?meta.byAnyKey[norm]:raw;
}

function TRACECERT_QUALIFICATION_COMPAT_contract(){return{
  build:TRACECERT_QUALIFICATION_COMPAT_BUILD,
  canonicalOwner:'Config_Scopes',
  legacyHeader:'Florimark Tracecet',
  canonicalScope:'Florimark Tracecert',
  eligibilityBuild:ELIG_BUILD,
  tecVersion:TOOLKIT_ELIG_CACHE_VERSION,
  writes:false,
  newSsot:false
};}
