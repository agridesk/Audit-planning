/** Pair availability writer. Caller holds the transaction lock. */
function Swap20_writeAvailabilityPlanLocked_(plan,before){
 Swap20_assertGasWriteAuthority_();
 if(!plan||!before||plan.sheetName!==before.sheetName||plan.width!==before.width)throw Error('Availability write schema mismatch');
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(plan.sheetName);
 if(!sh||sh.getLastColumn()!==plan.width||sh.getLastRow()!==before.height)throw Error('Availability changed before write');
 var current=sh.getRange(1,1,before.height,before.width).getValues();
 if(JSON.stringify(current)!==JSON.stringify(before.values))throw Error('Availability changed since snapshot');
 var added=plan.values.length-before.height;
 if(added<0||plan.values.some(function(row){return !Array.isArray(row)||row.length!==plan.width;}))throw Error('Invalid availability plan shape');
 if(added&&sh.getMaxRows()<plan.values.length)sh.insertRowsAfter(sh.getMaxRows(),plan.values.length-sh.getMaxRows());
 for(var i=1;i<before.height;i++){
  if(JSON.stringify(before.values[i])!==JSON.stringify(plan.values[i])){
   sh.getRange(i+1,1,1,plan.width).setValues([plan.values[i]]);
  }
 }
 if(added)sh.getRange(before.height+1,1,added,plan.width).setValues(plan.values.slice(before.height));
 SpreadsheetApp.flush();
 // Full-table post-write verification is performed once by
 // Swap20_verifyAppliedPairLocked_ after both canonical rows are written.
 // Avoid a redundant full-sheet read on the critical commit path.
 return {success:true,rows:plan.values.length};
}
