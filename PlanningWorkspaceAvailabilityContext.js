/***********************************************************************
 * PlanningWorkspaceAvailabilityContext.js
 * BUILD: 2026-09-12_ROADMAP_2_4_WORKSPACE_AVAILABILITY_CONTEXT_R1_CACHE_ONLY
 *
 * Purpose: enrich Availability slot display with planner-facing context
 * (company + scopes) WITHOUT extra Spreadsheet reads.
 *
 * Reads only AuditPlanningRowIndexCache execution/script row caches.
 * Cache miss => no enrichment; canonical Availability remains unchanged.
 ***********************************************************************/
var PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD='2026-09-12_ROADMAP_2_4_WORKSPACE_AVAILABILITY_CONTEXT_R1_CACHE_ONLY';
function PWAC_clean_(v){return String(v==null?'':v).trim();}
function PWAC_norm_(v){return PWAC_clean_(v).toLowerCase();}
function PWAC_findCol_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++)m[PWAC_norm_(hdr[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=PWAC_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function PWAC_scopeNames_(hdr,row){
  try{
    if(typeof v5_extractScopesForAuditPlanningRow_==='function'){
      var r=v5_extractScopesForAuditPlanningRow_(hdr||[],row||[])||{},a=Array.isArray(r.scopes)?r.scopes:[];
      return a.map(function(s){return PWAC_clean_(s&&(s.name||s.code||s.slot));}).filter(function(x){return!!x;});
    }
  }catch(e){}
  return[];
}
function PWAC_cachedRow_(auditId){
  var id=PWAC_clean_(auditId);if(!id)return null;
  try{if(typeof __mp_apExecRowGet_==='function'){var e=__mp_apExecRowGet_(id);if(e&&e.row&&e.hdr)return{tier:'EXEC',hdr:e.hdr,row:e.row};}}catch(e0){}
  try{if(typeof __mp_apRowCacheGet_==='function'){var c=__mp_apRowCacheGet_(id);if(c&&c.row&&c.hdr)return{tier:'SCRIPT_ROW_CACHE',hdr:c.hdr,row:c.row};}}catch(e1){}
  return null;
}
function PlanningWorkspaceAvailabilityContext_get(availabilityRows){
  var ids={},ordered=[];(availabilityRows||[]).forEach(function(r){(r&&r.slots||[]).forEach(function(s){var id=PWAC_clean_(s&&s.auditId);if(id&&!ids[id]){ids[id]=1;ordered.push(id);}});});
  var byAuditId={},hits=0,misses=0,execHits=0,scriptHits=0;
  for(var i=0;i<ordered.length;i++){
    var id=ordered[i],p=PWAC_cachedRow_(id);if(!p){misses++;continue;}hits++;if(p.tier==='EXEC')execHits++;else scriptHits++;
    var hdr=p.hdr||[],row=p.row||[],cCompany=PWAC_findCol_(hdr,['Company']),company=cCompany>=0?PWAC_clean_(row[cCompany]):'';
    byAuditId[id]={company:company,scopes:PWAC_scopeNames_(hdr,row)};
  }
  return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:ordered.length,hits:hits,misses:misses,execHits:execHits,scriptRowCacheHits:scriptHits,directSheetReads:0,cacheOnly:true,writes:false,newSsot:false}};
}
