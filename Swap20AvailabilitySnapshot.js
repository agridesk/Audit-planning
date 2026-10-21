/**
 * Capture complete availability table before-images for two-audit swap.
 * Broad snapshot is intentional: preserves unrelated reservations on rollback.
 * Hard row cap avoids unbounded journal payloads.
 */
function Swap20_captureAvailabilityBeforeImages_(){
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 var sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
 if(!sh)throw Error('Availability sheet missing');
 var height=sh.getLastRow(),width=sh.getLastColumn();
 if(height<1||width<1||height>2000||width>80)throw Error('Availability snapshot exceeds safe limits');
 var values=sh.getRange(1,1,height,width).getValues();
 values.forEach(function(row){row.forEach(function(v){if(v instanceof Date)throw Error('Date cell cannot be safely serialized for swap recovery');});});
 return {sheetName:sh.getName(),height:height,width:width,values:values};
}
function Swap20_restoreAvailabilityBeforeImages_(before){
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(before.sheetName);
 if(!sh||sh.getLastColumn()!==before.width)throw Error('Availability rollback schema mismatch');
 if(sh.getLastRow()<before.height)throw Error('Availability rows deleted; manual recovery required');
 var current=sh.getRange(1,1,1,before.width).getValues()[0];
 if(JSON.stringify(current)!==JSON.stringify(before.values[0]))throw Error('Availability rollback header mismatch');
 if(sh.getLastRow()>before.height)sh.deleteRows(before.height+1,sh.getLastRow()-before.height);
 if(sh.getMaxRows()<before.height)sh.insertRowsAfter(sh.getMaxRows(),before.height-sh.getMaxRows());
 sh.getRange(1,1,before.height,before.width).setValues(before.values);
 SpreadsheetApp.flush();
 return {success:true,restored:before.height};
}
