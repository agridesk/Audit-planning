// DEV read-only sizing of the actual SWAP availability before-image.
function RUN_DIAG_SWAP20_SNAPSHOT_CAPACITY_DEV_20261021(){
 var p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV_ONLY');
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Auditor Availability');
 if(!sh)throw Error('AVAILABILITY_MISSING');
 var rows=sh.getLastRow(),cols=sh.getLastColumn();
 var raw=sh.getRange(1,1,rows,cols).getValues();
 var dates=0;
 var normalized=raw.map(function(row){return row.map(function(v){
  if(Object.prototype.toString.call(v)==='[object Date]'){
   dates++;
   return {__swapDate:v.toISOString()};
  }
  return v;
 });});
 var originalLength=JSON.stringify({sheetName:sh.getName(),height:rows,width:cols,values:normalized}).length;
 var empty=0;
 raw.slice(1).forEach(function(row){if(!row.some(function(v,i){return i>=5&&String(v||'').trim()!=='';}))empty++;});
 var result={ok:true,readOnly:true,rows:rows,cols:cols,nativeDates:dates,
  normalizedSnapshotChars:originalLength,wholeSnapshotCapChars:35000,
  exceedsCap:originalLength>35000,emptyCandidateRows:empty,
  featureFlagsUnchanged:true,readyForSwapCommit:false};
 Logger.log(JSON.stringify(result));return result;
}
