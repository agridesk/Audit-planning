/**
 * FILE: zz_AMS01_ScopeCanonicalMemoPerfOverride.js
 * BUILD: AMS01_SCOPE_CANON_MEMO_ZZ_20260909_R1
 *
 * Execution-local memoization for the canonical scope-name bridge used by
 * Toolkit qualification/rotation. No persisted cache and no policy change.
 * Repeated qualification checks over the same Auditors header no longer
 * rebuild/resolve the same scope aliases for every auditor row.
 */
var AMS01_SCOPE_CANON_MEMO_ZZ_BUILD='AMS01_SCOPE_CANON_MEMO_ZZ_20260909_R1';
var AMS01_SCOPE_CANON_MEMO_ZZ_CACHE={};
var AMS01_SCOPE_ALIAS_META_ZZ_CACHE=null;

function _mp_scopeCanonicalForRotation_(ss,rawScope){
  var raw=String(rawScope||'').trim();
  if(!raw) return '';

  var ssKey='';
  try{ ssKey=String(ss&&ss.getId?ss.getId():''); }catch(eId){}
  var cacheKey=ssKey+'|'+raw;
  if(Object.prototype.hasOwnProperty.call(AMS01_SCOPE_CANON_MEMO_ZZ_CACHE,cacheKey)){
    return AMS01_SCOPE_CANON_MEMO_ZZ_CACHE[cacheKey];
  }

  var resolved='';
  try{
    if(typeof m5t_scopeCanonicalName_==='function'){
      resolved=m5t_scopeCanonicalName_(ss,raw)||raw;
      AMS01_SCOPE_CANON_MEMO_ZZ_CACHE[cacheKey]=resolved;
      return resolved;
    }
  }catch(eBridge){}

  try{
    if(!AMS01_SCOPE_ALIAS_META_ZZ_CACHE){
      AMS01_SCOPE_ALIAS_META_ZZ_CACHE=_mp_scopeAliasMetaForRotation_(ss)||{byAnyKey:{}};
    }
    var key=raw.toLowerCase().replace(/\s+/g,' ').replace(/[^\w\s\-]/g,'').trim();
    resolved=(AMS01_SCOPE_ALIAS_META_ZZ_CACHE.byAnyKey&&AMS01_SCOPE_ALIAS_META_ZZ_CACHE.byAnyKey[key])
      ? AMS01_SCOPE_ALIAS_META_ZZ_CACHE.byAnyKey[key]
      : raw;
  }catch(eFallback){
    resolved=raw;
  }

  AMS01_SCOPE_CANON_MEMO_ZZ_CACHE[cacheKey]=resolved;
  return resolved;
}

function AMS01_ScopeCanonicalMemoPerfStatus(){
  return {
    success:true,
    active:true,
    build:AMS01_SCOPE_CANON_MEMO_ZZ_BUILD,
    entries:Object.keys(AMS01_SCOPE_CANON_MEMO_ZZ_CACHE||{}).length
  };
}
