/**
 * AMS-01.6 Model C — ECAS MPS-ABC visit materialization.
 *
 * Uses the canonical ECAS annual-import source contract to resolve the explicit
 * current batch year, then determines/executes visit linkage/materialization.
 * New visits require positive canonical Formal_Hours. A planning window is not
 * mandatory for non-recurring ECAS MPS-ABC and is never invented here.
 */
var MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_VISIT_MATERIALIZATION_R4_SAFE_APPLY';

function RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW(){
  var out=ModelCEcasVisitMaterialization_buildPreview_(SpreadsheetApp.getActive());
  Logger.log(JSON.stringify(ModelCEcasVisitMaterialization_compact_(out),null,2));
  if(!out.success)throw new Error('ECAS visit materialization preview failed: '+(out.errors||[]).join('; '));
  return out;
}

function RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_APPLY(){
  var ss=SpreadsheetApp.getActive(),lock=LockService.getScriptLock();
  lock.waitLock(20000);
  var snapshots=[];
  try{
    var plan=ModelCEcasVisitMaterialization_buildPreview_(ss);
    if(!plan.success)throw new Error('ECAS visit materialization preflight failed: '+(plan.errors||[]).join('; '));
    if((plan.counts.conflicts||0)>0||!plan.gates.noInvalidHours)throw new Error('ECAS visit materialization blocked by conflicts/invalid hours');

    var mutations=(plan.actions||[]).filter(function(a){return a.action==='CREATE_VISIT'||a.action==='LINK_EXISTING_VISIT';});
    if(!mutations.length){
      var noOp={success:true,build:MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD,batchYear:plan.batchYear,writesPerformed:false,createdVisits:0,linkedExistingVisits:0,postVerify:ModelCEcasVisitMaterialization_compact_(plan),errors:[]};
      Logger.log(JSON.stringify(noOp,null,2));return noOp;
    }

    var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS),csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
    if(!apSheet||!obSheet||!lkSheet||!csSheet)throw new Error('Model C materialization sheets missing');
    snapshots=[ModelCScopeOwner_snapshotSheet_(apSheet),ModelCScopeOwner_snapshotSheet_(obSheet),ModelCScopeOwner_snapshotSheet_(lkSheet)];

    var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues()),companyScopes=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues());
    var obById={},csById={};
    obligations.forEach(function(ob){obById[String(ob.Obligation_ID||'')]=ob;});
    companyScopes.forEach(function(cs){csById[String(cs.Company_Scope_ID||'')]=cs;});
    var stamp=new Date().toISOString(),created=0,linkedExisting=0,createdAuditIds=[];

    mutations.forEach(function(a){
      var ob=obById[String(a.obligationId||'')];
      if(!ob)throw new Error('Obligation not found during materialization: '+String(a.obligationId||''));
      if(ModelCEcasVisitMaterialization_terminalObligation_(ob))throw new Error('Cannot materialize terminal obligation: '+String(ob.Obligation_ID||''));
      if(String(ob.Company_UID||'')!==String(a.companyUid||''))throw new Error('Materialization company mismatch: '+String(ob.Obligation_ID||''));
      if(String(ob.Cycle_Key||'')!==String(plan.batchYear||''))throw new Error('Materialization cycle mismatch: '+String(ob.Obligation_ID||''));
      if(!(Number(ModelCEcasVisitMaterialization_number_(ob.Formal_Hours))>0))throw new Error('Invalid Formal_Hours during materialization: '+String(ob.Obligation_ID||''));

      var auditId='';
      if(a.action==='CREATE_VISIT'){
        var made=m5t_createAuditRowFromCompaniesPool_(a.companyUid,a.company||a.companyUid);
        if(!made||made.success!==true||!String(made.auditId||'').trim())throw new Error('Unable to create Audit planning visit for '+String(a.company||a.companyUid||''));
        auditId=String(made.auditId).trim();created++;createdAuditIds.push(auditId);
      }else{
        auditId=String(a.auditId||'').trim();
        if(!auditId)throw new Error('Missing existing Audit ID for linkage');
        linkedExisting++;
      }

      var duplicate=links.some(function(link){return String(link.Obligation_ID||'')===String(ob.Obligation_ID||'')&&String(link.Link_State||'').toUpperCase()==='ACTIVE';});
      if(duplicate)throw new Error('Obligation became linked during apply: '+String(ob.Obligation_ID||''));
      links.push({Audit_ID:auditId,Obligation_ID:String(ob.Obligation_ID||''),Link_State:'ACTIVE',Migration_Batch_ID:String(ob.Migration_Batch_ID||''),Linked_At:stamp,Unlinked_At:''});
      if(!String(ob.Source_Audit_ID||'').trim())ob.Source_Audit_ID=auditId;
      else if(String(ob.Source_Audit_ID)!==auditId)throw new Error('Obligation Source_Audit_ID conflicts with materialized visit: '+String(ob.Obligation_ID||''));
      ob.Updated_At=stamp;
    });

    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_ObligATIONS||MODEL_C_SCHEMA.Audit_Obligations,obligations,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    ModelCScopeOwner_writeObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,links);

    var affected={};
    mutations.forEach(function(a){
      var ob=obById[String(a.obligationId||'')],auditId=String(ob.Source_Audit_ID||a.auditId||'');
      if(auditId)affected[auditId]=String(ob.Company_UID||'');
    });
    Object.keys(affected).forEach(function(auditId){
      var companyUid=affected[auditId],selected=ModelCEcasVisitMaterialization_selectedForAudit_(ss,auditId,companyUid,obligations,links,csById),legacy=ModelCEcasVisitMaterialization_legacyCommand_(apSheet,auditId,companyUid);
      ModelCScopeOwner_projectLegacy_(apSheet,legacy,selected,obligations,links,ss);
    });

    SpreadsheetApp.flush();
    try{if(typeof ModelCAnnualCycle_invalidateAuditPlanningCaches_==='function')ModelCAnnualCycle_invalidateAuditPlanningCaches_();}catch(ignoreCache){}

    var verify=ModelCEcasVisitMaterialization_buildPreview_(ss);
    if(!verify.success||(verify.counts.conflicts||0)>0||(verify.counts.createVisit||0)>0||(verify.counts.linkExistingVisit||0)>0)throw new Error('Post-apply ECAS visit materialization verification failed');

    var out={success:true,build:MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD,batchYear:plan.batchYear,writesPerformed:true,createdVisits:created,linkedExistingVisits:linkedExisting,createdAuditIds:createdAuditIds,postVerify:ModelCEcasVisitMaterialization_compact_(verify),errors:[]};
    Logger.log(JSON.stringify(out,null,2));return out;
  }catch(e){
    for(var i=snapshots.length-1;i>=0;i--)try{ModelCScopeOwner_restoreSnapshot_(snapshots[i]);}catch(ignoreRestore){}
    SpreadsheetApp.flush();
    throw e;
  }finally{try{lock.releaseLock();}catch(ignoreLock){}}
}

