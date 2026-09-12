/***********************************************************************
 * PlanningWorkspaceAvailabilityContext.js
 * BUILD: 2026-09-12_ROADMAP_2_4_WORKSPACE_AVAILABILITY_CONTEXT_R2_BATCH_READ
 *
 * Purpose: enrich Availability slot display with planner-facing context
 * (company + scopes) with ONE bounded Audit planning read for all audit refs.
 * No per-audit reads. Read-only. Audit planning remains canonical owner.
 ***********************************************************************/
var PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD='2026-09-12_ROADMAP_2_4_WORKSPACE_AVAILABILITY_CONTEXT_R2_BATCH_READ';
function PWAC_clean_(v){return String(v==null?'':v).trim();}
function PWAC_norm_(v){return PWAC_clean_(v).toLowerCase();}
function PWAC_findCol_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++)m[PWAC_norm_(hdr[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=PWAC_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function PWAC_scopeNames_(hdr,row){try{if(typeof v5_extractScopesForAuditPlanningRow_==='function'){var r=v5_extractScopesForAuditPlanningRow_(hdr||[],row||[])||{},a=Array.isArray(r.scopes)?r.scopes:[];return a.map(function(s){return PWAC_clean_(s&&(s.name||s.code||s.slot));}).filter(function(x){return!!x;});}}catch(e){}return[];}
function PWAC_requestedIds_(availabilityRows){var seen={},out=[];(availabilityRows||[]).forEach(function(r){(r&&r.slots||[]).forEach(function(s){var id=PWAC_clean_(s&&s.auditId);if(id&&!seen[id]){seen[id]=1;out.push(id);}});});return out;}
function PlanningWorkspaceAvailabilityContext_get(availabilityRows){
  var ordered=PWAC_requestedIds_(availabilityRows),wanted={},byAuditId={};for(var i=0;i<ordered.length;i++)wanted[ordered[i]]=true;
  if(!ordered.length)return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:0,hits:0,misses:0,directSheetReads:0,batchSheetReads:0,writes:false,newSsot:false}};
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Audit planning');if(!sh)throw new Error('PlanningWorkspaceAvailabilityContext: Audit planning sheet missing');
  var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn(),values=lastRow>0&&lastCol>0?sh.getRange(1,1,lastRow,lastCol).getValues():[];
  var hdr=values.length?values[0]:[],cId=PWAC_findCol_(hdr,['Audit ID','Audit_ID','AuditId']),cCompany=PWAC_findCol_(hdr,['Company']);if(cId<0)throw new Error('PlanningWorkspaceAvailabilityContext: Audit ID column missing');
  var hits=0;for(var r=1;r<values.length;r++){var row=values[r]||[],id=PWAC_clean_(row[cId]);if(!wanted[id]||byAuditId[id])continue;byAuditId[id]={company:cCompany>=0?PWAC_clean_(row[cCompany]):'',scopes:PWAC_scopeNames_(hdr,row)};hits++;}
  return{success:true,build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_BUILD,byAuditId:byAuditId,meta:{requested:ordered.length,hits:hits,misses:Math.max(0,ordered.length-hits),directSheetReads:1,batchSheetReads:1,rowsRead:Math.max(0,values.length-1),colsRead:hdr.length,perAuditReads:0,writes:false,newSsot:false,canonicalOwner:'Audit planning'}};
}
