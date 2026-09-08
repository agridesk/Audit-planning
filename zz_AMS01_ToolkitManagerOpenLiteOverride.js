/**
 * FILE: zz_AMS01_ToolkitManagerOpenLiteOverride.js
 * BUILD: AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R2
 * DEV-only late-load routing optimization.
 *
 * Manager Toolkit open uses the proven Lite context. R2 also exposes the
 * already-returned Lite auditors through the UI's existing auditorsBundle
 * contract, preventing a second getToolkitAuditorsV5() hydration RPC.
 *
 * Locked AUDITOR/self-planning remains on canonical Fast unchanged.
 * No calendar, qualification, status, planning or availability truth changes.
 */
var AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD='AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R2';

(function(){
  if(typeof getToolkitOpenFastV5!=='function') return;
  var canonicalFast_=getToolkitOpenFastV5;

  getToolkitOpenFastV5=function(auditId,monthKey,opts){
    opts=opts||{};
    var role=String(opts.role||'').trim().toUpperCase();
    var locked=String(opts.lockedAuditorEmail||'').trim();
    var isLockedAuditor=(role==='AUDITOR'&&!!locked);

    if(!isLockedAuditor && typeof getToolkitOpenLiteV5==='function'){
      var t0=Date.now();
      var res=getToolkitOpenLiteV5(String(auditId||'').trim());
      res=res||{};
      res.__ams01LiteContext=true;
      res.__ams01ManagerPrimaryRoute='LITE_VIA_FAST_COMPAT';
      res.__ams01ManagerPrimaryRouteBuild=AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD;
      if(typeof res.__serverMs==='undefined') res.__serverMs=Date.now()-t0;

      // ManagerPlanningUI_boot treats auditorsBundle as the signal that the
      // initial auditors are already hydrated. getToolkitOpenLiteV5 already
      // returns the same HARD-qualified first-paint list, so reuse it instead
      // of starting another server RPC.
      if(!res.auditorsBundle && Array.isArray(res.auditors)){
        res.auditorsBundle={
          success:true,
          auditors:res.auditors,
          auditorEligibilityMeta:res.auditorEligibilityMeta||{
            qualifiedFast:true,
            rotationPending:true
          },
          reusedFromLiteOpen:true,
          __serverMs:0,
          __ams01Build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD
        };
        res.auditorsBundle.auditorEligibilityMeta=res.auditorsBundle.auditorEligibilityMeta||{};
        res.auditorsBundle.auditorEligibilityMeta.rotationPending=true;
        res.auditorsBundle.auditorEligibilityMeta.reusedFromLiteOpen=true;
      }

      try{
        Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_LITE] '+JSON.stringify({
          build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,
          auditId:String(auditId||'').trim(),
          role:role||'MANAGER',
          ms:Date.now()-t0,
          success:!!(res&&res.success!==false),
          auditors:Array.isArray(res.auditors)?res.auditors.length:0,
          auditorsBundleReused:!!(res.auditorsBundle&&res.auditorsBundle.reusedFromLiteOpen)
        }));
      }catch(eLog){}
      return res;
    }

    return canonicalFast_.apply(this,arguments);
  };
})();

function AMS01_ToolkitManagerOpenLiteStatus(){
  return {success:true,active:true,build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD};
}
