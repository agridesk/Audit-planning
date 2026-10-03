/**
 * AMS-01.6 Model C annual-cycle runtime owner.
 *
 * Canonical Model C runtime module. Public compatibility entry points are
 * intentionally kept here until the legacy AnnualCycleEngineV5 and
 * CompletionService shells are fully retired.
 */
var MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD = '2026-10-03_COMPLETE_V29_MODEL_C_HOTPATH_R5_AP_SCOPE_HOURS';

function AnnualCycleEngineV5_HandleCompletionRow_(planningRowObj) {
  return ModelCAnnualCycle_HandleCompletionRow_(planningRowObj);
}

function ModelCAnnualCycle_applyAuditPlanningHoursToPlan_(ss,headers,sourceRow,plan){
  if(!plan||!Array.isArray(plan.successorGroups)||!plan.successorGroups.length)return plan;
  var cfg=(typeof v5_getScopesConfig_==='function')?v5_getScopesConfig_(false):{list:[]};
  var byCode={};
  (cfg.list||[]).forEach(function(d){
    var code=String(d.code||'').trim();
    if(code)byCode[code]=d;
  });
  var hm={};
  (headers||[]).forEach(function(h,i){hm[String(h||'').trim()]=i;});
  plan.successorGroups.forEach(function(g){
    (g.obligations||[]).forEach(function(item){
      var def=byCode[String(item.scopeCode||'').trim()]||null;
      if(!def)return;
      var slot=String(def.slot||'').trim();
      if(!slot)return;
      var ix=hm['Duration '+slot];
      if(ix===undefined)return;
      var raw=sourceRow[ix];
      if(raw===null||raw===undefined||String(raw).trim()==='')return;
      var n=Number(String(raw).replace(',','.'));
      if(isFinite(n)&&n>=0)item.formalHours=n;
    });
  });
  return plan;
}

