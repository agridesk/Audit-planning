// SWAP + Notifications integrated acceptance report. Read-only, DEV only.
// Does not activate transaction or notification feature flags.
function RUN_ACCEPTANCE_SWAP_NOTIFICATIONS_DEV_20261021(){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV_ONLY');
 var checks=[],notes=[];
 function check(name,pass){checks.push({name:name,ok:pass===true});}
 var configured=String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 check('DEV_SSoT',configured==='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'&&
   ss.getId()===configured);
 check('SWAP_DISABLED',props.getProperty('AMS_SWAP20_COMMIT_ENABLED')!=='true');
 check('ECAS_DISABLED',String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES');
 var journal=ss.getSheetByName('AMS_Swap_20_Journal');
 check('JOURNAL_AVAILABLE',!!journal&&journal.getLastRow()>=1);
 var availability=ss.getSheetByName('Auditor Availability');
 check('AVAILABILITY_AVAILABLE',!!availability&&availability.getLastRow()>1);
 check('DATE_CODEC',typeof Swap20Journal_encodePayload_==='function'&&
   typeof Swap20Journal_decodePayload_==='function');
 check('COMMITTED_RECONCILIATION',typeof Swap20_verifyCommittedReconciliationLocked_==='function');
 check('POSTCOMMIT_INTENT',typeof Swap20_stageNotificationAfterCommitLocked_==='function');
 check('COMBINED_ECAS_PAYLOAD',typeof Swap20_buildCombinedEcasChange_==='function');
 check('DUAL_ECAS_PROVENANCE',typeof Swap20_verifyCombinedEcasProofs_==='function'&&
   typeof ECAS20_VerifyPersistedCommunication_==='function');
 var sample={operationId:'SWAP20_ACCEPTANCE_NO_WRITE',auditA:'TEST_A',auditB:'TEST_B',
   blocksA:[{date:'2026-11-02',start:'09:00',end:'12:00'}],
   blocksB:[{date:'2026-11-03',start:'09:00',end:'12:00'}],ecasComment:'Acceptance test'};
 var prior=function(id){return {auditId:id,company:'TEST',mpsNumber:'TEST',auditorName:'TEST',
  communicatedToEcas:true,communicationId:'TEST_'+id,planningDigest:'TEST_DIGEST_'+id,
  blocks:[{date:'2026-10-01',start:'09:00',end:'12:00'}]};};
 var envelope=typeof Swap20_buildCombinedEcasChange_==='function'?
   Swap20_buildCombinedEcasChange_(sample,prior('TEST_A'),prior('TEST_B')):{ok:false};
 check('COMBINED_TWO_AUDITS',envelope.ok===true&&envelope.payload&&
   envelope.payload.auditChanges.length===2&&envelope.payload.combined===true);
 check('QUEUE_FAIL_CLOSED',envelope.queueAllowed===false);
 var baseline=typeof RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021==='function'?
   RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021():{ok:false};
 check('CANONICAL_PREFLIGHT',baseline.ok===true);
 notes.push('No live manager proposal was committed');
 notes.push('No ECAS notification was queued or delivered');
 notes.push('Prior ECAS receipts and combined renderer still require live validation');
 var result={ok:checks.every(function(x){return x.ok;}),readOnly:true,checks:checks,
  integrationBuilt:true,endToEndProven:false,prodReady:false,notes:notes};
 Logger.log(JSON.stringify(result));return result;
}
