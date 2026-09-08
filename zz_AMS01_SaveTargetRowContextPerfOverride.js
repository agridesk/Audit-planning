/**
 * FILE: zz_AMS01_SaveTargetRowContextPerfOverride.js
 * BUILD: AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_20260908_R3
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
 * - Preserve the target's REAL physical row position in the synthetic data array,
 *   because V5_findAuditPlanningRowById_ derives row numbers from that contract.
 * - Add a compact performance summary derived only from canonical debugTiming.
 *   No extra Spreadsheet/Cache/Lock calls are introduced for instrumentation.
 * - The canonical save function, validators, StatusMachine, AvailabilityService,
 *   Notification Queue and all writes remain unchanged.
 *
 * Safety:
 * - Audit ID remains the canonical key.
 * - Cache is execution-local only and cannot outlive this server execution.
 * - If targeted row lookup is unavailable/fails, canonical save runs unchanged.
 */
var AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD='AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_20260908_R3';

(function(){
  if(typeof saveManagerPlanning!=='function') return;
  var canonicalSaveManagerPlanning_=saveManagerPlanning;

  function clean_(v){ return String(v==null?'':v).trim(); }
  function ms_(dbg,key){
    try{return dbg&&dbg[key]&&isFinite(Number(dbg[key].ms))?Number(dbg[key].ms):null;}catch(e){return null;}
  }
  function delta_(a,b){
    return (a!==null&&b!==null&&isFinite(a)&&isFinite(b))?Math.max(0,b-a):null;
  }
  function compactPerf_(result,prepMs,wrapperWallMs){
    var d=(result&&result.debugTiming)||{};
    var company=ms_(d,'companyConstraints');
    var role=ms_(d,'roleContext');
    var qual=ms_(d,'qualificationGuard');
    var lock=ms_(d,'lockAcquired');
    var avVal=ms_(d,'V5_availabilityValidate_');
    var avWrite=ms_(d,'V5_availabilityWriteBack_');
    var status=ms_(d,'Status_applyAction_PLAN');
    var artifact=ms_(d,'V5_syncAuditArtifactsAfterPlanningSave_');
    var tailOpen=ms_(d,'tail_openInvalidated');
    var tailCal=ms_(d,'tail_calInvalidated');
    var total=(result&&isFinite(Number(result.totalMs)))?Number(result.totalMs):ms_(d,'tail_returnReady');
    return {
      prepTargetRowMs:Number(prepMs||0),
      companyConstraintsCumMs:company,
      roleContextDeltaMs:delta_(company,role),
      qualificationDeltaMs:delta_(role,qual),
      lockWaitDeltaMs:delta_(qual,lock),
      availabilityValidateDeltaMs:delta_(lock,avVal),
      availabilityWriteDeltaMs:delta_(avVal,avWrite),
      statusNotifyLifecycleDeltaMs:delta_(avWrite,status),
      postStatusToArtifactDeltaMs:delta_(status,artifact),
      tailOpenDeltaMs:delta_(artifact,tailOpen),
      tailCalendarDeltaMs:delta_(tailOpen,tailCal),
      canonicalTotalMs:total,
      wrapperWallMs:Number(wrapperWallMs||0)
    };
  }

  function seedTargetRowView_(pack,id){
    if(!pack||!pack.sh||!pack.hdr||!pack.row||!pack.rowNumber) return false;
    if(typeof __MP_EXEC_CACHE!=='object'||!__MP_EXEC_CACHE) return false;

    var physicalRow=Number(pack.rowNumber||0);
    if(physicalRow<2) return false;
    var hdr=(pack.hdr||[]).slice();
    var row=(pack.row||[]).slice();

    // Dense empty rows preserve physical row numbering for legacy callers that
    // derive rowNumber from the array index. Empty arrays are safe for their
    // column lookups and keep payload tiny compared with 92-column real rows.
    var data=new Array(physicalRow);
    data[0]=hdr;
    for(var i=1;i<physicalRow-1;i++) data[i]=[];
    data[physicalRow-1]=row;

    __MP_EXEC_CACHE['SHEET:Audit planning']={
      sh:pack.sh,
      hdr:hdr,
      data:data,
      __ams01TargetRowOnly:true,
      __ams01AuditId:id,
      __ams01RowNumber:physicalRow
    };

    // __mp_getAuditPlanningPack_ is object-cached separately. Seed its exact
    // contract too so V5_findAuditPlanningRowById_ returns the physical row
    // without rebuilding/scanning the synthetic view.
    var headerMap={};
    for(var h=0;h<hdr.length;h++) headerMap[String(hdr[h]||'').trim()]=h;
    var rowByAuditId={};
    rowByAuditId[id]=physicalRow;
    __MP_EXEC_CACHE['OBJ:AUDIT_PLANNING_PACK']={
      ss:SpreadsheetApp.getActive(),
      sh:pack.sh,
      hdr:hdr,
      data:data,
      headerMap:headerMap,
      rowByAuditId:rowByAuditId,
      lastCol:hdr.length,
      __ams01TargetRowOnly:true
    };
    return true;
  }

  saveManagerPlanning=function(auditId,payload){
    var t0=Date.now();
    var id=auditId;
    var pl=payload;

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
          seeded=seedTargetRowView_(pack,id);
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
        var wall=Date.now()-t0;
        result.ams01TargetRowContext={
          build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD,
          seeded:seeded,
          source:source,
          rowNumber:rowNumber,
          prepMs:prepMs,
          wrapperWallMs:wall
        };
        result.ams01PerfSummary=compactPerf_(result,prepMs,wall);
      }
    }catch(_eResult){}
    return result;
  };
})();

function AMS01_SaveTargetRowContextPerfStatus(){
  return {success:true,active:true,build:AMS01_SAVE_TARGET_ROW_CONTEXT_ZZ_BUILD};
}
