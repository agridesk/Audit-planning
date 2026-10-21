function Swap20_captureCanonicalBeforeImages_(proposal){
 if(!proposal||!proposal.auditA||!proposal.auditB||proposal.auditA===proposal.auditB)throw Error('Invalid swap pair');
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit planning');
 if(!sh)throw Error('Canonical audit sheet unavailable');
 var width=sh.getLastColumn(),headers=sh.getRange(1,1,1,width).getValues()[0];
 var idCol=headers.map(function(x){return String(x).toLowerCase().replace(/[ _-]/g,'');}).indexOf('auditid');
 if(idCol<0)throw Error('Audit ID column missing');
 var rows=[proposal.auditA,proposal.auditB].map(function(id){
  var item=PRT_readCanonicalRow_(id);
  if(!item||!item.rowNumber||String(item.row[idCol])!==String(id))throw Error('Canonical audit row mismatch');
  var revision=PRT_result_(id,item.headers,item.row,'swap snapshot',item.rowNumber).revision;
  if(revision!==proposal.originalRevisions[id])throw Error('Canonical revision mismatch');
  if(item.row.length!==width)throw Error('Canonical row width mismatch');
  return {auditId:id,rowNumber:item.rowNumber,revision:revision,values:item.row.slice()};
 });
 if(rows[0].rowNumber===rows[1].rowNumber)throw Error('Canonical row collision');
 return {sheetName:'Audit planning',headers:headers,rows:rows};
}
