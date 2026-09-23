/***********************************************************************
 * FILE: PlanningDemandScopeFastPath.js
 * BUILD: 2026-09-23_AMS01_PLANNING_DEMAND_SCOPE_FASTPATH_R3_CACHED_CANONICAL
 *
 * PURPOSE
 * - Execution-local scope projection for PlanningDemandService.
 * - Build the Audit planning scope-column plan once from canonical
 *   Config_Scopes evidence.
 * - Prefer the canonical ConfigScopesService cache before a direct sheet read.
 * - Preserve Config_Scopes as the only scope metadata owner.
 * - No new SSoT and no writes.
 ***********************************************************************/
var AMS01_PDS_SCOPE_FASTPATH_BUILD='2026-09-23_AMS01_PLANNING_DEMAND_SCOPE_FASTPATH_R3_CACHED_CANONICAL';
var AMS01_PDS_SCOPE_FASTPATH_CACHE={};
function AMS01_PDS_SF_clean_(v){return String(v==null?'':v).trim();}
function AMS01_PDS_SF_norm_(v){return AMS01_PDS_SF_clean_(v).toLowerCase().replace(/[^a-z0-9]+/g,'');}
function AMS01_PDS_isMarkedX_(v){var s=AMS01_PDS_SF_clean_(v).toUpperCase();return s==='X'||s==='YES'||s==='TRUE'||s==='1';}
function AMS01_PDS_SF_catalog_(){
  if(typeof CONFIGSCOPES_EXEC_CACHE!=='undefined'&&CONFIGSCOPES_EXEC_CACHE&&CONFIGSCOPES_EXEC_CACHE.catalog)return CONFIGSCOPES_EXEC_CACHE.catalog;
  if(typeof ConfigScopes_GetCatalog==='function')return ConfigScopes_GetCatalog(false)||{rows:[]};
  if(typeof ConfigScopes_loadCatalogFromSheet_==='function'){
    var c=ConfigScopes_loadCatalogFromSheet_()||{rows:[]};
    if(typeof CONFIGSCOPES_EXEC_CACHE!=='undefined'&&CONFIGSCOPES_EXEC_CACHE)CONFIGSCOPES_EXEC_CACHE.catalog=c;
    return c;
  }
  return{rows:[]};
}
function AMS01_PDS_scopePlan_(headers){headers=headers||[];var key=headers.map(function(x){return AMS01_PDS_SF_clean_(x);}).join('\u001f');if(AMS01_PDS_SCOPE_FASTPATH_CACHE[key])return AMS01_PDS_SCOPE_FASTPATH_CACHE[key];var catalog=AMS01_PDS_SF_catalog_(),rows=catalog&&Array.isArray(catalog.rows)?catalog.rows:[],byKey={};for(var i=0;i<rows.length;i++){var r=rows[i]||{};if(typeof ConfigScopes_yes_==='function'&&(!ConfigScopes_yes_(r.active,true)||ConfigScopes_yes_(r.archived,false)))continue;var name=AMS01_PDS_SF_clean_(r.displayName||r.name||r.scopeCode||r.slotKey);if(!name)continue;[r.displayName,r.name,r.scopeCode,r.slotKey].forEach(function(v){var n=AMS01_PDS_SF_norm_(v);if(n)byKey[n]=name;});}var columns=[];for(var h=0;h<headers.length;h++){var n=AMS01_PDS_SF_norm_(headers[h]),name=byKey[n];if(name)columns.push({col:h,name:name});}var plan={source:'Config_Scopes canonical cached execution evidence',configuredScopes:rows.length,matchedColumns:columns.length,columns:columns,build:AMS01_PDS_SCOPE_FASTPATH_BUILD};AMS01_PDS_SCOPE_FASTPATH_CACHE[key]=plan;return plan;}
function AMS01_PDS_scopeNamesFast_(headers,row){var plan=AMS01_PDS_scopePlan_(headers),out=[];for(var i=0;i<plan.columns.length;i++){var c=plan.columns[i];if(AMS01_PDS_isMarkedX_(row&&row[c.col]))out.push(c.name);}return out;}
