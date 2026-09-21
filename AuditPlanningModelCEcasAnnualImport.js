/**
 * AMS-01.6 Model C — canonical ECAS MPS-ABC annual import.
 *
 * Source contract on BronBedrijfUrenScopes:
 * - Required: MPS-nummer, Mandated time, Services.
 * - Explicit annual batch year: G1.
 * - Only MPS-ABC service rows are imported.
 * - Audit order no., Start planning date, Audit type, certificate dates,
 *   address/name fields and annotations do not drive canonical import logic.
 *
 * Canonical writes:
 * - Company_Scopes
 * - Audit_Obligations
 *
 * Audit planning is NOT written here. Visit materialization is separate.
 * MPS-ABC is non-recurring: no certificate expiry/birthday and no automatic
 * successor. Existing canonical planning windows are preserved, never derived
 * from ECAS source data.
 */
var MODEL_C_ECAS_ANNUAL_IMPORT_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_ANNUAL_IMPORT_R4_EXPLICIT_BATCH_OWNER';
var MODEL_C_ECAS_SOURCE_SHEET='BronBedrijfUrenScopes';
var MODEL_C_ECAS_SCOPE_CODE='MPS-ABC';
var MODEL_C_ECAS_TRIGGER_SOURCE='ECAS';

function RUN_MODEL_C_ECAS_IMPORT_PREVIEW(){
  var out=ModelCEcasAnnualImport_buildPlan_(SpreadsheetApp.getActive());
  Logger.log(JSON.stringify(ModelCEcasAnnualImport_compact_(out),null,2));
  if(!out.success)throw new Error('Model C ECAS preview failed: '+(out.errors||[]).join('; '));
  return out;
}

