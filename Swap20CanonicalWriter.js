/** Canonical pair writer: preserves identity, lifecycle and auditor assignments. */
function Swap20_writeCanonicalPairLocked_(before,proposal){
 Swap20_assertGasWriteAuthority_();
 // Reverify immediately before canonical writes: other sheet clients do not
 // share this script lock, so this check cannot safely be eliminated.
 Swap20_verifyCanonicalBeforeImages_(before);
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(before.sheetName),headers=before.headers;
 function col(names){var h=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');});for(var i=0;i<names.length;i++){var ix=h.indexOf(names[i].toLowerCase().replace(/[ _-]/g,''));if(ix>=0)return ix;}throw Error('Canonical column missing '+names[0]);}
 var json=col(['Planning JSON']),date=col(['Date - Planned']),assigned=col(['Assigned to']),status=col(['Status']);
 before.rows.forEach(function(image,index){
  var row=image.values.slice(),old=JSON.parse(String(row[json]||'{}'));
  var blocks=index===0?proposal.blocksA:proposal.blocksB;
  var normalized=blocks.map(function(b){return {date:b.date,start:b.start,end:b.end,hours:(Swap20_scheduleMinutes_(b.end)-Swap20_scheduleMinutes_(b.start))/60};});
  var hours=normalized.reduce(function(n,b){return n+b.hours;},0);
  if(!old||!Array.isArray(old.blocks)||!old.blocks.length||!normalized.length)throw Error('Canonical planning blocks unavailable');
  var oldHours=old.blocks.reduce(function(n,b){return n+(Swap20_scheduleMinutes_(b.end)-Swap20_scheduleMinutes_(b.start))/60;},0);
  if(Math.abs(hours-oldHours)>0.000001)throw Error('Canonical duration changed');
  if(old.totalPlannedHours!=null&&Math.abs(Number(old.totalPlannedHours)-hours)>0.000001)throw Error('Canonical total planned hours mismatch');
  old.blocks=normalized;old.totalPlannedHours=hours;
  row[json]=JSON.stringify(old);row[date]=normalized[0].date;
  if(row[assigned]!==image.values[assigned]||row[status]!==image.values[status])throw Error('Swap changed canonical owner or lifecycle');
  sh.getRange(image.rowNumber,1,1,headers.length).setValues([row]);
 });
 SpreadsheetApp.flush();
 return {success:true,auditIds:before.rows.map(function(x){return x.auditId;})};
}