function ModelCEcasVisitMaterialization_selectedForAudit_(ss,auditId,companyUid,obligations,links,csById){
  var linked={};
  (links||[]).forEach(function(link){if(String(link.Audit_ID||'')===String(auditId)&&String(link.Link_State||'').toUpperCase()==='ACTIVE')linked[String(link.Obligation_ID||'')]=true;});
  var selected={};
  (obligations||[]).forEach(function(ob){
    if(!linked[String(ob.Obligation_ID||'')]||String(ob.Company_UID||'')!==String(companyUid)||ModelCEcasVisitMaterialization_terminalObligation_(ob))return;
    var code=String(ob.ScopeCode||'').trim();if(!code)return;
    var cs=csById[String(ob.Company_Scope_ID||'')]||{},recurring=ModelCRecurringConfig_isRecurring_(ss,code);
    selected[code]={scopeCode:code,recurring:recurring,formalHours:ModelCEcasVisitMaterialization_number_(ob.Formal_Hours),baseExpiry:recurring?ModelCExtension_dateInTz_(ob.Base_Expiry_Date,ss.getSpreadsheetTimeZone()):'',certificateBirthday:recurring?ModelCExtension_dateInTz_(cs.Certificate_Birthday,ss.getSpreadsheetTimeZone()):'',lifecycleType:recurring?'CERTIFICATE_RECURRING':'NON_RECURRING'};
  });
  if(!Object.keys(selected).length)throw new Error('No active obligations found for materialized audit '+auditId);
  return selected;
}