function RUN_MODEL_C_ECAS_IMPORT_APPLY(){
  var ss=SpreadsheetApp.getActive(),lock=LockService.getScriptLock();
  lock.waitLock(20000);
  var snapshots=[];
  try{
    var plan=ModelCEcasAnnualImport_buildPlan_(ss);
    if(!plan.success)throw new Error('Preflight failed: '+(plan.errors||[]).join('; '));
    if((plan.counts.conflicts||0)>0)throw new Error('Import contains conflicts; apply blocked');

    var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
    var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
    snapshots=[ModelCScopeOwner_snapshotSheet_(csSheet),ModelCScopeOwner_snapshotSheet_(obSheet)];

    var cs=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues());
    var ob=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
    var csByCompany={};
    cs.forEach(function(x){if(String(x.ScopeCode||'')===MODEL_C_ECAS_SCOPE_CODE)csByCompany[String(x.Company_UID||'')]=x;});
    var obByNatural={};
    ob.forEach(function(x){
      if(String(x.ScopeCode||'')!==MODEL_C_ECAS_SCOPE_CODE)return;
      var key=String(x.Company_Scope_ID||'')+'|'+String(x.Cycle_Key||'')+'|'+String(x.Trigger_Source||'').toUpperCase();
      obByNatural[key]=x;
    });

    var stamp=new Date().toISOString();
    var batchId='ECAS_ABC_'+plan.batchYear+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss');
    var createdScopes=0,reactivatedScopes=0,createdObligations=0,updatedHours=0,unchanged=0,skippedCompleted=0,preservedWindows=0;

    plan.actions.forEach(function(a){
      if(a.action==='SKIP_COMPLETED'){skippedCompleted++;return;}
      if(a.action==='CONFLICT'||a.action==='STALE_CANONICAL_NOT_IN_SOURCE')return;

      var scope=csByCompany[a.companyUid];
      if(!scope){
        scope={
          Company_Scope_ID:ModelCMigration_newId_('CS_'),
          Company_UID:a.companyUid,
          ScopeCode:MODEL_C_ECAS_SCOPE_CODE,
          Active:'YES',
          Lifecycle_Type:'NON_RECURRING',
          Certificate_Birthday:'',
          Company_Formal_Hours_Override:'',
          Certificate_Metadata_JSON:'',
          Migration_Batch_ID:batchId,
          Source_Audit_ID:'',
          Created_At:stamp,
          Updated_At:stamp
        };
        cs.push(scope);csByCompany[a.companyUid]=scope;createdScopes++;
      }else if(String(scope.Active||'').toUpperCase()!=='YES'){
        scope.Active='YES';scope.Lifecycle_Type='NON_RECURRING';scope.Certificate_Birthday='';scope.Updated_At=stamp;reactivatedScopes++;
      }

      var nk=String(scope.Company_Scope_ID)+'|'+String(plan.batchYear)+'|'+MODEL_C_ECAS_TRIGGER_SOURCE;
      var obligation=obByNatural[nk];
      if(!obligation){
        obligation={
          Obligation_ID:ModelCMigration_newId_('OBL_'),
          Company_Scope_ID:scope.Company_Scope_ID,
          Company_UID:a.companyUid,
          ScopeCode:MODEL_C_ECAS_SCOPE_CODE,
          Cycle_Key:String(plan.batchYear),
          Trigger_Source:MODEL_C_ECAS_TRIGGER_SOURCE,
          Obligation_State:'OPEN',
          Base_Expiry_Date:'',
          Extension_Applied:'',
          Extension_Metadata_JSON:'',
          Effective_Expiry_Date:'',
          Planning_Window_From:'',
          Planning_Window_To:'',
          Formal_Hours:a.mandatedHours,
          Preassigned_Auditor_Email:'',
          Allow_Self_Planning:'',
          Migration_Batch_ID:batchId,
          Source_Audit_ID:'',
          Created_At:stamp,
          Updated_At:stamp,
          Closed_At:''
        };
        ob.push(obligation);obByNatural[nk]=obligation;createdObligations++;
      }else{
        var oldHours=Number(String(obligation.Formal_Hours||'').replace(',','.'));
        if(!isFinite(oldHours)||Math.abs(oldHours-a.mandatedHours)>0.000001){obligation.Formal_Hours=a.mandatedHours;updatedHours++;}else unchanged++;
        obligation.Base_Expiry_Date='';
        obligation.Effective_Expiry_Date='';
        obligation.Extension_Applied='';
        obligation.Extension_Metadata_JSON='';
        if(String(obligation.Planning_Window_From||'').trim()||String(obligation.Planning_Window_To||'').trim())preservedWindows++;
        obligation.Updated_At=stamp;
      }
    });

    ModelCScopeOwner_writeObjects_(csSheet,MODEL_C_SCHEMA.Company_Scopes,cs,['Certificate_Birthday']);
    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,ob,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    SpreadsheetApp.flush();

    var verify=ModelCEcasAnnualImport_buildPlan_(ss);
    var remainingMutations=(verify.counts.createCompanyScopes||0)+(verify.counts.reactivateCompanyScopes||0)+(verify.counts.createObligations||0)+(verify.counts.updateHours||0);
    if(!verify.success||(verify.counts.conflicts||0)>0||remainingMutations>0)throw new Error('Post-apply verification failed');

    var out={
      success:true,
      build:MODEL_C_ECAS_ANNUAL_IMPORT_BUILD,
      batchYear:plan.batchYear,
      writesPerformed:true,
      batchId:batchId,
      counts:{
        sourceRows:plan.counts.sourceRows,
        sourcePhysicalRows:plan.counts.sourcePhysicalRows,
        ignoredOtherServiceRows:plan.counts.ignoredOtherServiceRows,
        createdCompanyScopes:createdScopes,
        reactivatedCompanyScopes:reactivatedScopes,
        createdObligations:createdObligations,
        updatedHours:updatedHours,
        unchanged:unchanged,
        skippedCompleted:skippedCompleted,
        preservedPlanningWindows:preservedWindows,
        staleCanonicalNotInSource:verify.counts.staleCanonicalNotInSource||0
      },
      gates:{canonicalTargetsOnly:true,directAuditPlanningWrite:false,certificateLifecycleLeak:false,planningWindowsNotInvented:true,postApplyReconciled:true},
      postVerify:ModelCEcasAnnualImport_compact_(verify),
      errors:[]
    };
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }catch(e){
    for(var i=snapshots.length-1;i>=0;i--)try{ModelCScopeOwner_restoreSnapshot_(snapshots[i]);}catch(ignore){}
    throw e;
  }finally{try{lock.releaseLock();}catch(ignoreLock){}}
}

