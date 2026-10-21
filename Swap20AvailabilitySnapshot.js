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
 values.forEach(function(row){row.forEach(function(v){if(Object.prototype.toString.call(v)==='[object Date]')throw Error('Date cell cannot be safely serialized for swap recovery');});});
 return {sheetName:sh.getName(),height:height,width:width,values:values};
}
function Swap20_restoreAvailabilityBeforeImages_(before,plan){
 if(!plan||!Array.isArray(plan.values)||plan.sheetName!==before.sheetName||plan.width!==before.width||plan.originalHeight!==before.height)throw Error('Verified rollback plan required');
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(before.sheetName);
 if(!sh||sh.getLastColumn()!==before.width||sh.getLastRow()!==plan.values.length)throw Error('Availability rollback schema or row count changed; manual recovery required');
 var current=sh.getRange(1,1,plan.values.length,before.width).getValues();
 if(JSON.stringify(current[0])!==JSON.stringify(before.values[0]))throw Error('Availability rollback header mismatch');
 var changed=[];
 for(var i=1;i<before.height;i++){
  if(JSON.stringify(before.values[i])===JSON.stringify(plan.values[i]))continue;
  var actual=JSON.stringify(current[i]);
  if(actual!==JSON.stringify(before.values[i])&&actual!==JSON.stringify(plan.values[i]))throw Error('Availability rollback row changed externally; manual recovery required');
  if(actual===JSON.stringify(plan.values[i]))changed.push(i);
 }
 for(var j=before.height;j<plan.values.length;j++){
  if(JSON.stringify(current[j])!==JSON.stringify(plan.values[j]))throw Error('Availability appended row changed externally; manual recovery required');
 }
 for(var k=0;k<changed.length;k++)sh.getRange(changed[k]+1,1,1,before.width).setValues([before.values[changed[k]]]);
 if(plan.values.length>before.height)sh.deleteRows(before.height+1,plan.values.length-before.height);
 SpreadsheetApp.flush();
 return {success:true,restored:changed.length,removedAppended:plan.values.length-before.height};
}
