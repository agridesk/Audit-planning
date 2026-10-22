/**
 * DEV-only, read-only SWAP withdrawal verification.
 * Reports saved proposal statuses and journal stage without modifying SSOT.
 */
function RUN_DIAG_SWAP20_WITHDRAW_DEV_20261022(){
 var sp=PropertiesService.getScriptProperties();
 if(String(sp.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
    String(sp.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')
   throw Error('SWAP_WITHDRAW_DIAG_DEV_ONLY');
 var ids=[
  'SWAP20_0ca00ee9938d43d7b7cc93d271ea65f5',
  'SWAP20_23cb26f67136485b98951ba83470e3fb'
 ];
 var results=ids.map(function(id){
   var raw=sp.getProperty('AMS_SWAP20_PROPOSAL_'+id);
   if(!raw)return {operationId:id,found:false};
   var p=JSON.parse(raw);
   var events=[];
   try{events=Swap20Journal_history_(id)||[];}catch(e){events=[];}
   return {operationId:id,found:true,status:String(p.status||''),
     auditorAcknowledgements:(p.acknowledgedAuditorUids||[]).length,
     requiredAcknowledgements:(p.requiredAuditorUids||[]).length,
     withdrawnAt:p.withdrawnAt||null,
     journalStages:events.map(function(e){return e.stage||'';}),
     committed:events.some(function(e){return e.stage==='COMMITTED';})};
 });
 var output={ok:true,readOnly:true,environment:'DEV',results:results};
 Logger.log(JSON.stringify(output));return output;
}
