/**
 * AMS-01.6 Model C — ECAS MPS-ABC visit materialization preview.
 *
 * Read-only. Uses the canonical ECAS annual-import source contract to resolve
 * the current batch year, then determines visit linkage/materialization.
 * New visits are never proposed for zero-hour obligations or obligations that
 * lack a complete canonical planning window.
 */
var MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW_R2_SOURCE_GATED';

function RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW(){
  var out=ModelCEcasVisitMaterialization_buildPreview_(SpreadsheetApp.getActive());
  Logger.log(JSON.stringify(ModelCEcasVisitMaterialization_compact_(out),null,2));
  if(!out.success)throw new Error('ECAS visit materialization preview failed: '+(out.errors||[]).join('; '));
  return out;
}

function ModelCEcasVisitMaterialization_buildPreview_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD,readOnly:true,writesPerformed:false,batchYear:'',counts:{sourceRows:0,targetObligations:0,sourceBackedTargets:0,staleCanonicalNotInSource:0,alreadyLinked:0,linkExistingVisit:0,createVisit:0,blockedMissingWindow:0,blockedInvalidHours:0,conflicts:0},gates:{},errors:[],warnings:[],actions:[]};

  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  out.batchYear=String((importPlan&&importPlan.batchYear)||'');
  out.counts.sourceRows=Number(importPlan&&importPlan.counts&&importPlan.counts.sourceRows||0);
  out.counts.staleCanonicalNotInSource=Number(importPlan&&importPlan.counts&&importPlan.counts.staleCanonicalNotInSource||0);
  out.gates.importPreviewClean=!!(importPlan&&importPlan.success===true);
  if(!out.gates.importPreviewClean){
    out.errors=(importPlan&&importPlan.errors?importPlan.errors.slice():['Canonical ECAS import preview failed']);
    return out;
  }
  if(importPlan.warnings&&importPlan.warnings.length)out.warnings=out.warnings.concat(importPlan.warnings);

  var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS),companies=ss.getSheetByName('Companies');
  var required={'Audit planning':apSheet,Audit_Obligations:obSheet,Audit_Visit_Obligations:lkSheet,Companies:companies};
  Object.keys(required).forEach(function(name){if(!required[name])out.errors.push('Missing sheet: '+name);});
  out.gates.requiredSheets=out.errors.length===0;if(!out.gates.requiredSheets)return out;

  var cfg=ModelCRecurringConfig_get_(ss,'MPS-ABC');
  out.gates.abcConfiguredNonRecurring=cfg.recurring===false;
  if(!out.gates.abcConfiguredNonRecurring)out.errors.push('MPS-ABC must be Recurring=NO in Config_Scopes');
  out.gates.explicitBatchYear=/^20\d{2}$/.test(out.batchYear);
  if(!out.gates.explicitBatchYear)out.errors.push('No valid ECAS batch year resolved');
  if(out.errors.length)return out;

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;});

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues=apSheet.getDataRange().getValues(),apHeaders=apValues[0]||[],apMap=ModelCFoundation_headerMap_(apHeaders);
  var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']),ixCompanyUid=ModelCEcasVisitMaterialization_header_(apMap,['Company_UID','Company UID']),ixStatus=ModelCEcasVisitMaterialization_header_(apMap,['Status']);
  if(ixAudit<0||ixCompanyUid<0){out.errors.push('Audit planning missing Audit ID or Company_UID');return out;}

  var apByAudit={};
  for(var ar=1;ar<apValues.length;ar++){
    var auditId=String(apValues[ar][ixAudit]||'').trim();if(!auditId)continue;
    if(apByAudit[auditId])out.errors.push('Duplicate Audit ID in Audit planning: '+auditId);
    apByAudit[auditId]={row:ar+1,auditId:auditId,companyUid:String(apValues[ar][ixCompanyUid]||'').trim(),status:ixStatus>=0?String(apValues[ar][ixStatus]||'').trim():''};
  }

  var companyNames=ModelCEcasVisitMaterialization_companyNames_(companies,out.errors),obById={};
  obligations.forEach(function(ob){var id=String(ob.Obligation_ID||'').trim();if(!id)return;if(obById[id])out.errors.push('Duplicate Obligation_ID: '+id);obById[id]=ob;});
  var activeLinksByOb={},activeLinksByAudit={};
  links.forEach(function(link){if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;var obId=String(link.Obligation_ID||'').trim(),auditId=String(link.Audit_ID||'').trim();if(!obId||!auditId)return;(activeLinksByOb[obId]||(activeLinksByOb[obId]=[])).push(link);(activeLinksByAudit[auditId]||(activeLinksByAudit[auditId]=[])).push(link);});
  Object.keys(activeLinksByOb).forEach(function(obId){if(activeLinksByOb[obId].length>1)out.errors.push('Obligation has multiple active visit links: '+obId);});

  var candidateAuditsByCompanyCycle={};
  Object.keys(activeLinksByAudit).forEach(function(auditId){
    var ap=apByAudit[auditId];if(!ap||ModelCEcasVisitMaterialization_terminalVisitStatus_(ap.status))return;
    var seen={};
    (activeLinksByAudit[auditId]||[]).forEach(function(link){var ob=obById[String(link.Obligation_ID||'')];if(!ob||ModelCEcasVisitMaterialization_terminalObligation_(ob))return;var uid=String(ob.Company_UID||'').trim(),cycle=String(ob.Cycle_Key||'').trim();if(!uid||!cycle)return;if(ap.companyUid&&ap.companyUid!==uid){out.errors.push('Audit/company mismatch: '+auditId+' / '+uid);return;}var key=uid+'|'+cycle;if(seen[key])return;seen[key]=true;(candidateAuditsByCompanyCycle[key]||(candidateAuditsByCompanyCycle[key]=[])).push(auditId);});
  });

  var targets=obligations.filter(function(ob){return String(ob.ScopeCode||'').trim().toUpperCase()==='MPS-ABC'&&String(ob.Trigger_Source||'').trim().toUpperCase()==='ECAS'&&String(ob.Cycle_Key||'').trim()===out.batchYear&&!ModelCEcasVisitMaterialization_terminalObligation_(ob);});
  out.counts.targetObligations=targets.length;

  targets.forEach(function(ob){
    var obId=String(ob.Obligation_ID||'').trim(),uid=String(ob.Company_UID||'').trim();
    var action={obligationId:obId,companyUid:uid,company:companyNames[uid]||'',cycleKey:String(ob.Cycle_Key||''),formalHours:ModelCEcasVisitMaterialization_number_(ob.Formal_Hours),planningWindowFrom:String(ob.Planning_Window_From||'').trim(),planningWindowTo:String(ob.Planning_Window_To||'').trim(),sourceBacked:!!sourceUid[uid],action:'',auditId:'',candidates:[]};
    if(!action.sourceBacked){action.action='STALE_CANONICAL_NOT_IN_SOURCE';action.reason='NOT_PRESENT_IN_CURRENT_ECAS_SOURCE';out.actions.push(action);return;}
    out.counts.sourceBackedTargets++;

    var ownLinks=activeLinksByOb[obId]||[];
    if(ownLinks.length===1){
      var ownAuditId=String(ownLinks[0].Audit_ID||'').trim(),ownAp=apByAudit[ownAuditId];
      if(!ownAp){action.action='CONFLICT';action.auditId=ownAuditId;action.reason='ACTIVE_LINK_WITHOUT_AUDIT_PLANNING_ROW';out.counts.conflicts++;out.errors.push('Active ECAS link has no Audit planning row: '+obId+' -> '+ownAuditId);}
      else if(ownAp.companyUid&&ownAp.companyUid!==uid){action.action='CONFLICT';action.auditId=ownAuditId;action.reason='ACTIVE_LINK_COMPANY_MISMATCH';out.counts.conflicts++;out.errors.push('Active ECAS link company mismatch: '+obId+' -> '+ownAuditId);}
      else{action.action='ALREADY_LINKED';action.auditId=ownAuditId;action.visitStatus=ownAp.status;out.counts.alreadyLinked++;}
      if(!(Number(action.formalHours)>0)){action.warning='INVALID_OR_ZERO_FORMAL_HOURS';out.counts.blockedInvalidHours++;}
      if(!(action.planningWindowFrom&&action.planningWindowTo)){action.warning=(action.warning?action.warning+'; ':'')+'INCOMPLETE_CANONICAL_PLANNING_WINDOW';out.counts.blockedMissingWindow++;}
      out.actions.push(action);return;
    }
    if(ownLinks.length>1){action.action='CONFLICT';action.reason='MULTIPLE_ACTIVE_LINKS';action.candidates=ownLinks.map(function(x){return String(x.Audit_ID||'');});out.counts.conflicts++;out.actions.push(action);return;}

    if(!(Number(action.formalHours)>0)){action.action='BLOCKED';action.reason='INVALID_OR_ZERO_FORMAL_HOURS';out.counts.blockedInvalidHours++;out.actions.push(action);return;}
    if(!(action.planningWindowFrom&&action.planningWindowTo)){action.action='BLOCKED';action.reason='INCOMPLETE_CANONICAL_PLANNING_WINDOW';out.counts.blockedMissingWindow++;out.actions.push(action);return;}

    var key=uid+'|'+out.batchYear,candidates=(candidateAuditsByCompanyCycle[key]||[]).filter(function(id,ix,arr){return arr.indexOf(id)===ix;});action.candidates=candidates.slice();
    if(candidates.length===0){action.action='CREATE_VISIT';action.reason='NO_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';out.counts.createVisit++;}
    else if(candidates.length===1){action.action='LINK_EXISTING_VISIT';action.auditId=candidates[0];action.visitStatus=apByAudit[candidates[0]]?apByAudit[candidates[0]].status:'';action.reason='EXACTLY_ONE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';out.counts.linkExistingVisit++;}
    else{action.action='CONFLICT';action.reason='MULTIPLE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISITS';out.counts.conflicts++;out.errors.push('Multiple candidate visits for ECAS obligation '+obId+': '+candidates.join(', '));}
    out.actions.push(action);
  });

  if(out.counts.blockedInvalidHours)out.warnings.push(out.counts.blockedInvalidHours+' source-backed ECAS obligation(s) have invalid/zero canonical Formal_Hours. Run canonical ECAS import apply before materialization.');
  if(out.counts.blockedMissingWindow)out.warnings.push(out.counts.blockedMissingWindow+' source-backed ECAS obligation(s) lack a complete canonical planning window. No visit will be created from an invented window.');
  out.gates.targetsFound=targets.length>0;
  out.gates.sourceBackedTargetsFound=out.counts.sourceBackedTargets>0;
  out.gates.singleActiveLinkPerObligation=!out.errors.some(function(x){return x.indexOf('Obligation has multiple active visit links:')===0;});
  out.gates.noMaterializationConflicts=out.counts.conflicts===0;
  out.gates.noInvalidHours=out.counts.blockedInvalidHours===0;
  out.gates.noUnlinkedTargetsMissingWindow=(out.actions||[]).filter(function(a){return a.sourceBacked&&a.action==='BLOCKED'&&a.reason==='INCOMPLETE_CANONICAL_PLANNING_WINDOW';}).length===0;
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&out.gates.targetsFound&&out.gates.sourceBackedTargetsFound&&out.gates.singleActiveLinkPerObligation&&out.gates.noMaterializationConflicts&&out.gates.noInvalidHours&&out.gates.noUnlinkedTargetsMissingWindow;
  return out;
}

