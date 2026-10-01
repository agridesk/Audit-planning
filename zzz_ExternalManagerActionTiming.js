/***********************************************************************
 * FILE: zzz_ExternalManagerActionTiming.js
 * BUILD: 2026-10-01_EXTERNAL_MANAGER_ACTION_TIMING_R1
 * DEV diagnostics only. No lifecycle/status ownership.
 ***********************************************************************/
var EXTERNAL_MANAGER_ACTION_TIMING_BUILD='2026-10-01_EXTERNAL_MANAGER_ACTION_TIMING_R1';
var EXTERNAL_MANAGER_ACTION_TIMING_BASE_DOPOST_=doPost;

doPost=function(e){
  var p=(e&&e.parameter)?e.parameter:{};
  var rawAction=String(p.action||'').trim().toLowerCase();
  if(rawAction!=='externalmanageraction')return EXTERNAL_MANAGER_ACTION_TIMING_BASE_DOPOST_(e);

  var started=Date.now();
  var out=EXTERNAL_MANAGER_ACTION_TIMING_BASE_DOPOST_(e);
  var gasMs=Date.now()-started;
  try{
    var raw=out&&typeof out.getContent==='function'?String(out.getContent()||''):'';
    var body=raw?JSON.parse(raw):{};
    if(!body||typeof body!=='object')body={success:false,error:'TIMING_WRAPPER_INVALID_BODY'};
    body.externalManagerTiming=Object.assign({},body.externalManagerTiming||{}, {
      build:EXTERNAL_MANAGER_ACTION_TIMING_BUILD,
      gasDoPostMs:gasMs
    });
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    try{Logger.log('[EXTERNAL_MANAGER_ACTION_TIMING_WARN] '+String(err&&err.message?err.message:err));}catch(_eLog){}
    return out;
  }
};

function RUN_EXTERNAL_MANAGER_ACTION_TIMING_CONTRACT_ACCEPTANCE(){
  var out={ok:true,build:EXTERNAL_MANAGER_ACTION_TIMING_BUILD,writesPerformed:false,checks:[]};
  function check_(name,ok,detail){out.checks.push({name:name,ok:!!ok,detail:detail||''});if(!ok)out.ok=false;}
  check_('baseDoPostCaptured',typeof EXTERNAL_MANAGER_ACTION_TIMING_BASE_DOPOST_==='function','');
  check_('wrapperInstalled',typeof doPost==='function','');
  check_('devEnvironment',V5_ENTRY_isDevEnv_(),'Timing owner is intended for DEV runtime acceptance');
  try{Logger.log(JSON.stringify(out,null,2));}catch(eLog){}
  return out;
}