function ModelCEcasAnnualImport_buildPlan_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var out={
    success:false,
    build:MODEL_C_ECAS_ANNUAL_IMPORT_BUILD,
    readOnly:true,
    writesPerformed:false,
    batchYear:'',
    sourceSheet:MODEL_C_ECAS_SOURCE_SHEET,
    sourceMode:'EXPLICIT_BATCH_STAGING',
    counts:{
      sourcePhysicalRows:0,sourceRows:0,ignoredOtherServiceRows:0,duplicateAbcRowsCollapsed:0,
      matchedCompanies:0,completedAlready:0,existingSameCycle:0,createCompanyScopes:0,reactivateCompanyScopes:0,
      createObligations:0,updateHours:0,unchanged:0,conflicts:0,staleCanonicalNotInSource:0,
      zeroFormalHoursCanonical:0,completePlanningWindows:0,incompletePlanningWindows:0
    },
    gates:{},errors:[],warnings:[],actions:[]
  };

  var source=ss.getSheetByName(MODEL_C_ECAS_SOURCE_SHEET),companies=ss.getSheetByName('Companies'),realized=ss.getSheetByName('Log realized audits');
  var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  [MODEL_C_ECAS_SOURCE_SHEET,'Companies',MODEL_C_SHEETS.COMPANY_SCOPES,MODEL_C_SHEETS.AUDIT_OBLIGATIONS].forEach(function(n){if(!ss.getSheetByName(n))out.errors.push('Missing sheet: '+n);});
  out.gates.requiredSheets=out.errors.length===0;
  if(!out.gates.requiredSheets)return out;

  var cfg=ModelCRecurringConfig_get_(ss,MODEL_C_ECAS_SCOPE_CODE);
  out.gates.abcConfiguredNonRecurring=cfg.recurring===false;
  if(cfg.recurring!==false)out.errors.push('MPS-ABC must be Recurring=NO in Config_Scopes');

  var year=String(source.getRange('G1').getDisplayValue()||'').trim();
  out.batchYear=year;
  out.gates.explicitBatchYear=/^20\d{2}$/.test(year);
  if(!out.gates.explicitBatchYear)out.errors.push('BronBedrijfUrenScopes!G1 must contain explicit four-digit batch year');

  var sv=source.getDataRange().getValues(),headers=sv[0]||[],hm=ModelCFoundation_headerMap_(headers);
  var ixMps=ModelCEcasAnnualImport_header_(hm,['MPS-nummer','MPS nummer','MPS-number','MPS number']);
  var ixHours=ModelCEcasAnnualImport_header_(hm,['Mandated time']);
  var ixServices=ModelCEcasAnnualImport_header_(hm,['Services']);
  if(ixMps<0)out.errors.push('Source missing header: MPS-nummer');
  if(ixHours<0)out.errors.push('Source missing header: Mandated time');
  if(ixServices<0)out.errors.push('Source missing header: Services');
  out.gates.requiredSourceHeaders=ixMps>=0&&ixHours>=0&&ixServices>=0;
  if(!out.gates.requiredSourceHeaders)return out;

  var abcSourceByMps={};
  for(var sr=1;sr<sv.length;sr++){
    var sourceRow=sv[sr]||[];
    var sourceMps=String(sourceRow[ixMps]||'').trim();
    if(!sourceMps)continue;
    out.counts.sourcePhysicalRows++;
    var sourceService=String(sourceRow[ixServices]||'').trim();
    if(!ModelCEcasAnnualImport_isAbcService_(sourceService)){out.counts.ignoredOtherServiceRows++;continue;}
    var sourceHours=Number(String(sourceRow[ixHours]===null||sourceRow[ixHours]===undefined?'':sourceRow[ixHours]).trim().replace(',','.'));
    if(!isFinite(sourceHours)||sourceHours<=0){out.errors.push('Invalid Mandated time for MPS-ABC '+sourceMps+' at source row '+(sr+1));continue;}
    var item={mpsNumber:sourceMps,mandatedHours:sourceHours,sourceRow:sr+1,cycleYear:year};
    if(abcSourceByMps[sourceMps]){
      if(Math.abs(abcSourceByMps[sourceMps].mandatedHours-sourceHours)>0.000001)out.errors.push('Conflicting duplicate MPS-ABC rows for '+sourceMps+': '+abcSourceByMps[sourceMps].mandatedHours+' vs '+sourceHours);
      else out.counts.duplicateAbcRowsCollapsed++;
      continue;
    }
    abcSourceByMps[sourceMps]=item;
  }
  out.counts.sourceRows=Object.keys(abcSourceByMps).length;

  var companyIndex=ModelCEcasAnnualImport_companyIndex_(companies,out.errors);
  var completed=realized?ModelCEcasAnnualImport_completedIndex_(realized,year):{};
  var csRows=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues()),obRows=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var csByCompany={},obByNatural={},sourceCompanyUids={};
  csRows.forEach(function(x){
    if(String(x.ScopeCode||'')!==MODEL_C_ECAS_SCOPE_CODE)return;
    var uid=String(x.Company_UID||'');
    if(csByCompany[uid]&&String(csByCompany[uid].Company_Scope_ID)!==String(x.Company_Scope_ID))out.errors.push('Duplicate MPS-ABC Company Scope for '+uid);
    csByCompany[uid]=x;
  });
  obRows.forEach(function(x){
    if(String(x.ScopeCode||'')!==MODEL_C_ECAS_SCOPE_CODE)return;
    var nk=String(x.Company_Scope_ID||'')+'|'+String(x.Cycle_Key||'')+'|'+String(x.Trigger_Source||'').toUpperCase();
    if(obByNatural[nk]&&String(obByNatural[nk].Obligation_ID)!==String(x.Obligation_ID))out.errors.push('Duplicate MPS-ABC obligation natural key '+nk);
    obByNatural[nk]=x;
  });

  Object.keys(abcSourceByMps).sort().forEach(function(mps){
    var sourceItem=abcSourceByMps[mps],hours=sourceItem.mandatedHours;
    var company=companyIndex[mps];
    if(!company){out.errors.push('MPS-nummer not found in Companies.Number: '+mps);return;}
    out.counts.matchedCompanies++;
    var uid=company.companyUid;sourceCompanyUids[uid]=sourceItem;
    if(completed[uid]){
      out.counts.completedAlready++;
      out.actions.push(ModelCEcasAnnualImport_action_('SKIP_COMPLETED',sourceItem,company,null,null,['REALIZED_AUDIT_ALREADY_COMPLETED']));
      return;
    }

    var scope=csByCompany[uid]||null;
    var action=ModelCEcasAnnualImport_action_('UPSERT',sourceItem,company,scope,null,[]);
    if(!scope){out.counts.createCompanyScopes++;action.reasons.push('CREATE_COMPANY_SCOPE');}
    else if(String(scope.Active||'').toUpperCase()!=='YES'){out.counts.reactivateCompanyScopes++;action.reasons.push('REACTIVATE_COMPANY_SCOPE');}

    var obligation=scope?obByNatural[String(scope.Company_Scope_ID||'')+'|'+year+'|'+MODEL_C_ECAS_TRIGGER_SOURCE]:null;
    action.obligationId=obligation?String(obligation.Obligation_ID||''):'';
    if(!obligation){
      out.counts.createObligations++;action.reasons.push('CREATE_OBLIGATION');
    }else{
      out.counts.existingSameCycle++;
      var state=String(obligation.Obligation_State||'').toUpperCase();
      if(state==='COMPLETED'){
        out.counts.completedAlready++;action.action='SKIP_COMPLETED';action.reasons=['EXISTING_COMPLETED_OBLIGATION'];
      }else if(state==='CANCELLED'||state==='REJECTED'){
        out.counts.conflicts++;action.action='CONFLICT';action.reasons=['CLOSED_SAME_CYCLE_'+state];out.errors.push('Closed MPS-ABC obligation already exists for '+mps+' / '+year+' ('+state+')');
      }else{
        var existingHours=Number(String(obligation.Formal_Hours||'').replace(',','.'));
        if(!isFinite(existingHours)||existingHours<=0)out.counts.zeroFormalHoursCanonical++;
        if(!isFinite(existingHours)||Math.abs(existingHours-hours)>0.000001){out.counts.updateHours++;action.reasons.push('UPDATE_FORMAL_HOURS');}
        else{out.counts.unchanged++;if(!action.reasons.length)action.reasons.push('UNCHANGED');}
        if(obligation.Base_Expiry_Date||obligation.Effective_Expiry_Date)out.errors.push('MPS-ABC same-cycle obligation contains certificate expiry for '+mps);
        var wf=String(obligation.Planning_Window_From||'').trim(),wt=String(obligation.Planning_Window_To||'').trim();
        if(wf&&wt)out.counts.completePlanningWindows++;else out.counts.incompletePlanningWindows++;
      }
    }
    out.actions.push(action);
  });

  Object.keys(csByCompany).forEach(function(uid){
    var scope=csByCompany[uid];
    var ob=obByNatural[String(scope.Company_Scope_ID||'')+'|'+year+'|'+MODEL_C_ECAS_TRIGGER_SOURCE];
    if(!ob||ModelCEcasAnnualImport_terminalObligation_(ob)||sourceCompanyUids[uid])return;
    out.counts.staleCanonicalNotInSource++;
    var c=ModelCEcasAnnualImport_companyByUid_(companyIndex,uid);
    out.actions.push({action:'STALE_CANONICAL_NOT_IN_SOURCE',companyUid:uid,company:c?c.companyName:'',mpsNumber:c?c.mpsNumber:'',obligationId:String(ob.Obligation_ID||''),cycleYear:year,formalHours:Number(ob.Formal_Hours||0),reasons:['CANONICAL_SAME_CYCLE_NOT_PRESENT_IN_SOURCE']});
  });

  if(out.counts.staleCanonicalNotInSource)out.warnings.push(out.counts.staleCanonicalNotInSource+' same-cycle canonical MPS-ABC obligation(s) are not present in the source; no automatic deletion/deactivation will occur.');
  if(out.counts.incompletePlanningWindows)out.warnings.push(out.counts.incompletePlanningWindows+' source/canonical MPS-ABC obligation(s) have no complete canonical planning window; this is allowed for ECAS ABC and no window will be invented.');

  out.gates.sourceRowsPresent=out.counts.sourceRows>0;
  out.gates.allCompaniesMatched=out.counts.matchedCompanies===out.counts.sourceRows&&!out.errors.some(function(x){return x.indexOf('MPS-nummer not found')===0;});
  out.gates.noConflicts=out.counts.conflicts===0;
  out.gates.noCertificateLifecycleLeak=!out.errors.some(function(x){return x.indexOf('MPS-ABC same-cycle obligation contains certificate expiry')===0;});
  out.gates.explicitBatchYearOwner=out.gates.explicitBatchYear;
  out.gates.sourceMetadataIgnored=true;
  out.gates.planningWindowsPreservedNotInvented=true;
  out.gates.directAuditPlanningWrite=false;
  out.success=out.errors.length===0&&out.gates.explicitBatchYear&&out.gates.abcConfiguredNonRecurring&&out.gates.requiredSourceHeaders&&out.gates.sourceRowsPresent&&out.gates.noConflicts&&out.gates.allCompaniesMatched;
  return out;
}

