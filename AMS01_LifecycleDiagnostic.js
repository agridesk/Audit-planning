/**
 * FILE: AMS01_LifecycleDiagnostic.js
 * BUILD: AMS01_LIFECYCLE_DIAGNOSTIC_20260908_R1
 * Read-only lifecycle hot-path diagnostic. No status or metadata writes.
 */
var AMS01_LIFECYCLE_DIAG_BUILD='AMS01_LIFECYCLE_DIAGNOSTIC_20260908_R1';

function AMS01_RunLifecycleDiagnostic(){
  var auditId='AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var ss=SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.getActive();
  var sh=ss.getSheetByName('Audit planning');
  var lastCol=sh.getLastColumn();
  var headers=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
  var out={build:AMS01_LIFECYCLE_DIAG_BUILD,auditId:auditId,probes:[]};
  function p(label,fn){var t0=Date.now(),r=null,e='';try{r=fn();}catch(x){e=String(x&&x.message?x.message:x);}out.probes.push({label:label,wallMs:Date.now()-t0,result:r,error:e});}

  p('Resolve target fallback by auditId',function(){
    var r=lifecycle_resolveSheetTarget_({auditId:auditId});
    return {success:!!(r&&r.success),rowIndex:r&&r.rowIndex||0,headers:r&&r.headers?r.headers.length:0};
  });

  p('Resolve target direct',function(){
    var r=lifecycle_resolveSheetTarget_({auditId:auditId,sheet:sh,rowIndex:68,headers:headers});
    return {success:!!(r&&r.success),rowIndex:r&&r.rowIndex||0,headers:r&&r.headers?r.headers.length:0};
  });

  p('Build status-since updates',function(){
    var target={success:true,sheet:sh,rowIndex:68,headers:headers},u=[];
    lifecycle_addCellUpdate_(u,target,['Status since'],'TEST');
    return {count:u.length,cols:u.map(function(x){return x.col;})};
  });

  p('Build manager metadata updates',function(){
    var target={success:true,sheet:sh,rowIndex:68,headers:headers},u=[];
    lifecycle_addCellUpdate_(u,target,['Last manager decision'],'APPROVE');
    lifecycle_addCellUpdate_(u,target,['Last decision timestamp'],'TEST');
    lifecycle_addCellUpdate_(u,target,['Manager comment (last)'],'');
    return {count:u.length,cols:u.map(function(x){return x.col;})};
  });

  p('Lifecycle cache invalidation only',function(){
    var r=Lifecycle_invalidateAfterLifecycleChange_({auditId:auditId});
    return {success:!!(r&&r.success),events:r&&r.events?r.events.length:0,errors:r&&r.errors?r.errors:[]};
  });

  var compact={build:out.build,auditId:auditId,probes:out.probes.map(function(x){return {label:x.label,wallMs:x.wallMs,result:x.result,error:x.error};}),totalMs:out.probes.reduce(function(s,x){return s+x.wallMs;},0)};
  Logger.log('[AMS01_LIFECYCLE_DIAG] '+JSON.stringify(compact));
  return compact;
}
