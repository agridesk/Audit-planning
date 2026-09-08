/**
 * FILE: zz_AMS01_SaveTargetRowContextPerfOverride.js
 * BUILD: AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_20260908_R1
 *
 * DEV hot-path routing shim only.
 *
 * RCA:
 * saveManagerPlanning() begins by calling __mp_getSheetDataCached_(..., 'Audit planning')
 * for company constraints. Toolkit open and Save are separate google.script.run
 * executions, so the historical assumption that openFast had already primed this
 * execution cache is false. Without this shim, Save can read the entire Audit
 * planning sheet before later using the targeted canonical row-index service.
 *
 * Change:
 * - Before the canonical save runs, fetch the current audit through the canonical
 *   __mp_getAuditPlanningRow_ owner.
 * - Seed the EXISTING execution cache contract with header + target row only.
 * - The canonical save function, validators, StatusMachine, AvailabilityService,
 *   Notification Queue and all writes remain unchanged.
 *
 * Safety:
 * - Audit ID remains the canonical key.
 * - Cache is execution-local only and cannot outlive this server execution.
 * - If targeted row lookup is unavailable/fails, canonical save runs unchanged.
 */
var AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD='AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_20260908_R1';

(function(){
  if(typeof saveManagerPlanning!=='function') return;
  var canonicalSaveManagerPlanning_=saveManagerPlanning;

  function clean_(v){ return String(v==null?'':v).trim(); }

  saveManagerPlanning=function(auditId,payload){
    var t0=Date.now();
    var id=auditId;
    var pl=payload;

    // Preserve canonical alternate argument-order tolerance.
    if(id && typeof id==='object' && id!==null && (typeof pl==='string' || typeof pl==='undefined')){
      var tmp=pl; pl=id; id=tmp;
    }
    id=clean_(id);

    var seeded=false;
    var source='';
    var rowNumber=0;
    var prepMs=0;

    try{
      if(id && typeof __mp_getAuditPlanningRow_==='function' &&
         typeof __MP_EXEC_CACHE==='object' && __MP_EXEC_CACHE){
        var ss=SpreadsheetApp.getActive();
        var r0=Date.now();
        var pack=__mp_getAuditPlanningRow_(ss,id);
        prepMs=Date.now()-r0;
        if(pack && pack.sh && pack.hdr && pack.row && pack.rowNumber){
          // Existing __mp_getSheetDataCached_ contract: {sh,data,hdr}.
          // Only callers that need the current audit during this save use this
          // execution-local Audit planning view.
          __MP_EXEC_CACHE['SHEET:Audit planning']={
            sh:pack.sh,
            hdr:(pack.hdr||[]).slice(),
            data:[(pack.hdr||[]).slice(),(pack.row||[]).slice()],
            __ams01TargetRowOnly:true,
            __ams01AuditId:id,
            __ams01RowNumber:Number(pack.rowNumber||0)
          };
          seeded=true;
          source=pack.execRowHit?'EXEC_ROW':(pack.indexFromCache?'TARGETED_CACHE':'TARGETED_COLD');
          rowNumber=Number(pack.rowNumber||0);
        }
      }
    }catch(eSeed){
      try{Logger.log('[AMS01_SAVE_TARGET_ROW_CONTEXT_FAIL] '+JSON.stringify({build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD,auditId:id,error:String(eSeed&&eSeed.message?eSeed.message:eSeed)}));}catch(_eLog){}
    }

    try{
      Logger.log('[AMS01_SAVE_TARGET_ROW_CONTEXT] '+JSON.stringify({
        build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD,
        auditId:id,
        seeded:seeded,
        source:source,
        rowNumber:rowNumber,
        prepMs:prepMs
      }));
    }catch(_eLog2){}

    var result=canonicalSaveManagerPlanning_.apply(this,arguments);
    try{
      if(result && typeof result==='object'){
        result.ams01TargetRowContext={
          build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD,
          seeded:seeded,
          source:source,
          prepMs:prepMs,
          wrapperWallMs:Date.now()-t0
        };
      }
    }catch(_eResult){}
    return result;
  };
})();

function AMS01_SaveTargetRowContextPerfStatus(){
  return {success:true,active:true,build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD};
}