function ModelCEcasAnnualImport_action_(kind,sourceItem,company,scope,obligation,reasons){
  return{action:kind,mpsNumber:sourceItem.mpsNumber,companyUid:company.companyUid,company:company.companyName||'',mandatedHours:sourceItem.mandatedHours,sourceRow:sourceItem.sourceRow,cycleYear:sourceItem.cycleYear,companyScopeId:scope?String(scope.Company_Scope_ID||''):'',obligationId:obligation?String(obligation.Obligation_ID||''):'',reasons:(reasons||[]).slice()};
}

function ModelCEcasAnnualImport_companyIndex_(sheet,errors){
  var v=sheet.getDataRange().getValues(),h=v[0]||[],m=ModelCFoundation_headerMap_(h),ixNumber=ModelCEcasAnnualImport_header_(m,['Number','MPS-nummer','MPS nummer']),ixUid=ModelCEcasAnnualImport_header_(m,['Company_UID','Company UID']),ixName=ModelCEcasAnnualImport_header_(m,['Company','Company name','Name']);
  if(ixNumber<0||ixUid<0){errors.push('Companies missing Number or Company_UID');return{};}
  var out={};
  for(var r=1;r<v.length;r++){
    var number=String(v[r][ixNumber]||'').trim(),uid=String(v[r][ixUid]||'').trim();
    if(!number)continue;
    if(out[number]&&out[number].companyUid!==uid)errors.push('Duplicate Companies.Number: '+number);
    out[number]={mpsNumber:number,companyUid:uid,companyName:ixName>=0?String(v[r][ixName]||'').trim():'',row:r+1};
  }
  return out;
}

