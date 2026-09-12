/***********************************************************************
 * zz_PlanningWorkspaceFastBootstrap_20260912.js
 * BUILD: 2026-09-12_WORKSPACE_FAST_BOOTSTRAP_R1_SHARED_AUDIT_PLANNING_READ
 *
 * Hot-path optimization for Planning Workspace 2.0 bootstrap.
 * Reuses the Audit planning values already read by Planning Demand when
 * enriching Availability slot context. Request-local only; no cache/SSoT.
 * Falls back to canonical existing context reader outside bootstrap.
 ***********************************************************************/
var PLANNING_WORKSPACE_FAST_BOOTSTRAP_BUILD='2026-09-12_WORKSPACE_FAST_BOOTSTRAP_R1_SHARED_AUDIT_PLANNING_READ';
var PWFBR_ctx_=null;

function PWFBR_clean_(v){return String(v==null?'':v).trim();}
function PWFBR_norm_(v){return PWFBR_clean_(v).toLowerCase();}
function PWFBR_findCol_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++)m[PWFBR_norm_(hdr[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=PWFBR_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function PWFBR_requestedIds_(availabilityRows){var seen={},out=[];(availabilityRows||[]).forEach(function(r){(r&&r.slots||[]).forEach(function(s){var id=PWFBR_clean_(s&&s.auditId);if(id&&!seen[id]){seen[id]=1;out.push(id);}});});return out;}
function PWFBR_scopeNames_(hdr,row){try{if(typeof v5_extractScopesForAuditPlanningRow_==='function'){var x=v5_extractScopesForAuditPlanningRow_(hdr||[],row||[])||{},a=Array.isArray(x.scopes)?x.scopes:[];return a.map(function(s){return PWFBR_clean_(s&&(s.name||s.code||s.slot));}).filter(function(v){return!!v;});}}catch(e){}return[];}
function PWFBR_contextFromValues_(availabilityRows,values){var ids=PWFBR_requestedIds_(availabilityRows),wanted={},byAuditId={};for(var i=0;i<ids.length;i++)wanted[ids[i]]=1;if(!ids.length)return{success:true,build:PLANNING_WORKSPACE_FAST_BOOTSTRAP_BUILD,byAuditId:byAuditId,meta:{requested:0,hits:0,misses:0,directSheetReads:0,batchSheetReads:0,reusedBootstrapRead:true,writes:false,newSsot:false}};var hdr=values&&values.length?values[0]:[],cId=PWFBR_findCol_(hdr,['Audit ID','Audit_ID','AuditId']),cCompany=PWFBR_findCol_(hdr,['Company']);if(cId<0)return null;var hits=0;for(var r=1;r<values.length;r++){var row=values[r]||[],id=PWFBR_clean_(row[cId]);if(!wanted[id]||byAuditId[id])continue;byAuditId[id]={company:cCompany>=0?PWFBR_clean_(row[cCompany]):'',scopes:PWFBR_scopeNames_(hdr,row)};hits++;}return{success:true,build:PLANNING_WORKSPACE_FAST_BOOTSTRAP_BUILD,byAuditId:byAuditId,meta:{requested:ids.length,hits:hits,misses:Math.max(0,ids.length-hits),directSheetReads:0,batchSheetReads:0,reusedBootstrapRead:true,rowsRead:Math.max(0,values.length-1),colsRead:hdr.length,perAuditReads:0,writes:false,newSsot:false,canonicalOwner:'Audit planning'}};}

if(typeof PlanningWorkspaceAvailabilityContext_get==='function'){
  var PWFBR_originalAvailabilityContext_=PlanningWorkspaceAvailabilityContext_get;
  PlanningWorkspaceAvailabilityContext_get=function(availabilityRows){
    if(PWFBR_ctx_&&Array.isArray(PWFBR_ctx_.auditPlanningValues)){
      var projected=PWFBR_contextFromValues_(availabilityRows,PWFBR_ctx_.auditPlanningValues);
      if(projected)return projected;
    }
    return PWFBR_originalAvailabilityContext_(availabilityRows);
  };
}

if(typeof PlanningDemandService_get==='function'&&typeof PlanningWorkspaceRpc_bootstrap==='function'){
  var PWFBR_originalPlanningDemand_=PlanningDemandService_get;
  var PWFBR_originalBootstrap_=PlanningWorkspaceRpc_bootstrap;
  PlanningDemandService_get=function(input){
    if(PWFBR_ctx_&&PWFBR_ctx_.captureAuditPlanning===true){
      var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Audit planning');
      if(sh){
        var values=sh.getDataRange().getValues();
        PWFBR_ctx_.auditPlanningValues=values;
        var oldGetDataRange=sh.getDataRange;
        try{
          sh.getDataRange=function(){return{getValues:function(){return values;}};};
          return PWFBR_originalPlanningDemand_(input||{});
        }catch(e){
          return PWFBR_originalPlanningDemand_(input||{});
        }finally{
          try{sh.getDataRange=oldGetDataRange;}catch(ignore){}
        }
      }
    }
    return PWFBR_originalPlanningDemand_(input||{});
  };
  PlanningWorkspaceRpc_bootstrap=function(input){
    PWFBR_ctx_={captureAuditPlanning:true,auditPlanningValues:null};
    try{return PWFBR_originalBootstrap_(input||{});}finally{PWFBR_ctx_=null;}
  };
}