function ModelCAnnualCycle_HandleCompletionRow_(planningRowObj) {
  var ss = SpreadsheetApp.getActive();
  var auditId = ModelCAnnualCycle_rowValue_(planningRowObj, ['Audit ID']);
  if (!auditId) return {success:false,message:'Missing Audit ID for Model C annual cycle',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};

  var t0=Date.now(),perf={};
  var planT=Date.now();
  var plan = ModelCAnnualCycle_planForAudit_(ss,auditId);
  perf.planMs=Date.now()-planT;
  if (!plan || plan.success === false) {
    return {success:false,message:'Model C successor plan failed: '+((plan&&plan.errors)||['unknown']).join('; '),build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,plan:plan||null,perf:perf};
  }

  if (!plan.recurring || !plan.successorGroups || !plan.successorGroups.length) {
    perf.totalMs=Date.now()-t0;
    return {
      success:true,recurring:false,spawned:false,nextCycleEligible:false,duplicatePrevented:false,
      nextAuditId:'',nextAuditIds:[],build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,modelCOwner:true,
      externalScopes:plan.externalScopes||[],perf:perf
    };
  }

  var ap = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var csSheet = ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
  if (!ap || !obSheet || !lkSheet || !csSheet) return {success:false,message:'Model C annual-cycle sheet missing',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};

  var originalLast={ap:ap.getLastRow(),ob:obSheet.getLastRow(),lk:lkSheet.getLastRow()};
  var appended={ap:0,ob:0,lk:0};
  try {
    var readT=Date.now();
    var apValues = ap.getDataRange().getValues();
    var headers = apValues[0] || [];
    var sourceRowIndex = ModelCAnnualCycle_findAuditRow_(apValues,headers,auditId);
    if (!sourceRowIndex) throw new Error('Audit planning source row not found: '+auditId);
    var sourceRow = apValues[sourceRowIndex-1].slice();
    ModelCAnnualCycle_applyAuditPlanningHoursToPlan_(ss,headers,sourceRow,plan);

    var obValues=obSheet.getDataRange().getValues();
    var lkValues=lkSheet.getDataRange().getValues();
    var csValues=csSheet.getDataRange().getValues();
    var obligations = ModelCMigration_rowsToObjects_(obValues);
    var links = ModelCMigration_rowsToObjects_(lkValues);
    var companyScopes = ModelCMigration_rowsToObjects_(csValues);
    perf.readMs=Date.now()-readT;

    var existingByNatural = {};
    obligations.forEach(function(ob){
      existingByNatural[ModelCAnnualCycle_naturalKey_(ob.Company_Scope_ID,ob.Cycle_Key,ob.Trigger_Source)] = ob;
    });
    var activeLinkByOb = {};
    links.forEach(function(link){
      if (String(link.Link_State||'').toUpperCase()==='ACTIVE') activeLinkByOb[String(link.Obligation_ID||'')] = link;
    });

    var stamp = new Date().toISOString();
    var createdAuditIds = [], duplicateAuditIds = [];
    var newObligations=[],newLinks=[],newPlanningRows=[];

    for (var g=0; g<plan.successorGroups.length; g++) {
      var group = plan.successorGroups[g],existing=[],missing=[];
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

      var newAuditId = ModelCAnnualCycle_newAuditIdFast_(planningRowObj,apValues,g);
      var newRow = sourceRow.slice();
      ModelCAnnualCycle_prepareLegacySuccessorRow_(ss,headers,newRow,group,companyScopes,newAuditId);
      newPlanningRows.push(newRow);

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
        newObligations.push(newOb);
        newLinks.push({Audit_ID:newAuditId,Obligation_ID:newOb.Obligation_ID,Link_State:'ACTIVE',Migration_Batch_ID:'',Linked_At:stamp,Unlinked_At:''});
        existingByNatural[ModelCAnnualCycle_naturalKey_(newOb.Company_Scope_ID,newOb.Cycle_Key,newOb.Trigger_Source)] = newOb;
      });
      createdAuditIds.push(newAuditId);
    }

    var writeT=Date.now();
    if(newPlanningRows.length){
      var apStart=ap.getLastRow()+1;
      ap.getRange(apStart,1,newPlanningRows.length,headers.length).setValues(newPlanningRows);
      appended.ap=newPlanningRows.length;
      for(var pr=0;pr<newPlanningRows.length;pr++) ModelCAnnualCycle_forceLegacyDatesText_(ap,headers,apStart+pr,newPlanningRows[pr]);
    }
    if(newObligations.length){
      ModelCAnnualCycle_appendObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,newObligations,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
      appended.ob=newObligations.length;
    }
    if(newLinks.length){
      ModelCAnnualCycle_appendObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,newLinks,[]);
      appended.lk=newLinks.length;
    }
    perf.writeMs=Date.now()-writeT;

    ModelCAnnualCycle_invalidateAuditPlanningCaches_();
    var allAuditIds = createdAuditIds.concat(duplicateAuditIds);
    perf.totalMs=Date.now()-t0;
    return {
      success:true,recurring:true,spawned:createdAuditIds.length>0,nextCycleEligible:true,
      duplicatePrevented:createdAuditIds.length===0 && duplicateAuditIds.length>0,
      nextAuditId:allAuditIds[0]||'',nextAuditIds:allAuditIds,
      nextExpiry:ModelCAnnualCycle_earliestNextExpiry_(plan),
      successorObligations:plan.successorObligations||0,createdObligations:newObligations.length,
      visitGroups:plan.successorGroups.length,requiresVisitSplit:!!plan.requiresVisitSplit,
      build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,modelCOwner:true,perf:perf
    };
  } catch(e) {
    try{if(appended.lk)lkSheet.deleteRows(originalLast.lk+1,appended.lk);}catch(ignore1){}
    try{if(appended.ob)obSheet.deleteRows(originalLast.ob+1,appended.ob);}catch(ignore2){}
    try{if(appended.ap)ap.deleteRows(originalLast.ap+1,appended.ap);}catch(ignore3){}
    ModelCAnnualCycle_invalidateAuditPlanningCaches_();
    perf.totalMs=Date.now()-t0;
    return {success:false,message:String(e&&e.message?e.message:e),rolledBack:!!(appended.ap||appended.ob||appended.lk),build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,modelCOwner:true,perf:perf};
  }
}

