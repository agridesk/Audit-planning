/**
 * AMS-01.6 Model C runtime planning-window ownership acceptance.
 * Read-only.
 */
var MODEL_C_RUNTIME_WINDOW_TEST_BUILD='2026-10-03_AMS_01_6_MODEL_C_RUNTIME_WINDOW_TESTS_R2_CONFIG_ANNUAL';

function RUN_MODEL_C_RUNTIME_WINDOW_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var ap=ss.getSheetByName('Audit planning');
  if(!ap)throw new Error('Missing Audit planning');

  var values=ap.getDataRange().getValues();
  var hdr=values[0]||[];
  var auditIdx=ModelCRuntime_headerIndex_(hdr,['Audit ID']);
  if(auditIdx<0)throw new Error('Missing Audit ID');

  var totalRows=0;
  var modelCRows=0;
  var canonicalResolved=0;
  var legacyFallback=0;
  var conflicts=0;
  var wrapperMismatches=[];
  var errors=[];
  var samples=[];

  for(var r=1;r<values.length;r++){
    var auditId=String(values[r][auditIdx]||'').trim();
    if(!auditId)continue;
    totalRows++;

    var row=values[r].slice();
    var canonical=ModelCRuntime_resolvePlanningWindow_(ss,hdr,row);
    if(!canonical||canonical.success!==true)continue;
    modelCRows++;
    if(canonical.hardBlock===true)conflicts++;

    var rowForRuntime=values[r].slice();
    var runtime=_mp_resolvePlanningWindow_(ss,hdr,rowForRuntime);
    if(runtime&&String(runtime.source||'')==='Audit_Obligations')canonicalResolved++;
    else legacyFallback++;

    if(!runtime||String(runtime.startDate||'')!==String(canonical.startDate||'')||String(runtime.endDate||'')!==String(canonical.endDate||'')){
      errors.push('Runtime/canonical mismatch: '+auditId);
    }

    if(typeof V5_resolvePlanningWindowFromAuditPlanningRow_==='function'){
      var wrapped=V5_resolvePlanningWindowFromAuditPlanningRow_(hdr,rowForRuntime,runtime);
      if(!wrapped||String(wrapped.startDate||'')!==String(canonical.startDate||'')||String(wrapped.endDate||'')!==String(canonical.endDate||'')){
        wrapperMismatches.push(auditId);
      }
    }

    if(samples.length<5)samples.push({auditId:auditId,startDate:canonical.startDate,endDate:canonical.endDate,mode:canonical.mode,scopes:canonical.activeScopes});
  }

  if(modelCRows===0)errors.push('No Audit planning rows resolved from Model C');
  if(canonicalResolved!==modelCRows)errors.push('Not all Model C rows resolve canonically at runtime: '+canonicalResolved+'/'+modelCRows);
  if(legacyFallback>0)errors.push('Legacy fallback used for '+legacyFallback+' Model C row(s)');
  if(wrapperMismatches.length)errors.push('Legacy toolkit wrapper overrides canonical window for '+wrapperMismatches.length+' row(s)');

  var out={
    success:errors.length===0,
    build:MODEL_C_RUNTIME_WINDOW_TEST_BUILD,
    runtimeBuild:typeof MODEL_C_RUNTIME_WINDOW_BUILD!=='undefined'?MODEL_C_RUNTIME_WINDOW_BUILD:'',
    readOnly:true,
    writesPerformed:false,
    gates:{
      modelCRowsFound:modelCRows>0,
      allModelCRowsCanonical:canonicalResolved===modelCRows,
      noLegacyFallbackForModelC:legacyFallback===0,
      toolkitWrapperPreservesCanonical:wrapperMismatches.length===0
    },
    counts:{
      auditPlanningRows:totalRows,
      modelCRows:modelCRows,
      canonicalResolved:canonicalResolved,
      legacyFallback:legacyFallback,
      windowConflicts:conflicts,
      wrapperMismatches:wrapperMismatches.length
    },
    errors:errors,
    wrapperMismatchAuditIds:wrapperMismatches.slice(0,20),
    samples:samples
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C runtime window acceptance failed: '+errors.join('; '));
  return out;
}


function RUN_MODEL_C_CONFIG_ANNUAL_WINDOW_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var cfgMap=ModelCPlanningWindowPolicy_configMap_(ss),cfg=cfgMap['MPS-ABC'];
  if(!cfg)throw new Error('MPS-ABC missing from Config_Scopes');
  if(cfg.obligationCycle!=='ANNUAL')throw new Error('MPS-ABC Obligation cycle must be ANNUAL');
  if(!/^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(cfg.completeBy))throw new Error('MPS-ABC Complete by invalid');

  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  if(!obSheet)throw new Error('Missing Audit_Obligations');
  var obs=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var target=null;
  for(var i=0;i<obs.length;i++){
    var o=obs[i]||{},state=String(o.Obligation_State||'').toUpperCase();
    if(String(o.ScopeCode||'').toUpperCase()!=='MPS-ABC')continue;
    if(state==='COMPLETED'||state==='CANCELLED'||state==='REJECTED')continue;
    if(!/^20\d{2}$/.test(String(o.Cycle_Key||'')))continue;
    if(String(o.Planning_Window_From||'').trim()||String(o.Planning_Window_To||'').trim())continue;
    target=o;break;
  }
  if(!target)throw new Error('No open MPS-ABC annual obligation without explicit window found');

  var cycle=String(target.Cycle_Key),deadline=cycle+'-'+cfg.completeBy,cycleStart=cycle+'-01-01';
  var hasFrom=cfg.planningFromRaw!=='',hasTo=cfg.planningToRaw!=='';
  if(hasFrom!==hasTo)throw new Error('MPS-ABC Config_Scopes has partial planning window offsets');
  var expectedFrom=cycleStart,expectedTo=deadline;
  if(hasFrom&&hasTo){
    var fm=Number(String(cfg.planningFromRaw).replace(',','.')),tm=Number(String(cfg.planningToRaw).replace(',','.'));
    if(!isFinite(fm)||!isFinite(tm))throw new Error('MPS-ABC planning offsets invalid');
    expectedFrom=ModelCPlanningWindowPolicy_addMonthsIso_(deadline,fm);
    expectedTo=ModelCPlanningWindowPolicy_addMonthsIso_(deadline,tm);
    if(expectedFrom<cycleStart)expectedFrom=cycleStart;
    if(expectedTo>deadline)expectedTo=deadline;
  }

  var resolved=ModelCPlanningWindowPolicy_resolveObligation_(ss,target,cfgMap);
  var out={
    success:!!(resolved&&resolved.success===true&&resolved.startDate===expectedFrom&&resolved.endDate===expectedTo&&resolved.reason==='NON_RECURRING_CONFIG_ANNUAL_WINDOW'),
    build:MODEL_C_RUNTIME_WINDOW_TEST_BUILD,
    readOnly:true,
    writesPerformed:false,
    scopeCode:String(target.ScopeCode||''),
    cycleKey:cycle,
    config:{completeBy:cfg.completeBy,planningFrom:cfg.planningFromRaw,planningTo:cfg.planningToRaw},
    expected:{startDate:expectedFrom,endDate:expectedTo},
    resolved:resolved
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Config-driven annual window acceptance failed');
  return out;
}
