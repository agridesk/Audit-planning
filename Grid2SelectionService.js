/***********************************************************************
 * FILE: Grid2SelectionService.js
 * BUILD: 2026-10-03_GRID2_SHARED_SELECTION_R1
 * PURPOSE:
 * - Read-only backend validation for Grid 2.0 selected Audit/Visit IDs.
 * - Selection itself remains browser-local and never writes canonical state.
 * - Manager: verifies selected IDs still exist in current Audit planning.
 * - Auditor Batch/Concept: additionally enforces current self-planning eligibility.
 ***********************************************************************/
var GRID2_SELECTION_SERVICE_BUILD='2026-10-03_GRID2_SHARED_SELECTION_R1';

function Grid2Selection_clean_(v){return String(v==null?'':v).trim();}
function Grid2Selection_normEmail_(v){return Grid2Selection_clean_(v).toLowerCase();}
function Grid2Selection_yes_(v){var s=Grid2Selection_clean_(v).toUpperCase();return s==='YES'||s==='TRUE'||s==='1'||s==='X'||s==='Y'||s==='JA';}
function Grid2Selection_status_(v){return Grid2Selection_clean_(v).toUpperCase().replace(/[\s-]+/g,'_');}
function Grid2Selection_ids_(ids){
  var out=[],seen={};
  (Array.isArray(ids)?ids:[]).forEach(function(v){var id=Grid2Selection_clean_(v);if(id&&!seen[id]){seen[id]=1;out.push(id);}});
  if(out.length>500)throw new Error('GRID2_SELECTION_TOO_LARGE');
  return out;
}
function Grid2Selection_header_(headers,names){
  var map={};(headers||[]).forEach(function(v,i){map[Grid2Selection_clean_(v).toLowerCase()]=i;});
  for(var n=0;n<names.length;n++){var k=Grid2Selection_clean_(names[n]).toLowerCase();if(map[k]!==undefined)return map[k];}
  return-1;
}
function Grid2Selection_auditorMaps_(ss){
  var sh=ss.getSheetByName('Auditors'),byName={},byEmail={};
  if(!sh)return{byName:byName,byEmail:byEmail};
  var v=sh.getDataRange().getValues();if(v.length<2)return{byName:byName,byEmail:byEmail};
  var h=v[0],ie=Grid2Selection_header_(h,['Email','E-mail','E-mail address','Mail']),inm=Grid2Selection_header_(h,['Name','Auditor','Auditor name','Display name']);
  for(var r=1;r<v.length;r++){
    var email=ie>=0?Grid2Selection_normEmail_(v[r][ie]):'',name=inm>=0?Grid2Selection_clean_(v[r][inm]).toLowerCase():'';
    if(email)byEmail[email]=email;if(name&&email)byName[name]=email;
  }
  return{byName:byName,byEmail:byEmail};
}
function Grid2Selection_resolveAuditor_(raw,maps){
  var s=Grid2Selection_clean_(raw),low=s.toLowerCase();if(!s)return'';
  if(low.indexOf('@')>0)return low;
  return(maps&&maps.byName&&maps.byName[low])||'';
}
function Grid2Selection_validate(input){
  input=input||{};
  var ids=Grid2Selection_ids_(input.auditIds),role=Grid2Selection_clean_(input.actorRole||input.role||'Manager').toUpperCase(),actor=Grid2Selection_normEmail_(input.actorEmail||input.auditorEmail),action=Grid2Selection_clean_(input.action||input.mode||'selection').toLowerCase();
  if(!ids.length)return{ok:false,build:GRID2_SELECTION_SERVICE_BUILD,error:'GRID2_SELECTION_EMPTY',validAuditIds:[],rejected:[],writesPerformed:false};
  if(role!=='MANAGER'&&role!=='AUDITOR')return{ok:false,build:GRID2_SELECTION_SERVICE_BUILD,error:'GRID2_SELECTION_ROLE_FORBIDDEN',validAuditIds:[],rejected:[],writesPerformed:false};
  if(role==='AUDITOR'&&!actor)return{ok:false,build:GRID2_SELECTION_SERVICE_BUILD,error:'GRID2_SELECTION_AUDITOR_REQUIRED',validAuditIds:[],rejected:[],writesPerformed:false};

  var ss=(typeof auditorV5_getSs_==='function')?auditorV5_getSs_():SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('GRID2_SELECTION_SSOT_UNAVAILABLE');
  var sh=ss.getSheetByName('Audit planning');if(!sh)throw new Error('GRID2_SELECTION_AUDIT_PLANNING_MISSING');
  var values=sh.getDataRange().getValues();if(values.length<2)return{ok:false,build:GRID2_SELECTION_SERVICE_BUILD,error:'GRID2_SELECTION_AUDIT_PLANNING_EMPTY',validAuditIds:[],rejected:ids.map(function(id){return{auditId:id,reason:'NOT_FOUND'};}),writesPerformed:false};
  var h=values[0],iId=Grid2Selection_header_(h,['Audit ID','Audit_ID','AuditId','Audit Id']),iStatus=Grid2Selection_header_(h,['Status']),iSelf=Grid2Selection_header_(h,['Allow self planning','Allow Self Planning']),iPre=Grid2Selection_header_(h,['Preassigned Auditor','Preassigned auditor']),iAssigned=Grid2Selection_header_(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']);
  if(iId<0||iStatus<0)throw new Error('GRID2_SELECTION_SCHEMA_INVALID');
  var wanted={};ids.forEach(function(id){wanted[id]=true;});
  var byId={};for(var r=1;r<values.length;r++){var id=Grid2Selection_clean_(values[r][iId]);if(id&&wanted[id])byId[id]=values[r];}
  var maps=role==='AUDITOR'?Grid2Selection_auditorMaps_(ss):null,valid=[],rejected=[];
  ids.forEach(function(id){
    var row=byId[id];if(!row){rejected.push({auditId:id,reason:'NOT_FOUND'});return;}
    var status=Grid2Selection_status_(row[iStatus]);
    if(role==='AUDITOR'&&(action==='batch'||action==='concept'||action==='concept_planning'||action==='batch_plan')){
      var allow=iSelf>=0&&Grid2Selection_yes_(row[iSelf]);
      var pre=iPre>=0?Grid2Selection_resolveAuditor_(row[iPre],maps):'';
      var assigned=iAssigned>=0?Grid2Selection_resolveAuditor_(row[iAssigned],maps):'';
      if(status!=='PENDING_PLANNING'){rejected.push({auditId:id,reason:'STATUS_NOT_PENDING_PLANNING',status:status});return;}
      if(!allow){rejected.push({auditId:id,reason:'SELF_PLANNING_NOT_ALLOWED'});return;}
      if(!pre||pre!==actor){rejected.push({auditId:id,reason:'NOT_PREASSIGNED_TO_AUDITOR'});return;}
      if(assigned){rejected.push({auditId:id,reason:'ALREADY_ASSIGNED'});return;}
    }
    valid.push(id);
  });
  return{ok:rejected.length===0,build:GRID2_SELECTION_SERVICE_BUILD,role:role,actorEmail:actor,action:action,requestedAuditIds:ids,validAuditIds:valid,rejected:rejected,writesPerformed:false};
}
function Grid2Selection_contract(){
  return{build:GRID2_SELECTION_SERVICE_BUILD,temporaryUiState:true,writesPerformed:false,maxSelection:500,managerRevalidatesExistence:true,auditorBatchConceptRequiresSelfPlanning:true,auditorBatchConceptRequiresPreassignment:true,selectionNeverCommitsPlanning:true};
}