function ModelCEcasVisitMaterialization_legacyCommand_(sheet,auditId,companyUid){
  var values=sheet.getDataRange().getValues(),headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),rowIndex=ModelCExtension_findRow_(values,map,'Audit ID',auditId);
  if(!rowIndex)throw new Error('Audit planning row missing after materialization: '+auditId);
  var row=values[rowIndex-1]||[];
  function value(header){var c=map[ModelCFoundation_normHeader_(header)];return c===undefined?'':row[c];}
  return{auditId:String(auditId),companyUid:String(companyUid),preassignedAuditorEmail:String(value('Preassigned Auditor')||'').trim().toLowerCase(),allowSelfPlanning:String(value('Allow self planning')||'')};
}

function ModelCEcasVisitMaterialization_buildPreview_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD,readOnly:true,writesPerformed:false,batchYear:'',counts:{sourceRows:0,targetObligations:0,sourceBackedTargets:0,staleCanonicalNotInSource:0,alreadyLinked:0,linkExistingVisit:0,createVisit:0,missingWindowInformational:0,blockedInvalidHours:0,conflicts:0},gates:{},errors:[],warnings:[],actions:[]};

  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  out.batchYear=String((importPlan&&importPlan.batchYear)||'');
  out.counts.sourceRows=Number(importPlan&&importPlan.counts&&importPlan.counts.sourceRows||0);
  out.counts.staleCanonicalNotInSource=Number(importPlan&&importPlan.counts&&importPlan.counts.staleCanonicalNotInSource||0);
  out.gates.importPreviewClean=!!(importPlan&&importPlan.success===true);
  if(!out.gates.importPreviewClean){out.errors=(importPlan&&importPlan.errors?importPlan.errors.slice():['Canonical ECAS import preview failed']);return out;}
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
    if(!(action.planningWindowFrom&&action.planningWindowTo))out.counts.missingWindowInformational++;

    var ownLinks=activeLinksByOb[obId]||[];
    if(ownLinks.length===1){
      var ownAuditId=String(ownLinks[0].Audit_ID||'').trim(),ownAp=apByAudit[ownAuditId];
      if(!ownAp){action.action='CONFLICT';action.auditId=ownAuditId;action.reason='ACTIVE_LINK_WITHOUT_AUDIT_PLANNING_ROW';out.counts.conflicts++;out.errors.push('Active ECAS link has no Audit planning row: '+obId+' -> '+ownAuditId);}
      else if(ownAp.companyUid&&ownAp.companyUid!==uid){action.action='CONFLICT';action.auditId=ownAuditId;action.reason='ACTIVE_LINK_COMPANY_MISMATCH';out.counts.conflicts++;out.errors.push('Active ECAS link company mismatch: '+obId+' -> '+ownAuditId);}
      else{action.action='ALREADY_LINKED';action.auditId=ownAuditId;action.visitStatus=ownAp.status;out.counts.alreadyLinked++;}
      if(!(Number(action.formalHours)>0)){action.warning='INVALID_OR_ZERO_FORMAL_HOURS';out.counts.blockedInvalidHours++;}
      if(!(action.planningWindowFrom&&action.planningWindowTo))action.windowInfo='NO_CANONICAL_WINDOW_NON_RECURRING_ALLOWED';
      out.actions.push(action);return;
    }
    if(ownLinks.length>1){action.action='CONFLICT';action.reason='MULTIPLE_ACTIVE_LINKS';action.candidates=ownLinks.map(function(x){return String(x.Audit_ID||'');});out.counts.conflicts++;out.actions.push(action);return;}

    if(!(Number(action.formalHours)>0)){action.action='BLOCKED';action.reason='INVALID_OR_ZERO_FORMAL_HOURS';out.counts.blockedInvalidHours++;out.actions.push(action);return;}

    var key=uid+'|'+out.batchYear,candidates=(candidateAuditsByCompanyCycle[key]||[]).filter(function(id,ix,arr){return arr.indexOf(id)===ix;});action.candidates=candidates.slice();
    if(candidates.length===0){action.action='CREATE_VISIT';action.reason='NO_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';out.counts.createVisit++;}
    else if(candidates.length===1){action.action='LINK_EXISTING_VISIT';action.auditId=candidates[0];action.visitStatus=apByAudit[candidates[0]]?apByAudit[candidates[0]].status:'';action.reason='EXACTLY_ONE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';out.counts.linkExistingVisit++;}
    else{action.action='CONFLICT';action.reason='MULTIPLE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISITS';out.counts.conflicts++;out.errors.push('Multiple candidate visits for ECAS obligation '+obId+': '+candidates.join(', '));}
    if(!(action.planningWindowFrom&&action.planningWindowTo))action.windowInfo='NO_CANONICAL_WINDOW_NON_RECURRING_ALLOWED';
    out.actions.push(action);
  });

  if(out.counts.blockedInvalidHours)out.warnings.push(out.counts.blockedInvalidHours+' source-backed ECAS obligation(s) have invalid/zero canonical Formal_Hours. Run canonical ECAS import apply before materialization.');
  if(out.counts.missingWindowInformational)out.warnings.push(out.counts.missingWindowInformational+' source-backed ECAS obligation(s) have no complete canonical planning window; for non-recurring MPS-ABC this is informational and no window is invented.');
  out.gates.targetsFound=targets.length>0;
  out.gates.sourceBackedTargetsFound=out.counts.sourceBackedTargets>0;
  out.gates.singleActiveLinkPerObligation=!out.errors.some(function(x){return x.indexOf('Obligation has multiple active visit links:')===0;});
  out.gates.noMaterializationConflicts=out.counts.conflicts===0;
  out.gates.noInvalidHours=out.counts.blockedInvalidHours===0;
  out.gates.missingWindowDoesNotBlockNonRecurring=true;
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&out.gates.targetsFound&&out.gates.sourceBackedTargetsFound&&out.gates.singleActiveLinkPerObligation&&out.gates.noMaterializationConflicts&&out.gates.noInvalidHours;
  return out;
}

