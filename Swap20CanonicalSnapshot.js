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
  if(String(PRT_snapshotFromRow_(item.headers,item.row).status).toLowerCase()!=='accepted')throw Error('Swap requires Accepted status');
  if(item.row.length!==width)throw Error('Canonical row width mismatch');
  if(item.row.some(function(v){return Object.prototype.toString.call(v)==='[object Date]'&&isNaN(v.getTime());}))throw Error('Invalid Date cell in durable swap snapshot');
  return {auditId:id,rowNumber:item.rowNumber,revision:revision,values:item.row.slice()};
 });
 if(rows[0].rowNumber===rows[1].rowNumber)throw Error('Canonical row collision');
 return {sheetName:'Audit planning',headers:headers,rows:rows};
}

function Swap20_verifyCanonicalBeforeImages_(snapshot){
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(snapshot.sheetName);
 if(!sh||sh.getLastColumn()!==snapshot.headers.length)throw Error('Canonical schema changed');
 var headers=sh.getRange(1,1,1,snapshot.headers.length).getValues()[0];
 if(JSON.stringify(headers)!==JSON.stringify(snapshot.headers))throw Error('Canonical headers changed');
 var idCol=headers.map(function(x){return String(x).toLowerCase().replace(/[ _-]/g,'');}).indexOf('auditid');
 snapshot.rows.forEach(function(image){
  var row=sh.getRange(image.rowNumber,1,1,headers.length).getValues()[0];
  if(String(row[idCol])!==String(image.auditId))throw Error('Canonical audit row moved');
  if(PRT_tokenFromSnapshot_(PRT_snapshotFromRow_(headers,row))!==image.revision){
   var changed=[];
   for(var c=0;c<headers.length;c++){
    var before=image.values[c],after=row[c];
    var normalize=function(v){return Object.prototype.toString.call(v)==='[object Date]'?v.getTime():JSON.stringify(v);};
    if(normalize(before)!==normalize(after))changed.push(String(headers[c]||'column '+(c+1)).slice(0,55));
   }
   console.error('[SWAP20_CANONICAL_REVISION_CONFLICT]',JSON.stringify({auditId:image.auditId,changedColumns:changed.slice(0,30),changedCount:changed.length,tokenMismatchWithoutCellChange:changed.length===0}));
   var conflict=new Error('Canonical revision changed during swap');
   conflict.swapConflict={auditId:image.auditId,changedColumns:changed.slice(0,30),tokenMismatchWithoutCellChange:changed.length===0};
   throw conflict;
  }
 });
 return true;
}

function Swap20_restoreCanonicalBeforeImages_(snapshot){
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(snapshot.sheetName);
 if(!sh||sh.getLastColumn()!==snapshot.headers.length)throw Error('Canonical rollback schema mismatch');
 var headers=sh.getRange(1,1,1,snapshot.headers.length).getValues()[0];
 if(JSON.stringify(headers)!==JSON.stringify(snapshot.headers))throw Error('Canonical rollback headers mismatch');
 var norm=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');});
 var idCol=norm.indexOf('auditid'),planningCol=norm.indexOf('planningjson'),dateCol=norm.indexOf('dateplanned');
 if(idCol<0||planningCol<0||dateCol<0)throw Error('Canonical rollback required columns missing');
 var checks=[];
 snapshot.rows.forEach(function(image,i){
  var range=sh.getRange(image.rowNumber,1,1,headers.length);
  var current=range.getValues()[0];
  if(String(current[idCol])!==String(image.auditId))throw Error('Canonical rollback identity mismatch');
  var expected=i===0?snapshot.rollbackExpectedBlocksA:snapshot.rollbackExpectedBlocksB;
  if(!Array.isArray(expected))throw Error('Canonical rollback expected blocks unavailable');
  if(String(current[planningCol]||'')!==String(image.values[planningCol]||'')){
   var parsed;try{parsed=JSON.parse(String(current[planningCol]||''));}catch(e){throw Error('Canonical rollback planning changed externally');}
   if(JSON.stringify(parsed.blocks||[])!==JSON.stringify(expected))throw Error('Canonical rollback planning changed externally');
  }
  var dateExpected=expected.length?String(expected[0].date||''):'';
  if(String(current[dateCol]||'')!==String(image.values[dateCol]||'')&&String(current[dateCol]||'')!==dateExpected)
   throw Error('Canonical rollback planned date changed externally');
  for(var c=0;c<headers.length;c++){
   if(c===planningCol||c===dateCol)continue;
   if(JSON.stringify(current[c])!==JSON.stringify(image.values[c]))
    throw Error('Canonical rollback external field change');
  }
  checks.push({range:range,image:image});
 });
 checks.forEach(function(item){item.range.setValues([item.image.values]);});
 SpreadsheetApp.flush();
 Swap20_verifyCanonicalBeforeImages_(snapshot);
 return {success:true,restored:checks.length};
}