function ModelCEcasVisitMaterialization_companyNames_(sheet,errors){var v=sheet.getDataRange().getValues(),h=v[0]||[],m=ModelCFoundation_headerMap_(h),ixUid=ModelCEcasVisitMaterialization_header_(m,['Company_UID','Company UID']),ixName=ModelCEcasVisitMaterialization_header_(m,['Company','Company name','Name']);if(ixUid<0||ixName<0){errors.push('Companies missing Company_UID or Company');return{};}var out={};for(var r=1;r<v.length;r++){var uid=String(v[r][ixUid]||'').trim();if(uid)out[uid]=String(v[r][ixName]||'').trim();}return out;}
function ModelCEcasVisitMaterialization_terminalObligation_(ob){var s=String((ob&&ob.Obligation_State)||'').trim().toUpperCase();return s==='COMPLETED'||s==='CANCELLED'||s==='REJECTED';}
function ModelCEcasVisitMaterialization_terminalVisitStatus_(status){var s=String(status||'').trim().toUpperCase().replace(/_/g,' ');return s==='COMPLETED'||s==='CANCELLED'||s==='REJECTED';}
function ModelCEcasVisitMaterialization_number_(v){var n=Number(String(v===null||v===undefined?'':v).replace(',','.'));return isFinite(n)?n:'';}
function ModelCEcasVisitMaterialization_header_(map,names){for(var i=0;i<names.length;i++){var key=ModelCFoundation_normHeader_(names[i]);if(map[key]!==undefined)return map[key];}return-1;}
function ModelCEcasVisitMaterialization_compact_(out){out=out||{};var noteworthy=(out.actions||[]).filter(function(a){return a.action!=='ALREADY_LINKED'||a.warning;});return{success:out.success===true,build:out.build,batchYear:out.batchYear,readOnly:out.readOnly===true,writesPerformed:out.writesPerformed===true,counts:out.counts||{},gates:out.gates||{},errors:(out.errors||[]).slice(0,25),warnings:(out.warnings||[]).slice(0,25),noteworthyActions:noteworthy.slice(0,30)};}
