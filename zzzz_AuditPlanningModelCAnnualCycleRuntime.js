/**
 * AMS-01.6 Model C annual-cycle runtime owner.
 *
 * Loaded late on purpose: replaces the legacy aggregate-expiry annual-cycle
 * entry point while preserving its public contract for CompletionService.
 */
var MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD = '2026-09-20_AMS_01_6_MODEL_C_ANNUAL_CYCLE_RUNTIME_R1';

function AnnualCycleEngineV5_HandleCompletionRow_(planningRowObj) {
  return ModelCAnnualCycle_HandleCompletionRow_(planningRowObj);
}

function ModelCAnnualCycle_HandleCompletionRow_(planningRowObj) {
  var ss = SpreadsheetApp.getActive();
  var auditId = ModelCAnnualCycle_rowValue_(planningRowObj, ['Audit ID']);
  if (!auditId) return {success:false,message:'Missing Audit ID for Model C annual cycle',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};

  var plan = ModelCAnnualCycle_planForAudit_(ss,auditId);
  if (!plan || plan.success === false) {
    return {success:false,message:'Model C successor plan failed: '+((plan&&plan.errors)||['unknown']).join('; '),build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,plan:plan||null};
  }

  if (!plan.recurring || !plan.successorGroups || !plan.successorGroups.length) {
    return {
      success:true,
      recurring:false,
      spawned:false,
      nextCycleEligible:false,
      duplicatePrevented:false,
      nextAuditId:'',
      nextAuditIds:[],
      build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,
      modelCOwner:true,
      externalScopes:plan.externalScopes||[]
    };
  }

  var ap = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var csSheet = ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
  if (!ap || !obSheet || !lkSheet || !csSheet) return {success:false,message:'Model C annual-cycle sheet missing',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};

  var snapshots = [
    ModelCScopeOwner_snapshotSheet_(ap),
    ModelCScopeOwner_snapshotSheet_(obSheet),
    ModelCScopeOwner_snapshotSheet_(lkSheet)
  ];

  try {
    var apValues = ap.getDataRange().getValues();
    var headers = apValues[0] || [];
    var sourceRowIndex = ModelCAnnualCycle_findAuditRow_(apValues,headers,auditId);
    if (!sourceRowIndex) throw new Error('Audit planning source row not found: '+auditId);
    var sourceRow = apValues[sourceRowIndex-1].slice();

    var obligations = ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
    var links = ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
    var companyScopes = ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues());
    var existingByNatural = {};
    obligations.forEach(function(ob){
      existingByNatural[ModelCAnnualCycle_naturalKey_(ob.Company_Scope_ID,ob.Cycle_Key,ob.Trigger_Source)] = ob;
    });
    var activeLinkByOb = {};
    links.forEach(function(link){
      if (String(link.Link_State||'').toUpperCase()==='ACTIVE') activeLinkByOb[String(link.Obligation_ID||'')] = link;
    });

    var stamp = new Date().toISOString();
    var createdAuditIds = [];
    var duplicateAuditIds = [];
    var createdObligations = 0;

    for (var g=0; g<plan.successorGroups.length; g++) {
      var group = plan.successorGroups[g];
      var existing = [];
      var missing = [];
      (group.obligations||[]).forEach(function(item){
        var key = ModelCAnnualCycle_naturalKey_(item.companyScopeId,item.cycleKey,'CERTIFICATE_LIFECYCLE');
        var ob = existingByNatural[key];
        if (ob) existing.push({item:item,ob:ob,link:activeLinkByOb[String(ob.Obligation_ID||'')]||null});
        else missing.push(item);
      });

      if (existing.length && missing.length) throw new Error('Partial successor state for '+auditId+' group '+(g+1));

      if (existing.length) {
        var linkedAudit='';
        existing.forEach(function(x){
          if (!x.link) throw new Error('Existing successor obligation has no active visit link: '+x.ob.Obligation_ID);
          var id=String(x.link.Audit_ID||'');
          if (!linkedAudit) linkedAudit=id;
          else if (linkedAudit!==id) throw new Error('Successor obligations linked to different audits');
        });
        if (!linkedAudit) throw new Error('Existing successor group has no audit');
        duplicateAuditIds.push(linkedAudit);
        continue;
      }

      var newAuditId = ModelCAnnualCycle_newAuditId_(planningRowObj,ap,g);
      var newRow = sourceRow.slice();
      ModelCAnnualCycle_prepareLegacySuccessorRow_(ss,headers,newRow,group,companyScopes,newAuditId);
      ap.appendRow(newRow);
      ModelCAnnualCycle_forceLegacyDatesText_(ap,headers,ap.getLastRow(),newRow);

      (group.obligations||[]).forEach(function(item){
        var newOb = {
          Obligation_ID:ModelCMigration_newId_('OBL_'),
          Company_Scope_ID:String(item.companyScopeId||''),
          Company_UID:ModelCAnnualCycle_companyUidForScope_(companyScopes,item.companyScopeId),
          ScopeCode:String(item.scopeCode||''),
          Cycle_Key:String(item.cycleKey||''),
          Trigger_Source:'CERTIFICATE_LIFECYCLE',
          Obligation_State:'OPEN',
          Base_Expiry_Date:String(item.baseExpiry||''),
          Extension_Applied:'',
          Extension_Metadata_JSON:'',
          Effective_Expiry_Date:String(item.effectiveExpiry||item.baseExpiry||''),
          Planning_Window_From:String(item.planningWindowFrom||''),
          Planning_Window_To:String(item.planningWindowTo||''),
          Formal_Hours:Number(item.formalHours||0),
          Preassigned_Auditor_Email:String(ModelCAnnualCycle_rowValue_(planningRowObj,['Preassigned Auditor','Preassigned auditor','Preassigned'])||'').trim().toLowerCase(),
          Allow_Self_Planning:String(ModelCAnnualCycle_rowValue_(planningRowObj,['Allow self planning'])||''),
          Migration_Batch_ID:'',
          Source_Audit_ID:newAuditId,
          Created_At:stamp,
          Updated_At:stamp,
          Closed_At:''
        };
        obligations.push(newOb);
        links.push({Audit_ID:newAuditId,Obligation_ID:newOb.Obligation_ID,Link_State:'ACTIVE',Migration_Batch_ID:'',Linked_At:stamp,Unlinked_At:''});
        existingByNatural[ModelCAnnualCycle_naturalKey_(newOb.Company_Scope_ID,newOb.Cycle_Key,newOb.Trigger_Source)] = newOb;
        createdObligations++;
      });
      createdAuditIds.push(newAuditId);
    }

    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,obligations,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    ModelCScopeOwner_writeObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,links);
    SpreadsheetApp.flush();
    ModelCAnnualCycle_invalidateAuditPlanningCaches_();

    var allAuditIds = createdAuditIds.concat(duplicateAuditIds);
    return {
      success:true,
      recurring:true,
      spawned:createdAuditIds.length>0,
      nextCycleEligible:true,
      duplicatePrevented:createdAuditIds.length===0 && duplicateAuditIds.length>0,
      nextAuditId:allAuditIds[0]||'',
      nextAuditIds:allAuditIds,
      nextExpiry:ModelCAnnualCycle_earliestNextExpiry_(plan),
      successorObligations:plan.successorObligations||0,
      createdObligations:createdObligations,
      visitGroups:plan.successorGroups.length,
      requiresVisitSplit:!!plan.requiresVisitSplit,
      build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,
      modelCOwner:true
    };
  } catch(e) {
    for (var i=snapshots.length-1;i>=0;i--) {
      try { ModelCScopeOwner_restoreSnapshot_(snapshots[i]); } catch(ignore) {}
    }
    SpreadsheetApp.flush();
    ModelCAnnualCycle_invalidateAuditPlanningCaches_();
    return {success:false,message:String(e&&e.message?e.message:e),rolledBack:true,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,modelCOwner:true};
  }
}

