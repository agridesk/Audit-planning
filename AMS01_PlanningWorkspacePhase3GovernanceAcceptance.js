/***********************************************************************
 * AMS01_PlanningWorkspacePhase3GovernanceAcceptance.js
 * BUILD: 2026-09-23_AMS01_3_FAST_READ_GOVERNANCE_R2_TRIGGER_CONTRACT
 * Read-only Phase 3 governance acceptance: shared payload + cache invalidation.
 ***********************************************************************/
var AMS01_PW_PHASE3_GOV_BUILD='2026-09-23_AMS01_3_FAST_READ_GOVERNANCE_R2_TRIGGER_CONTRACT';
function RUN_AMS01_3_FAST_READ_GOVERNANCE_ACCEPTANCE(){
 var r=[];function q(n,v,d){r.push({name:n,ok:!!v,detail:v?'':String(d||'failed')});}
 var shared=RUN_AMS01_3_SHARED_PAYLOAD_CONTRACT_REGRESSION();
 q('sharedPayloadContract',shared&&shared.ok===true,JSON.stringify(shared));
 q('generationGetterAvailable',typeof AUDITOR_SCOPE_getCacheGeneration_==='function');
 q('generationBumpAvailable',typeof AUDITOR_SCOPE_bumpCacheGeneration_==='function');
 q('auditorScopeEditHandlerAvailable',typeof AUDITOR_SCOPE_ON_EDIT==='function');
 q('idempotentTriggerInstallerAvailable',typeof INSTALL_AUDITOR_SCOPE_ON_EDIT_TRIGGER==='function');
 q('eligibilityTargetedInvalidationAvailable',typeof eligService_cacheInvalidate_==='function');
 var generation='';try{generation=String(AUDITOR_SCOPE_getCacheGeneration_()||'').trim();}catch(e){}
 q('generationPresent',!!generation,generation);
 var triggers=[],installed=false;try{triggers=ScriptApp.getProjectTriggers()||[];for(var i=0;i<triggers.length;i++){var h=triggers[i]&&triggers[i].getHandlerFunction?String(triggers[i].getHandlerFunction()||''):'';if(h==='AUDITOR_SCOPE_ON_EDIT'){installed=true;break;}}}catch(eTrig){}
 q('auditorScopeOnEditTriggerInstalled',installed,'AUDITOR_SCOPE_ON_EDIT installable trigger not found');
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS01_PW_PHASE3_GOV_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,cacheGovernance:{eligibilityOwner:'EligibilityService',auditorScopeGeneration:generation,auditorScopeInvalidation:'AUDITOR_SCOPE_ON_EDIT -> RUN_AUDITOR_SCOPE_CACHE_REFRESH',triggerInstaller:'INSTALL_AUDITOR_SCOPE_ON_EDIT_TRIGGER (idempotent)',workspaceAddsPersistentCache:false},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
