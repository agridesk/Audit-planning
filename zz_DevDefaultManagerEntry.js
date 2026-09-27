/***********************************************************************
 * FILE: zz_DevDefaultManagerEntry.js
 * BUILD: 2026-09-27_DEV_DEFAULT_MANAGER_ENTRY_R1
 * DEV-only: bare DEV web-app URL -> canonical Manager entry/login.
 ***********************************************************************/
var DEV_DEFAULT_MANAGER_ENTRY_BUILD='2026-09-27_DEV_DEFAULT_MANAGER_ENTRY_R1';
var DEV_DEFAULT_MANAGER_ENTRY_BASE_NORM_ACTION_=V5_ENTRY_normAction_;
V5_ENTRY_normAction_=function(raw){
  var a=String(raw||'').trim();
  if(!a){try{if(V5_ENTRY_isDevEnv_())return'manager';}catch(e){}}
  return DEV_DEFAULT_MANAGER_ENTRY_BASE_NORM_ACTION_(raw);
};
function RUN_DEV_DEFAULT_MANAGER_ENTRY_ACCEPTANCE(){
  var out={ok:true,build:DEV_DEFAULT_MANAGER_ENTRY_BUILD,writesPerformed:false,checks:[]};
  function c(name,ok){out.checks.push({name:name,ok:!!ok});if(!ok)out.ok=false;}
  c('devEnvironment',V5_ENTRY_isDevEnv_());
  c('blankActionRoutesManager',V5_ENTRY_normAction_('')==='manager');
  c('managerStillManager',V5_ENTRY_normAction_('manager')==='manager');
  c('planningWorkspacePreserved',V5_ENTRY_normAction_('planningworkspace')==='planningworkspace');
  c('planningToolkitPreserved',V5_ENTRY_normAction_('planningtoolkit')==='planningtoolkit');
  try{Logger.log(JSON.stringify(out,null,2));}catch(e){}
  return out;
}