function ModelCAnnualCycle_finalizeCompletedVisit_(auditId) {
  auditId=String(auditId||'').trim();
  if (!auditId) return {success:false,message:'Missing auditId',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
  var ss=SpreadsheetApp.getActive();
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!obSheet||!lkSheet)return{success:false,message:'Model C finalization sheets missing',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
  var obSnap=ModelCScopeOwner_snapshotSheet_(obSheet),lkSnap=ModelCScopeOwner_snapshotSheet_(lkSheet);
  try{
    var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
    var links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
    var byId={}; obligations.forEach(function(ob){byId[String(ob.Obligation_ID||'')]=ob;});
    var stamp=new Date().toISOString(),count=0;
    links.forEach(function(link){
      if(String(link.Audit_ID||'')!==auditId||String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;
      var ob=byId[String(link.Obligation_ID||'')];
      if(!ob)throw new Error('Orphan active visit link during completion: '+String(link.Obligation_ID||''));
      ob.Obligation_State='COMPLETED';ob.Closed_At=stamp;ob.Updated_At=stamp;
      link.Link_State='INACTIVE';link.Unlinked_At=stamp;count++;
    });
    if(!count){
      var already=links.filter(function(link){return String(link.Audit_ID||'')===auditId&&String(link.Link_State||'').toUpperCase()==='INACTIVE';}).length;
      return{success:true,finalized:0,idempotent:already>0,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
    }
    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,obligations,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    ModelCScopeOwner_writeObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,links);
    SpreadsheetApp.flush();
    return{success:true,finalized:count,idempotent:false,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
  }catch(e){
    try{ModelCScopeOwner_restoreSnapshot_(obSnap);}catch(ignore1){}
    try{ModelCScopeOwner_restoreSnapshot_(lkSnap);}catch(ignore2){}
    SpreadsheetApp.flush();
    return{success:false,message:String(e&&e.message?e.message:e),rolledBack:true,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
  }
}

/* Late public completion wrapper: finalize the completed Model C obligations only
 * after the existing completion transaction has succeeded. */
function CompletionService_CommitCompletion(payload) {
  var result=completionService_commitCompletion_(payload);
  if(!result||result.success!==true)return result;
  var auditId=String((result&&result.auditId)||(payload&&payload.auditId)||'').trim();
  var finalization=ModelCAnnualCycle_finalizeCompletedVisit_(auditId);
  result.modelCFinalization=finalization;
  result.modelCAnnualCycleBuild=MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD;
  if(!finalization.success){
    result.modelCFinalizationWarning=finalization.message||'Model C finalization failed';
  }
  return result;
}

function ModelCAnnualCycle_prepareLegacySuccessorRow_(ss,headers,row,group,companyScopes,newAuditId){
  var map=ModelCFoundation_headerMap_(headers);
  var defs=m5t_scopeSlotDefs_(ss);
  defs.forEach(function(d){if(d.flagCol0!=null)row[d.flagCol0]='';if(d.hourCol0!=null)row[d.hourCol0]='';});
  var total=0,displayScopes=[];
  (group.obligations||[]).forEach(function(item){
    var canonical=(typeof m5t_scopeCanonicalName_==='function'?m5t_scopeCanonicalName_(ss,item.scopeCode):item.scopeCode)||item.scopeCode;
    var def=null;
    for(var i=0;i<defs.length;i++)if(String(defs[i].scope||'')===String(canonical)||String(defs[i].slotKey||'')===String(item.scopeCode)){def=defs[i];break;}
    if(!def)throw new Error('No Audit planning scope slot for successor '+item.scopeCode);
    if(def.flagCol0!=null)row[def.flagCol0]='x';
    if(def.hourCol0!=null)row[def.hourCol0]=Number(item.formalHours||0);
    total+=Number(item.formalHours||0);displayScopes.push(String(def.scope||canonical));
  });
  var birthday='';
  var csById={};(companyScopes||[]).forEach(function(cs){csById[String(cs.Company_Scope_ID||'')]=cs;});
  (group.obligations||[]).slice().sort(function(a,b){return String(a.scopeCode).localeCompare(String(b.scopeCode));}).some(function(item){var cs=csById[String(item.companyScopeId||'')];var b=cs?String(cs.Certificate_Birthday||'').trim():'';if(b){birthday=b;return true;}return false;});
  var expiry='';(group.obligations||[]).forEach(function(item){var e=String(item.baseExpiry||'');if(e&&(!expiry||e<expiry))expiry=e;});
  ModelCAnnualCycle_setLegacy_(row,map,'Audit ID',newAuditId);
  ModelCAnnualCycle_setLegacy_(row,map,'Status','Pending Planning');
  ModelCAnnualCycle_setLegacy_(row,map,'Birthdate certificate',birthday);
  ModelCAnnualCycle_setLegacy_(row,map,'Date - Will Expire',expiry);
  ModelCAnnualCycle_setLegacy_(row,map,'Extended Expiration Date',expiry);
  ModelCAnnualCycle_setLegacy_(row,map,'Planning window from',String(group.planningWindowFrom||''));
  ModelCAnnualCycle_setLegacy_(row,map,'Planning window to',String(group.planningWindowTo||''));
  ModelCAnnualCycle_setLegacy_(row,map,'Total audit time in hours',total);
  ModelCAnnualCycle_setLegacy_(row,map,'Scopes_List',displayScopes.join(', '));
  ModelCAnnualCycle_setLegacy_(row,map,'Extension applied','');
  ['Date - Planned','Date – Planned','Date - Approved','Date – Approved','Date accepted','Date - Accepted','Planning JSON','Audit days textual','Last manager decision','Last decision timestamp','Status since','Manager comment (last)','Last auditor decision','Last auditor decision timestamp','Auditor comment (last)','Assigned to','Assigned To','Assigned','Assigned Auditor','Assigned auditor'].forEach(function(h){ModelCAnnualCycle_setLegacy_(row,map,h,'');});
}

function ModelCAnnualCycle_forceLegacyDatesText_(sheet,headers,rowIndex,row){
  var map=ModelCFoundation_headerMap_(headers);
  ['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'].forEach(function(h){var ix=map[ModelCFoundation_normHeader_(h)];if(ix===undefined)return;var cell=sheet.getRange(rowIndex,ix+1);cell.setNumberFormat('@');cell.setValue(row[ix]||'');});
}
function ModelCAnnualCycle_setLegacy_(row,map,header,value){var ix=map[ModelCFoundation_normHeader_(header)];if(ix!==undefined)row[ix]=value;}
function ModelCAnnualCycle_rowValue_(obj,names){obj=obj||{};for(var i=0;i<(names||[]).length;i++){var n=names[i];if(obj[n]!==undefined&&obj[n]!==null&&String(obj[n]).trim()!=='')return String(obj[n]).trim();}return'';}
function ModelCAnnualCycle_findAuditRow_(values,headers,auditId){var map=ModelCFoundation_headerMap_(headers),ix=map[ModelCFoundation_normHeader_('Audit ID')];if(ix===undefined)return 0;for(var r=1;r<values.length;r++)if(String(values[r][ix]||'').trim()===auditId)return r+1;return 0;}
function ModelCAnnualCycle_naturalKey_(companyScopeId,cycleKey,triggerSource){return[String(companyScopeId||''),String(cycleKey||''),String(triggerSource||'CERTIFICATE_LIFECYCLE')].join('|');}
function ModelCAnnualCycle_companyUidForScope_(companyScopes,companyScopeId){for(var i=0;i<(companyScopes||[]).length;i++)if(String(companyScopes[i].Company_Scope_ID||'')===String(companyScopeId||''))return String(companyScopes[i].Company_UID||'');return'';}
function ModelCAnnualCycle_earliestNextExpiry_(plan){var e='';(plan.successorGroups||[]).forEach(function(g){(g.obligations||[]).forEach(function(x){var v=String(x.baseExpiry||'');if(v&&(!e||v<e))e=v;});});return e;}
function ModelCAnnualCycle_newAuditId_(rowObj,ap,groupIndex){var id='';try{if(typeof AC_buildNewAuditId_==='function')id=String(AC_buildNewAuditId_(rowObj,ap.getLastRow()+1+Number(groupIndex||0))||'').trim();}catch(ignore){}if(!id)id='AUD_MODELC_'+new Date().getTime()+'_'+String(groupIndex||0)+'_'+Utilities.getUuid().slice(0,8);var ids={};var values=ap.getDataRange().getValues(),headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),ix=map[ModelCFoundation_normHeader_('Audit ID')];if(ix!==undefined)for(var r=1;r<values.length;r++)ids[String(values[r][ix]||'')]=true;if(ids[id])id=id+'_MC'+String(groupIndex||0)+'_'+Utilities.getUuid().slice(0,4);return id;}
function ModelCAnnualCycle_invalidateAuditPlanningCaches_(){try{if(typeof __mp_invalidateAuditPlanningPack_==='function')__mp_invalidateAuditPlanningPack_();}catch(e1){}try{if(typeof __mp_invalidatePersistCaches_==='function')__mp_invalidatePersistCaches_(['Audit planning']);}catch(e2){}try{if(typeof V5_clearManagerOpenCache_==='function')V5_clearManagerOpenCache_();}catch(e3){}}
