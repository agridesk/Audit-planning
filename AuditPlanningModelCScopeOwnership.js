/** Model C Phase 2B: scope-ownership transition contract. Read-only until routed. */
var MODEL_C_SCOPE_OWNER_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_SCOPE_OWNER_R1';

function RUN_MODEL_C_PHASE2B_SCOPE_OWNER_PREFLIGHT() {
  var ss = SpreadsheetApp.getActive();
  var target = ModelCRecon_readTargets_(ss);
  var cs = (target.rows && target.rows[MODEL_C_SHEETS.COMPANY_SCOPES]) || [];
  var ob = (target.rows && target.rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]) || [];
  var lk = (target.rows && target.rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]) || [];
  var errors = (target.errors || []).slice(), csById = {}, obById = {}, activeLinks = 0;
  cs.forEach(function(x) { var id=String(x.Company_Scope_ID); if(!id||csById[id])errors.push('Duplicate Company Scope ID: '+id); csById[id]=x; });
  ob.forEach(function(x) { var id=String(x.Obligation_ID); if(!id||obById[id])errors.push('Duplicate Obligation ID: '+id); obById[id]=x; if(!csById[String(x.Company_Scope_ID)])errors.push('Orphan obligation: '+id); });
  lk.forEach(function(x) { if(String(x.Link_State).toUpperCase()!=='ACTIVE')return; activeLinks++; if(!obById[String(x.Obligation_ID)])errors.push('Orphan active link: '+x.Obligation_ID); });
  var out={success:errors.length===0,readyForScopeOwnerRouting:errors.length===0,build:MODEL_C_SCOPE_OWNER_BUILD,readOnly:true,writesPerformed:false,counts:{companyScopes:cs.length,obligations:ob.length,activeLinks:activeLinks},policy:{deselect:'DEACTIVATE_CANCEL_UNLINK',historyDeleted:false,abcExpiry:false,gapGraspSharedExpiry:true},errors:errors.slice(0,25)};
  Logger.log(JSON.stringify(out,null,2)); return out;
}

function ModelCScopeOwner_planTransition_(command, companyScopes, obligations, links) {
  command=command||{}; var companyUid=String(command.companyUid||''), auditId=String(command.auditId||''), selected=ModelCScopeOwner_normalizeSelected_(command.selectedScopes||[]), errors=[];
  if(!companyUid)errors.push('Missing companyUid'); if(!auditId)errors.push('Missing auditId');
  var csByCode={}, obByCs={}, activeLinkByOb={};
  (companyScopes||[]).forEach(function(x){if(String(x.Company_UID)===companyUid)csByCode[String(x.ScopeCode)]=x;});
  (obligations||[]).forEach(function(x){if(String(x.Company_UID)===companyUid&&String(x.Obligation_State).toUpperCase()!=='COMPLETED')obByCs[String(x.Company_Scope_ID)]=x;});
  (links||[]).forEach(function(x){if(String(x.Audit_ID)===auditId&&String(x.Link_State).toUpperCase()==='ACTIVE')activeLinkByOb[String(x.Obligation_ID)]=x;});
  var retain=[],create=[],deactivate=[];
  Object.keys(selected).forEach(function(code){var item=selected[code],existing=csByCode[code]; if(existing){retain.push({scopeCode:code,companyScopeId:existing.Company_Scope_ID,obligation:obByCs[String(existing.Company_Scope_ID)]||null,formalHours:item.formalHours,baseExpiry:item.baseExpiry});}else create.push(item);});
  Object.keys(csByCode).forEach(function(code){var scope=csByCode[code]; if(String(scope.Active).toUpperCase()==='YES'&&!selected[code]){var obligation=obByCs[String(scope.Company_Scope_ID)]||null;deactivate.push({scopeCode:code,companyScopeId:scope.Company_Scope_ID,obligationId:obligation?obligation.Obligation_ID:'',activeLink:obligation?(activeLinkByOb[String(obligation.Obligation_ID)]||null):null});}});
  return{success:errors.length===0,errors:errors,retain:retain,create:create,deactivate:deactivate,counts:{retain:retain.length,create:create.length,deactivate:deactivate.length},policy:{deactivateCompanyScope:true,cancelOpenObligation:true,unlinkActiveVisit:true,deleteHistory:false}};
}

function ModelCScopeOwner_normalizeSelected_(items) {
  var out={};
  (items||[]).forEach(function(raw){
    raw=raw||{}; if(!(raw.enabled===true||String(raw.enabled).toLowerCase()==='true'))return;
    var code=String(raw.scopeCode||raw.scope||'').trim(); if(!code)return;
    var abc=ModelCFoundation_isAbc_(code,code);
    out[code]={scopeCode:code,formalHours:raw.formalHours===undefined?raw.customHours:raw.formalHours,baseExpiry:abc?'':String(raw.baseExpiry||raw.dateWillExpire||'').trim(),certificateBirthday:abc?'':String(raw.certificateBirthday||raw.birthdate||'').trim(),lifecycleType:abc?'EXTERNAL_ANNUAL':'CERTIFICATE_RECURRING'};
  });
  if(out.GRASP&&out['MPS-GAP']){out.GRASP.baseExpiry=out['MPS-GAP'].baseExpiry;out.GRASP.certificateBirthday=out['MPS-GAP'].certificateBirthday;}
  return out;
}