function ModelCEcasAnnualImport_companyByUid_(index,uid){var found=null;Object.keys(index||{}).some(function(k){if(String(index[k].companyUid||'')===String(uid||'')){found=index[k];return true;}return false;});return found;}

function ModelCEcasAnnualImport_completedIndex_(sheet,year){
  var v=sheet.getDataRange().getValues();if(v.length<2)return{};
  var h=v[0]||[],m=ModelCFoundation_headerMap_(h),ixUid=ModelCEcasAnnualImport_header_(m,['Company_UID','Company UID']),ixYear=ModelCEcasAnnualImport_header_(m,['Year','Audit year']),ixCompleted=ModelCEcasAnnualImport_header_(m,['Date completed','Completed date','Completion date']),ixPlanned=ModelCEcasAnnualImport_header_(m,['Date planned','Planned date','Audit date']),ixStatus=ModelCEcasAnnualImport_header_(m,['Status']);
  var out={};if(ixUid<0)return out;
  for(var r=1;r<v.length;r++){
    var uid=String(v[r][ixUid]||'').trim();if(!uid)continue;
    if(ixStatus>=0&&String(v[r][ixStatus]||'').trim().toUpperCase()!=='COMPLETED')continue;
    var y='';
    if(ixYear>=0)y=String(v[r][ixYear]||'').trim().slice(0,4);
    if(!/^20\d{2}$/.test(y)&&ixCompleted>=0)y=ModelCEcasAnnualImport_yearFromValue_(v[r][ixCompleted],sheet.getParent());
    if(!/^20\d{2}$/.test(y)&&ixPlanned>=0)y=ModelCEcasAnnualImport_yearFromValue_(v[r][ixPlanned],sheet.getParent());
    if(y===String(year))out[uid]=true;
  }
  return out;
}

