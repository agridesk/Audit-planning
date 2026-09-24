/***********************************************************************
 * PlanningWorkspaceAvailabilityContext.js
 * BUILD: 2026-09-23_PLANNING_2_0_WORKSPACE_AVAILABILITY_CONTEXT_R6_SHARED_DEMAND_CONTEXT
 *
 * Enrich Availability slots with planner-facing canonical context:
 * company + scopes + audit status. One bounded Audit planning read for all
 * audit refs, reusing execution cache when available. Read-only.
 *
 * Planning 2.0 3S rule:
 * - reuse the same canonical Config_Scopes-backed execution-local scope
 *   projection as PlanningDemandService;
 * - never invoke the legacy per-row scope extractor on the Workspace hot path
 *   when that fast path is available;
 * - no new SSoT, no writes, no per-audit reads.
 ***********************************************************************/
var PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD='2026-09-24_PLANNING_2_0_WORKSPACE_AVAILABILITY_CONTEXT_R7_INDEXED_MISS_RECOVERY';
function PWAC_clean_(v){return String(v==null?'':v).trim();}
function PWAC_norm_(v){return PWAC_clean_(v).toLowerCase();}
function PWAC_findCol_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++)m[PWAC_norm_(hdr[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=PWAC_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function PWAC_scopeNames_(hdr,row){
  if(typeof AMS01_PDS_scopeNamesFast_==='function')return AMS01_PDS_scopeNamesFast_(hdr||[],row||[]);
  try{if(typeof v5_extractScopesForAuditPlanningRow_==='function'){var r=v5_extractScopesForAuditPlanningRow_(hdr||[],row||[])||{},a=Array.isArray(r.scopes)?r.scopes:[];return a.map(function(s){return PWAC_clean_(s&&(s.name||s.code||s.slot));}).filter(function(x){return!!x;});}}catch(e){}
  return[];
}
function PWAC_requestedIds_(availabilityRows){var seen={},out=[];(availabilityRows||[]).forEach(function(r){(r&&r.slots||[]).forEach(function(s){var id=PWAC_clean_(s&&s.auditId);if(id&&!seen[id]){seen[id]=1;out.push(id);}});});return out;}
function PlanningWorkspaceAvailabilityContext_get(availabilityRows,seedByAuditId){
  var ordered=PWAC_requestedIds_(availabilityRows),wanted={},byAuditId={},seed=seedByAuditId||{},seedHits=0;for(var i=0;i<ordered.length;i++){wanted[ordered[i]]=true;if(seed[ordered[i]]){byAuditId[ordered[i]]=seed[ordered[i]];seedHits++;}}
  if(!ordered.length)return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:0,hits:0,misses:0,seedHits:0,directSheetReads:0,batchSheetReads:0,executionCacheUsed:false,writes:false,newSsot:false,scopePath:typeof AMS01_PDS_scopeNamesFast_==='function'?'CANONICAL_EXEC_FASTPATH':'LEGACY'}};
  if(seedHits===ordered.length)return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:ordered.length,hits:seedHits,misses:0,seedHits:seedHits,directSheetReads:0,batchSheetReads:0,rowsRead:0,colsRead:0,executionCacheUsed:false,sharedDemandContextUsed:true,perAuditReads:0,writes:false,newSsot:false,canonicalOwner:'Audit planning',canonicalStatusProjected:true,scopePath:'SHARED_DEMAND_CONTEXT',scopeExtractCalls:0,scopeExtractMs:0}};
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Audit planning');if(!sh)throw new Error('PlanningWorkspaceAvailabilityContext: Audit planning sheet missing');
  var lastCol=sh.getLastColumn(),hdr=lastCol>0?sh.getRange(1,1,1,lastCol).getValues()[0]:[],cId=PWAC_findCol_(hdr,['Audit ID','Audit_ID','AuditId']),cCompany=PWAC_findCol_(hdr,['Company']),cStatus=PWAC_findCol_(hdr,['Status']);if(cId<0)throw new Error('PlanningWorkspaceAvailabilityContext: Audit ID column missing');
  var hits=0,scopeExtractMs=0,scopeExtractCalls=0,indexedReads=0,rowsRead=0;
  if(typeof __mp_getAuditPlanningRow_==='function'){
    for(var x=0;x<ordered.length;x++){var auditId=ordered[x];if(byAuditId[auditId])continue;var hit=__mp_getAuditPlanningRow_(ss,auditId);indexedReads++;if(!hit||!hit.rowValues)continue;var row=hit.rowValues,s0=Date.now(),scopes=PWAC_scopeNames_(hdr,row);scopeExtractMs+=Date.now()-s0;scopeExtractCalls++;byAuditId[auditId]={company:cCompany>=0?PWAC_clean_(row[cCompany]):'',scopes:scopes,status:cStatus>=0?PWAC_clean_(row[cStatus]):''};hits++;rowsRead++;}
    return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:ordered.length,hits:hits+seedHits,misses:Math.max(0,ordered.length-hits-seedHits),seedHits:seedHits,directSheetReads:indexedReads,batchSheetReads:0,rowsRead:rowsRead,colsRead:hdr.length,executionCacheUsed:false,indexedMissRecovery:true,perAuditReads:indexedReads,writes:false,newSsot:false,canonicalOwner:'Audit planning',canonicalStatusProjected:true,scopePath:typeof AMS01_PDS_scopeNamesFast_==='function'?'CANONICAL_EXEC_FASTPATH':'LEGACY',scopeExtractCalls:scopeExtractCalls,scopeExtractMs:scopeExtractMs}};
  }
  var pack=(typeof __mp_getSheetDataCached_==='function')?__mp_getSheetDataCached_(ss,'Audit planning'):null,values=pack&&Array.isArray(pack.data)?pack.data:null;if(!values){var lastRow=sh.getLastRow();values=lastRow>0&&lastCol>0?sh.getRange(1,1,lastRow,lastCol).getValues():[];}
  for(var r=1;r<values.length;r++){var row2=values[r]||[],id=PWAC_clean_(row2[cId]);if(!wanted[id]||byAuditId[id])continue;var s1=Date.now(),scopes2=PWAC_scopeNames_(hdr,row2);scopeExtractMs+=Date.now()-s1;scopeExtractCalls++;byAuditId[id]={company:cCompany>=0?PWAC_clean_(row2[cCompany]):'',scopes:scopes2,status:cStatus>=0?PWAC_clean_(row2[cStatus]):''};hits++;}
  return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:ordered.length,hits:hits+seedHits,misses:Math.max(0,ordered.length-hits-seedHits),seedHits:seedHits,directSheetReads:pack&&Array.isArray(pack.data)?0:1,batchSheetReads:pack&&Array.isArray(pack.data)?0:1,rowsRead:Math.max(0,values.length-1),colsRead:hdr.length,executionCacheUsed:!!(pack&&Array.isArray(pack.data)),indexedMissRecovery:false,perAuditReads:0,writes:false,newSsot:false,canonicalOwner:'Audit planning',canonicalStatusProjected:true,scopePath:typeof AMS01_PDS_scopeNamesFast_==='function'?'CANONICAL_EXEC_FASTPATH':'LEGACY',scopeExtractCalls:scopeExtractCalls,scopeExtractMs:scopeExtractMs}};
}
