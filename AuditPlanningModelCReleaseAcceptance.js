/**
 * AMS-01.6 — final Model C release acceptance.
 * Read-only orchestration of the canonical acceptance gates proven during
 * the Audit planning decomposition, ECAS migration and runtime hardening.
 */
var MODEL_C_RELEASE_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_RELEASE_ACCEPTANCE_R1';

function RUN_MODEL_C_RELEASE_ACCEPTANCE(){
  var out={
    success:false,
    build:MODEL_C_RELEASE_ACCEPTANCE_BUILD,
    readOnly:true,
    writesPerformed:false,
    gates:{},
    components:{},
    errors:[]
  };

  function run_(name,fnName){
    try{
      if(typeof this[fnName]!=='function')throw new Error('Missing function: '+fnName);
      var r=this[fnName]();
      out.components[name]=r||null;
      return !!(r&&r.success===true);
    }catch(e){
      out.errors.push(name+': '+String(e&&e.message?e.message:e));
      return false;
    }
  }

  out.gates.scopeOwnerPreflight=run_.call(this,'scopeOwnerPreflight','RUN_MODEL_C_PHASE2B_SCOPE_OWNER_PREFLIGHT');
  out.gates.nonRecurringWindowPolicy=run_.call(this,'nonRecurringWindowPolicy','RUN_MODEL_C_NONRECURRING_WINDOW_POLICY_ACCEPTANCE');
  out.gates.ecasEndToEnd=run_.call(this,'ecasEndToEnd','RUN_MODEL_C_ECAS_END_TO_END_ACCEPTANCE');
  out.gates.legacyEcasRetired=run_.call(this,'legacyEcasRetired','RUN_ECAS_LEGACY_RETIREMENT_ACCEPTANCE');
  out.gates.planningSaveWindowGuard=run_.call(this,'planningSaveWindowGuard','RUN_MODEL_C_PLANNING_SAVE_WINDOW_GUARD_ACCEPTANCE');

  try{
    var src=typeof _mp_getCurrentCycleYearFromAuditRow_==='function'?String(_mp_getCurrentCycleYearFromAuditRow_):'';
    out.gates.toolkitCanonicalCycleOwnerLoaded=(
      typeof ModelCToolkitCycle_yearForAudit_==='function'&&
      src.indexOf('ModelCToolkitCycle_yearForAudit_')>=0
    );
    if(!out.gates.toolkitCanonicalCycleOwnerLoaded)out.errors.push('Toolkit canonical cycle owner is not the deployed global owner');
  }catch(eCycle){
    out.gates.toolkitCanonicalCycleOwnerLoaded=false;
    out.errors.push('toolkitCycleOwner: '+String(eCycle&&eCycle.message?eCycle.message:eCycle));
  }

  try{
    var e2e=out.components.ecasEndToEnd||{};
    var c=e2e.counts||{};
    out.gates.ecas49Canonical=(Number(c.sourceRows||0)===49&&Number(c.existingSameCycle||0)===49&&Number(c.staleCanonical||0)===0);
    if(!out.gates.ecas49Canonical)out.errors.push('ECAS canonical count invariant failed');
  }catch(eCount){
    out.gates.ecas49Canonical=false;
    out.errors.push('ecasCountInvariant: '+String(eCount&&eCount.message?eCount.message:eCount));
  }

  out.success=out.errors.length===0&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C release acceptance failed: '+out.errors.join('; '));
  return out;
}
