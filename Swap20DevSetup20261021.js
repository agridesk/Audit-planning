// One-time DEV initialization of missing environment markers and SWAP journal.
// Does not change any audit, availability, lifecycle, or feature flag.
function RUN_SETUP_SWAP20_DEV_20261021(){
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 var id='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(!ss||ss.getId()!==id)throw Error('WRONG_SPREADSHEET_NO_CHANGES');
 var props=PropertiesService.getScriptProperties();
 var env=String(props.getProperty('AMS_ENV')||'').toUpperCase();
 if(env&&env!=='DEV')throw Error('ENV_CONFLICT_NO_CHANGES');
 var existing=String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 if(existing&&existing!==id)throw Error('SSOT_ID_CONFLICT_NO_CHANGES');
 if(!ss.getSheetByName('Audit planning')||!ss.getSheetByName('Auditor Availability'))
  throw Error('REQUIRED_DEV_TABS_MISSING_NO_CHANGES');
 var journal=ss.getSheetByName('AMS_Swap_20_Journal');
 var created=false;
 if(journal){
  var header=journal.getRange(1,1,1,5).getValues()[0].map(String);
  if(JSON.stringify(header)!==JSON.stringify(['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']))
   throw Error('JOURNAL_HEADER_CONFLICT_NO_CHANGES');
 }else{
  journal=ss.insertSheet('AMS_Swap_20_Journal');
  journal.getRange(1,1,1,5).setValues([['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']]);
  journal.setFrozenRows(1);
  created=true;
 }
 props.setProperties({AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:id},false);
 var result={ok:true,createdJournal:created,env:'DEV',journalRows:journal.getLastRow(),
  flagsChanged:false,planningChanged:false,availabilityChanged:false};
 Logger.log(JSON.stringify(result));return result;
}
