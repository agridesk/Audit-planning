/**
 * Swap 2.0 durable operation journal, separate from Script Properties.
 * Dedicated DEV spreadsheet tab. All writes require caller-held script lock.
 * Append-only records support recovery after process termination.
 */
var SWAP20_JOURNAL_TAB_='AMS_Swap_20_Journal';
function Swap20Journal_sheet_(){
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
 if(!id)throw Error('Canonical SSOT spreadsheet unavailable');
 var ss=SpreadsheetApp.openById(id),sh=ss.getSheetByName(SWAP20_JOURNAL_TAB_);
 if(!sh)throw Error('Swap durable journal sheet missing; initialize explicitly in DEV');
 var headers=['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON'];
 var row=sh.getRange(1,1,1,headers.length).getValues()[0];
 if(headers.some(function(h,i){return String(row[i]||'').trim()!==h;}))throw Error('Swap journal header mismatch');
 return sh;
}
function Swap20Journal_initializeDev_(){
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
 if(!id)throw Error('Canonical SSOT spreadsheet unavailable');
 var ss=SpreadsheetApp.openById(id),sh=ss.getSheetByName(SWAP20_JOURNAL_TAB_);
 if(sh)throw Error('Swap journal already exists; initialization refused');
 sh=ss.insertSheet(SWAP20_JOURNAL_TAB_);
 sh.getRange(1,1,1,5).setValues([['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']]);
 sh.setFrozenRows(1);
 return {success:true,tab:SWAP20_JOURNAL_TAB_};
}
function Swap20Journal_history_(operationId){
 var id=Swap20Store_key_(operationId).slice(SWAP20_STORE_PREFIX_.length),sh=Swap20Journal_sheet_(),last=sh.getLastRow();
 if(last<2)return [];
 var rows=sh.getRange(2,1,last-1,5).getValues(),out=[];
 rows.forEach(function(row){if(String(row[0])===id){
  var payload=JSON.parse(String(row[4]||'null'));
  out.push({operationId:id,sequence:Number(row[1]),stage:String(row[2]),recordedAt:String(row[3]),payload:payload});
 }});
 for(var i=0;i<out.length;i++)if(out[i].sequence!==i+1)throw Error('Swap journal sequence corrupted');
 return out;
}
function Swap20Journal_appendLocked_(operationId,expectedSequence,stage,payload){
 if(!/^(PREPARED|WRITING|COMMITTED|ROLLING_BACK|ROLLED_BACK|FAILED|CONFLICT)$/.test(String(stage||'')))throw Error('Invalid swap journal stage');
 var history=Swap20Journal_history_(operationId);
 if(history.length!==expectedSequence)throw Error('Swap journal concurrent modification');
 if(history.length&&['COMMITTED','ROLLED_BACK'].indexOf(history[history.length-1].stage)>=0)throw Error('Swap journal terminal state');
 var raw=JSON.stringify(payload);
 if(raw.length>40000)throw Error('Swap journal payload too large');
 var sh=Swap20Journal_sheet_(),next=history.length+1;
 sh.getRange(sh.getLastRow()+1,1,1,5).setValues([[operationId,next,stage,new Date().toISOString(),raw]]);
 SpreadsheetApp.flush();
 return {success:true,operationId:operationId,sequence:next,stage:stage};
}
