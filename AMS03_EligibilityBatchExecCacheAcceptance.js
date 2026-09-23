/***********************************************************************
 * AMS03_EligibilityBatchExecCacheAcceptance.js
 * BUILD: 2026-09-23_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE_R2
 * Read-only runtime acceptance: execution-local reuse only.
 ***********************************************************************/
function RUN_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE(){
 var r=[];function q(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 q('execCacheDeclared',typeof EBRM_EXEC_WINDOW_CACHE==='object');
 q('readWindowHelper',typeof EBRM_readWindow_==='function');
 q('buildR5',String(ELIGIBILITY_BATCH_READ_BUILD).indexOf('R5_EXEC_CACHE')>=0);
 try{
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Eligibility_Cache');
  if(!sh){q('eligibilitySheetAvailable',false,'Eligibility_Cache missing');}
  else{
   EBRM_EXEC_WINDOW_CACHE={};
   var a=EBRM_readWindow_(sh,sh.getLastRow(),sh.getLastColumn());
   var b=EBRM_readWindow_(sh,sh.getLastRow(),sh.getLastColumn());
   q('firstReadBounded',a&&a.readStrategy!=='EXEC_CACHE',a&&a.readStrategy);
   q('secondReadExecCache',b&&b.readStrategy==='EXEC_CACHE',b&&b.readStrategy);
   var live=EligibilityBatchReadModel_get({auditIds:[]});
   q('canonicalOwnerPreserved',live&&live.meta&&live.meta.canonicalOwner==='EligibilityService',live&&live.meta&&live.meta.canonicalOwner);
  }
 }catch(e){q('runtimeRead',false,String(e&&e.message||e));}
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE_R2',total:r.length,passed:r.length-f,failed:f,results:r,meta:{writes:false,newSsot:false,persistentCache:false,liveReads:true}};Logger.log(JSON.stringify(o,null,2));return o;
}
