/** AMS-01.6 canonicalization regression acceptance. */
var MODEL_C_CANONICALIZATION_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_CANONICALIZATION_ACCEPTANCE_R3';

function RUN_MODEL_C_CANONICALIZATION_ACCEPTANCE(){
  var out={success:false,build:MODEL_C_CANONICALIZATION_ACCEPTANCE_BUILD,writesPerformed:true,gates:{},recurring:null,auditorProjection:null,annualRouting:null,errors:[]};
  try{
    out.recurring=RUN_MODEL_C_RECURRING_CONFIG_ACCEPTANCE();
    out.gates.recurringLifecycle=!!(out.recurring&&out.recurring.success===true);
  }catch(e1){out.gates.recurringLifecycle=false;out.errors.push('Recurring lifecycle: '+String(e1&&e1.message?e1.message:e1));}
  try{
    out.auditorProjection=RUN_MODEL_C_AUDITOR_EXPIRY_ACCEPTANCE();
    out.gates.auditorProjection=!!(out.auditorProjection&&out.auditorProjection.success===true);
  }catch(e2){out.gates.auditorProjection=false;out.errors.push('Auditor projection: '+String(e2&&e2.message?e2.message:e2));}
  try{
    out.annualRouting=RUN_MODEL_C_ANNUAL_CYCLE_ROUTE_ACCEPTANCE();
    out.gates.annualRoutingRollback=!!(out.annualRouting&&out.annualRouting.success===true&&out.annualRouting.rolledBack===true&&out.annualRouting.gates&&out.annualRouting.gates.postRestorePreflightGreen===true);
  }catch(e3){out.gates.annualRoutingRollback=false;out.errors.push('Annual routing: '+String(e3&&e3.message?e3.message:e3));}
  out.gates.safeSnapshotCanonical=typeof MODEL_C_SCOPE_OWNER_BUILD!=='undefined'&&String(MODEL_C_SCOPE_OWNER_BUILD).indexOf('R8_CANONICAL')>=0&&typeof MODEL_C_SAFE_SNAPSHOT_BUILD==='undefined';
  if(!out.gates.safeSnapshotCanonical)out.errors.push('Safe snapshot override still present or canonical scope owner build not loaded');
  out.success=Object.keys(out.gates).every(function(k){return out.gates[k]===true;})&&out.errors.length===0;
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C canonicalization acceptance failed');
  return out;
}