function ModelCAnnualCycle_finalizeCompletedVisit_(auditId) {
  auditId=String(auditId||'').trim();
  if (!auditId) return {success:false,message:'Missing auditId',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};
  var ss=SpreadsheetApp.getActive(),t0=Date.now(),perf={};
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!obSheet||!lkSheet)return{success:false,message:'Model C finalization sheets missing',build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD};

  var obOriginal={},lkOriginal={};
  try{
    var readT=Date.now();
    var obValues=obSheet.getDataRange().getValues(),lkValues=lkSheet.getDataRange().getValues();
    var obHeaders=obValues[0]||[],lkHeaders=lkValues[0]||[];
    var obMap=ModelCFoundation_headerMap_(obHeaders),lkMap=ModelCFoundation_headerMap_(lkHeaders);
    var obIdIx=obMap[ModelCFoundation_normHeader_('Obligation_ID')];
    var lkAuditIx=lkMap[ModelCFoundation_normHeader_('Audit_ID')];
    var lkObIx=lkMap[ModelCFoundation_normHeader_('Obligation_ID')];
    var lkStateIx=lkMap[ModelCFoundation_normHeader_('Link_State')];
    if(obIdIx===undefined||lkAuditIx===undefined||lkObIx===undefined||lkStateIx===undefined)throw new Error('Model C finalization headers missing');

    var obRowById={};
    for(var r=1;r<obValues.length;r++)obRowById[String(obValues[r][obIdIx]||'')]={row:r+1,values:obValues[r].slice()};
    var matched=[];
    for(var l=1;l<lkValues.length;l++){
      if(String(lkValues[l][lkAuditIx]||'')!==auditId)continue;
      if(String(lkValues[l][lkStateIx]||'').toUpperCase()!=='ACTIVE')continue;
      matched.push({row:l+1,values:lkValues[l].slice(),obligationId:String(lkValues[l][lkObIx]||'')});
    }
    perf.readMs=Date.now()-readT;
    if(!matched.length){
      var already=0;
      for(var a=1;a<lkValues.length;a++)if(String(lkValues[a][lkAuditIx]||'')===auditId&&String(lkValues[a][lkStateIx]||'').toUpperCase()==='INACTIVE')already++;
      perf.totalMs=Date.now()-t0;
      return{success:true,finalized:0,idempotent:already>0,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,perf:perf};
    }

    var stamp=new Date().toISOString();
    var obStateIx=obMap[ModelCFoundation_normHeader_('Obligation_State')];
    var obClosedIx=obMap[ModelCFoundation_normHeader_('Closed_At')];
    var obUpdatedIx=obMap[ModelCFoundation_normHeader_('Updated_At')];
    var lkUnlinkedIx=lkMap[ModelCFoundation_normHeader_('Unlinked_At')];
    if(obStateIx===undefined||obClosedIx===undefined||obUpdatedIx===undefined||lkUnlinkedIx===undefined)throw new Error('Model C finalization write headers missing');

    var writeT=Date.now(),updatedOb={};
    matched.forEach(function(item){
      var obPack=obRowById[item.obligationId];
      if(!obPack)throw new Error('Orphan active visit link during completion: '+item.obligationId);
      if(!updatedOb[item.obligationId]){
        obOriginal[obPack.row]=obPack.values.slice();
        var obRow=obPack.values.slice();
        obRow[obStateIx]='COMPLETED';obRow[obClosedIx]=stamp;obRow[obUpdatedIx]=stamp;
        obSheet.getRange(obPack.row,1,1,obHeaders.length).setValues([obRow]);
        updatedOb[item.obligationId]=true;
      }
      lkOriginal[item.row]=item.values.slice();
      var lkRow=item.values.slice();
      lkRow[lkStateIx]='INACTIVE';lkRow[lkUnlinkedIx]=stamp;
      lkSheet.getRange(item.row,1,1,lkHeaders.length).setValues([lkRow]);
    });
    perf.writeMs=Date.now()-writeT;
    perf.totalMs=Date.now()-t0;
    return{success:true,finalized:matched.length,idempotent:false,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,perf:perf};
  }catch(e){
    Object.keys(obOriginal).forEach(function(row){try{obSheet.getRange(Number(row),1,1,obOriginal[row].length).setValues([obOriginal[row]]);}catch(ignore1){}});
    Object.keys(lkOriginal).forEach(function(row){try{lkSheet.getRange(Number(row),1,1,lkOriginal[row].length).setValues([lkOriginal[row]]);}catch(ignore2){}});
    perf.totalMs=Date.now()-t0;
    return{success:false,message:String(e&&e.message?e.message:e),rolledBack:Object.keys(obOriginal).length>0||Object.keys(lkOriginal).length>0,build:MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD,perf:perf};
  }
}

