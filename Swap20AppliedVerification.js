/** Verify both Accepted audits and both reservation sets before commit. */
function Swap20_verifyAppliedPairLocked_(before,proposal,plan){
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(before.sheetName);
 var headers=before.headers,js=headers.indexOf('Planning JSON'),st=headers.indexOf('Status'),owner=headers.indexOf('Assigned to');
 if(js<0||st<0||owner<0)throw Error('Canonical verification columns missing');
 before.rows.forEach(function(image,i){
  var row=sh.getRange(image.rowNumber,1,1,headers.length).getValues()[0];
  if(row[st]!=='Accepted'||row[owner]!==image.values[owner])throw Error('Swap changed lifecycle or owner');
  var expected=i===0?proposal.blocksA:proposal.blocksB;
  var actual=JSON.parse(String(row[js]||'{}')).blocks;
  if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Swap canonical blocks missing');
  expected.forEach(function(b,j){if(String(actual[j].date)!==String(b.date)||String(actual[j].start)!==String(b.start)||String(actual[j].end)!==String(b.end))throw Error('Swap canonical blocks mismatch');});
 });
 var av=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(plan.sheetName);
 var actual=av.getRange(1,1,plan.values.length,plan.width).getValues();
 if(JSON.stringify(actual)!==JSON.stringify(plan.values))throw Error('Swap availability reservations mismatch');
 return true;
}
