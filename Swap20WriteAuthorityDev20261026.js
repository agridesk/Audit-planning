// SWAP 2.0 DEV: single write authority for direct Firestore cutover.
function Swap20_assertGasWriteAuthority_(){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_SWAP20_WRITE_AUTHORITY')||'').toUpperCase()==='FIRESTORE')
  throw Error('SWAP_GAS_WRITES_DISABLED_FIRESTORE_AUTHORITY');
}
function RUN_SWAP20_SET_FIRESTORE_AUTHORITY_DEV_20261026(){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
    String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')
  throw Error('SWAP_FIRESTORE_CUTOVER_NON_DEV_REJECTED');
 props.setProperty('AMS_SWAP20_WRITE_AUTHORITY','FIRESTORE');
 var result={ok:true,environment:'DEV',gasSwapWritesDisabled:true,writeAuthority:'FIRESTORE'};
 Logger.log(JSON.stringify(result));return result;
}
function RUN_SWAP20_READ_WRITE_AUTHORITY_DEV_20261026(){
 var props=PropertiesService.getScriptProperties();
 return {environment:props.getProperty('AMS_ENV'),writeAuthority:props.getProperty('AMS_SWAP20_WRITE_AUTHORITY')||'GAS'};
}
