/***********************************************************************
 * WorkspaceTracecertEligibilityRefresh.js
 * BUILD: 2026-09-12_WORKSPACE_TRACECERT_REFRESH_R1
 *
 * One-time DEV repair helper after the legacy Auditors header compatibility
 * fix. Refreshes only derived Eligibility_Cache rows for audits that require
 * Florimark Tracecert. No planning/status/availability/lifecycle writes.
 ***********************************************************************/
var WORKSPACE_TRACECERT_REFRESH_BUILD='2026-09-12_WORKSPACE_TRACECERT_REFRESH_R1';
function WTER_clean_(v){return String(v==null?'':v).trim();}
function WTER_tracecertAuditIds_(){
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Audit planning');
  if(!sh)throw new Error("Missing sheet 'Audit planning'");
  var values=sh.getDataRange().getValues();
  if(values.length<2)return[];
  var hdr=values[0]||[],cId=-1;
  for(var c=0;c<hdr.length;c++){
    var h=WTER_clean_(hdr[c]).toLowerCase();
    if(h==='audit id'||h==='audit_id'||h==='auditid'){cId=c;break;}
  }
  if(cId<0)throw new Error('Missing Audit ID column');
  var out=[],seen={};
  for(var r=1;r<values.length;r++){
    var row=values[r]||[],id=WTER_clean_(row[cId]);
    if(!id)continue;
    var scopes=[];
    try{
      var res=v5_extractScopesForAuditPlanningRow_(hdr,row)||{};
      scopes=Array.isArray(res.scopes)?res.scopes:[];
    }catch(e){}
    var hit=false;
    for(var i=0;i<scopes.length;i++){
      var raw=WTER_clean_(scopes[i]&&(scopes[i].name||scopes[i].code||scopes[i].slot));
      var canon='';
      try{canon=ConfigScopes_CanonicalName(raw);}catch(e2){canon=raw;}
      if(canon==='Florimark Tracecert'){hit=true;break;}
    }
    if(hit&&!seen[id]){seen[id]=1;out.push(id);}
  }
  return out;
}
function RUN_WORKSPACE_TRACECERT_ELIGIBILITY_REFRESH(){
  if(typeof EligibilityTargetedRefreshService_refresh!=='function')throw new Error('EligibilityTargetedRefreshService_refresh unavailable');
  var ids=WTER_tracecertAuditIds_();
  var result=EligibilityTargetedRefreshService_refresh({auditIds:ids,force:true,maxRefresh:20,dryRun:false});
  var out={
    ok:!!(result&&result.success===true),
    build:WORKSPACE_TRACECERT_REFRESH_BUILD,
    requested:ids.length,
    refreshed:result&&result.refreshed||0,
    failed:result&&result.failed||0,
    orphaned:result&&result.orphaned||0,
    items:result&&result.items||[],
    verification:result&&result.verification||null,
    meta:{derivedCacheOnly:true,planningWrites:false,statusWrites:false,availabilityWrites:false,lifecycleWrites:false}
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