function CompletionService_CommitCompletion(payload) {
  var result=completionService_commitCompletion_(payload);
  if(!result||result.success!==true)return result;
  var auditId=String((result&&result.auditId)||(payload&&payload.auditId)||'').trim();

  // Idempotent recovery may already have finalized Model C inside the core
  // completion service. Do not repeat work unless required.
  var finalization=result.modelCFinalization||ModelCAnnualCycle_finalizeCompletedVisit_(auditId);
  result.modelCFinalization=finalization;
  result.modelCAnnualCycleBuild=MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD;

  // V2.9: Model C finalization is not a warning-only side effect.
  // If it fails, completion history may already be committed, so report that
  // truth explicitly and require the idempotent retry/recovery path.
  if(!finalization||finalization.success!==true){
    result.success=false;
    result.ok=false;
    result.code='MODEL_C_FINALIZATION_FAILED';
    result.completionCommitted=true;
    result.message='Completion committed, but Model C finalization failed: '+String((finalization&&finalization.message)||'unknown');
  }
  return result;
}

function ModelCAnnualCycle_appendObjects_(sheet,headers,objects,textHeaders){
  if(!objects||!objects.length)return;
  var start=sheet.getLastRow()+1;
  var rows=objects.map(function(x){return headers.map(function(h){return x[h]===undefined?'':x[h];});});
  (textHeaders||[]).forEach(function(h){var col=headers.indexOf(h)+1;if(col>0)sheet.getRange(start,col,rows.length,1).setNumberFormat('@');});
  sheet.getRange(start,1,rows.length,headers.length).setValues(rows);
}

function ModelCAnnualCycle_newAuditIdFast_(rowObj,apValues,groupIndex){
  var existing={};
  var headers=(apValues&&apValues[0])||[],map=ModelCFoundation_headerMap_(headers),ix=map[ModelCFoundation_normHeader_('Audit ID')];
  if(ix!==undefined)for(var r=1;r<(apValues||[]).length;r++)existing[String(apValues[r][ix]||'')]=true;
  var id='';
  try{
    var company=String(ModelCAnnualCycle_rowValue_(rowObj,['Company_UID','Company UID'])||'').replace(/[^A-Za-z0-9]+/g,'_');
    var base=String(ModelCAnnualCycle_rowValue_(rowObj,['Audit ID'])||'AUD');
    id=base+'_NEXT_'+String(Number(groupIndex||0)+1);
    if(company)id+='_'+company.slice(-12);
  }catch(ignore){}
  if(!id||existing[id])id='AUD_MODELC_'+new Date().getTime()+'_'+String(groupIndex||0)+'_'+Utilities.getUuid().slice(0,8);
  while(existing[id])id=id+'_'+Utilities.getUuid().slice(0,4);
  return id;
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
