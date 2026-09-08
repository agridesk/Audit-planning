/**
 * FILE: zz_AMS01_ToolkitManagerOpenLiteOverride.js
 * BUILD: AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R1
 * DEV-only late-load routing optimization.
 *
 * Problem:
 * - ManagerPlanningUI_boot currently invokes getToolkitOpenFastV5() as the
 *   manager primary route even though ToolkitOpenBundle already proved the
 *   Manager Lite context equivalent for first-paint planning fields.
 *
 * Change:
 * - Manager calls to getToolkitOpenFastV5() are transparently routed to
 *   getToolkitOpenLiteV5(auditId).
 * - Locked AUDITOR/self-planning calls remain on canonical Fast unchanged.
 * - No calendar, qualification, status, planning or availability truth changes.
 */
var AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD='AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R1';

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
      try{
        Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_LITE] '+JSON.stringify({
          build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,
          auditId:String(auditId||'').trim(),
          role:role||'MANAGER',
          ms:Date.now()-t0,
          success:!!(res&&res.success!==false)
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