function ModelCEcasVisitMaterialization_companyNames_(sheet,errors){var v=sheet.getDataRange().getValues(),h=v[0]||[],m=ModelCFoundation_headerMap_(h),ixUid=ModelCEcasVisitMaterialization_header_(m,['Company_UID','Company UID']),ixName=ModelCEcasVisitMaterialization_header_(m,['Company','Company name','Name']);if(ixUid<0||ixName<0){errors.push('Companies missing Company_UID or Company');return{};}var out={};for(var r=1;r<v.length;r++){var uid=String(v[r][ixUid]||'').trim();if(uid)out[uid]=String(v[r][ixName]||'').trim();}return out;}
function ModelCEcasVisitMaterialization_terminalObligation_(ob){var s=String((ob&&ob.Obligation_State)||'').trim().toUpperCase();return s==='COMPLETED'||s==='CANCELLED'||s==='REJECTED';}
function ModelCEcasVisitMaterialization_terminalVisitStatus_(status){var s=String(status||'').trim().toUpperCase().replace(/_/g,' ');return s==='COMPLETED'||s==='CANCELLED'||s==='REJECTED';}
function ModelCEcasVisitMaterialization_number_(v){var n=Number(String(v===null||v===undefined?'':v).replace(',', '.'));return isFinite(n)?n:'';}
function ModelCEcasVisitMaterialization_header_(map,names){for(var i=0;i<names.length;i++){var key=ModelCFoundation_normHeader_(names[i]);if(map[key]!==undefined)return map[key];}return-1;}
function ModelCEcasVisitMaterialization_compact_(out){out=out||{};var noteworthy=(out.actions||[]).filter(function(a){return a.action!=='ALREADY_LINKED'||a.warning||a.windowInfo;});return{success:out.success===true,build:out.build,batchYear:out.batchYear,readOnly:out.readOnly===true,writesPerformed:out.writesPerformed===true,counts:out.counts||{},gates:out.gates||{},errors:(out.errors||[]).slice(0,25),warnings:(out.warnings||[]).slice(0,25),noteworthyActions:noteworthy.slice(0,30)};}