function ModelCEcasAnnualImport_terminalObligation_(ob){var s=String((ob&&ob.Obligation_State)||'').toUpperCase();return s==='COMPLETED'||s==='CANCELLED'||s==='REJECTED';}
function ModelCEcasAnnualImport_yearFromValue_(v,ss){if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone(),'yyyy');var s=String(v||'').trim(),m=s.match(/(20\d{2})/);return m?m[1]:'';}
function ModelCEcasAnnualImport_header_(map,names){for(var i=0;i<names.length;i++){var k=ModelCFoundation_normHeader_(names[i]);if(map[k]!==undefined)return map[k];}return-1;}
function ModelCEcasAnnualImport_isAbcService_(v){var s=String(v||'').trim().toUpperCase();if(s==='MPS-ABC')return true;return s.split(/[;,|]/).map(function(x){return x.trim();}).indexOf('MPS-ABC')>=0;}

function ModelCEcasAnnualImport_compact_(out){
  out=out||{};
  var noteworthy=(out.actions||[]).filter(function(a){return a.action!=='UPSERT'||(a.reasons||[]).some(function(r){return r!=='UNCHANGED';});});
  return{success:out.success===true,build:out.build,batchYear:out.batchYear,sourceMode:out.sourceMode,readOnly:out.readOnly===true,writesPerformed:out.writesPerformed===true,sourceSheet:out.sourceSheet,counts:out.counts||{},gates:out.gates||{},errors:(out.errors||[]).slice(0,25),warnings:(out.warnings||[]).slice(0,25),noteworthyActions:noteworthy.slice(0,30)};
}
