/**
 * FILE: zz_AMS01_StatusPackIndexPerfOverride.js
 * BUILD: AMS01_STATUS_PACK_INDEX_PERF_ZZ_20260909_R1
 *
 * AMS-01 targeted open-path correction.
 *
 * CoreStatusMachine status actions mutate fields in an EXISTING Audit planning
 * row; they do not insert/delete/reorder rows. The canonical invalidator used to
 * call __mp_invalidateAuditPlanningPack_(), which also deleted the persistent
 * Audit ID -> row-number index. The next Toolkit open then rebuilt the entire
 * Audit planning sheet index (~2.2s in the 2026-09-09 measured run).
 *
 * This late override keeps content freshness while preserving the structural
 * row-number index:
 * - bumps row-payload generation so stale cached row contents cannot survive;
 * - bumps planning-window generation;
 * - clears request-scoped row payloads;
 * - invalidates the general persistent Audit planning sheet cache used by grids;
 * - DOES NOT delete the Audit ID -> row-number index, because row positions are
 *   unchanged by StatusMachine actions.
 *
 * Structural operations outside StatusMachine still retain the original
 * __mp_invalidateAuditPlanningPack_() contract and may rebuild the index.
 */
var AMS01_STATUS_PACK_INDEX_PERF_ZZ_BUILD='AMS01_STATUS_PACK_INDEX_PERF_ZZ_20260909_R1';

function Status_invalidateAuditPlanningPack_(){
  var t0=Date.now();
  try{if(typeof __mp_apRowGenBump_==='function')__mp_apRowGenBump_();}catch(e0){}
  try{if(typeof _mp_pwGenBump_==='function')_mp_pwGenBump_();}catch(e1){}
  try{if(typeof __mp_apExecRowsClear_==='function')__mp_apExecRowsClear_();}catch(e2){}
  try{
    if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE){
      delete __MP_EXEC_CACHE['SHEET:Audit planning'];
    }
  }catch(e3){}
  try{if(typeof __mp_invalidatePersistCaches_==='function')__mp_invalidatePersistCaches_(['Audit planning']);}catch(e4){}
  try{Logger.log('[AMS01_STATUS_PACK_INDEX] '+JSON.stringify({build:AMS01_STATUS_PACK_INDEX_PERF_ZZ_BUILD,preservedStructuralIndex:true,ms:Date.now()-t0}));}catch(e5){}
}

function AMS01_StatusPackIndexPerfStatus(){
  return {success:true,active:true,build:AMS01_STATUS_PACK_INDEX_PERF_ZZ_BUILD,preservesStructuralIndex:true,rowPayloadGenerationInvalidated:true};
}
