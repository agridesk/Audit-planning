/** Verify both Accepted audits and both reservation sets before commit. */
function Swap20_verifyAppliedPairLocked_(before,proposal,plan){
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(before.sheetName);
 var headers=before.headers,js=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('planningjson'),st=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('status'),owner=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('assignedto'),date=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('dateplanned'),id=headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('auditid');
 if(js<0||st<0||owner<0||date<0||id<0)throw Error('Canonical verification columns missing');
 if(!sh||!plan||!Array.isArray(plan.values))throw Error('Swap verification source missing');
 before.rows.forEach(function(image,i){
  var row=sh.getRange(image.rowNumber,1,1,headers.length).getValues()[0];
  if(String(row[id]||'')!==String(image.auditId))throw Error('SWAP_CANONICAL_AUDIT_ID_MISMATCH');
  if(String(row[st]||'').toLowerCase()!=='accepted'||row[owner]!==image.values[owner])throw Error('Swap changed lifecycle or owner');
  var expected=i===0?proposal.blocksA:proposal.blocksB;
  var actual=JSON.parse(String(row[js]||'{}')).blocks;
  if(!Array.isArray(expected)||!expected.length)throw Error('SWAP_EXPECTED_BLOCKS_MISSING');
  if(String(row[date]||'')!==String(expected[0].date||''))throw Error('SWAP_CANONICAL_DATE_COLUMN_MISMATCH');
  if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Swap canonical blocks missing');
  expected.forEach(function(b,j){if(String(actual[j].date)!==String(b.date)||String(actual[j].start)!==String(b.start)||String(actual[j].end)!==String(b.end))throw Error('Swap canonical blocks mismatch');});
 });
 var av=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(plan.sheetName);
 var actual=av.getRange(1,1,plan.values.length,plan.width).getValues();
 if(JSON.stringify(actual)!==JSON.stringify(plan.values))throw Error('Swap availability reservations mismatch');
 return true;
}

/** Read-only DEV diagnostic. Never writes, repairs, retries or changes the journal. */
function RUN_SWAP20_DIAGNOSE_COMMITTED_PAIR_DEV_20261108(){
 var operationId='SWAP20_b4150cf3b74f42dbaeb9a79b57c7d56e';
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('SWAP_DIAGNOSTIC_DEV_ONLY');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 if(!ss||ss.getId()!==String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||''))throw Error('SWAP_DIAGNOSTIC_SSOT_MISMATCH');
 var proposal=Swap20Store_read_(operationId),history=Swap20Journal_history_(operationId);
 var result={operationId:operationId,environment:'DEV',proposalStatus:proposal?proposal.status:'MISSING',canonicalCommitVerified:!!(proposal&&proposal.canonicalCommitVerified),journalStage:history.length?history[history.length-1].stage:'NOT_STARTED',journalSequence:history.length?history[history.length-1].sequence:0,canonical:[],consistent:false};
 if(!proposal||!history.length||!history[0].payload||!history[0].payload.canonical){Logger.log(JSON.stringify(result));return result;}
 var before=history[0].payload.canonical,sh=ss.getSheetByName(before.sheetName);
 if(!sh)throw Error('SWAP_DIAGNOSTIC_CANONICAL_SHEET_MISSING');
 var cols=before.headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');});
 var idCol=cols.indexOf('auditid'),dateCol=cols.indexOf('dateplanned'),jsonCol=cols.indexOf('planningjson');
 if(idCol<0||dateCol<0||jsonCol<0)throw Error('SWAP_DIAGNOSTIC_SCHEMA_MISMATCH');
 before.rows.forEach(function(image,i){
  var row=sh.getRange(image.rowNumber,1,1,before.headers.length).getValues()[0];
  var expected=i===0?proposal.blocksA:proposal.blocksB;
  var blocks=[];try{blocks=JSON.parse(String(row[jsonCol]||'{}')).blocks||[];}catch(e){}
  var expectedDate=expected&&expected.length?String(expected[0].date):'';
  result.canonical.push({auditId:image.auditId,rowIdentityMatches:String(row[idCol])===String(image.auditId),expectedDate:expectedDate,actualDate:String(row[dateCol]||''),actualJsonDate:blocks.length?String(blocks[0].date):'',dateMatches:expectedDate!==''&&String(row[dateCol]||'')===expectedDate&&blocks.length>0&&String(blocks[0].date)===expectedDate});
 });
 result.consistent=result.journalStage==='COMMITTED'&&result.canonical.length===2&&result.canonical.every(function(x){return x.rowIdentityMatches&&x.dateMatches;});
 if(!result.consistent)result.incident='SWAP_COMMITTED_CANONICAL_DRIFT';
 Logger.log(JSON.stringify(result));return result;
}
