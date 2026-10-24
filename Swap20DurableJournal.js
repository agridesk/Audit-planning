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
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV environment marker required');
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
 // Decode only matching operation rows: unrelated compressed before-images
 // must not be inflated during each journal status/append request.
 rows.forEach(function(row){if(String(row[0])===id){
  var payload=Swap20Journal_decodePayload_(String(row[4]||'null'));
  out.push({operationId:id,sequence:Number(row[1]),stage:String(row[2]),recordedAt:String(row[3]),payload:payload});
 }});
 for(var i=0;i<out.length;i++)if(out[i].sequence!==i+1)throw Error('Swap journal sequence corrupted');
 return out;
}
function Swap20Journal_appendLocked_(operationId,expectedSequence,stage,payload){
 if(!/^(PREPARED|WRITING|COMMITTED|ROLLING_BACK|ROLLED_BACK|FAILED|CONFLICT)$/.test(String(stage||'')))throw Error('Invalid swap journal stage');
 var history=Swap20Journal_history_(operationId);
 if(history.length!==expectedSequence)throw Error('Swap journal concurrent modification');
 var transitions={
  '': ['PREPARED'],
  PREPARED:['WRITING','CONFLICT'],
  WRITING:['COMMITTED','ROLLING_BACK'],
  ROLLING_BACK:['ROLLED_BACK','FAILED'],
  COMMITTED:[],ROLLED_BACK:[],FAILED:[],CONFLICT:[]
 };
 var previous=history.length?history[history.length-1].stage:'';
 if(previous==='COMMITTED'||previous==='ROLLED_BACK'||previous==='FAILED'||previous==='CONFLICT')throw Error('Swap journal terminal state');
 if(!Object.prototype.hasOwnProperty.call(transitions,previous)||transitions[previous].indexOf(stage)<0)throw Error('Illegal swap journal transition');
 var raw=Swap20Journal_encodePayload_(payload);
 if(raw.length>40000)throw Error('Swap journal payload too large');
 var sh=Swap20Journal_sheet_(),next=history.length+1;
 sh.getRange(sh.getLastRow()+1,1,1,5).setValues([[operationId,next,stage,new Date().toISOString(),raw]]);
 SpreadsheetApp.flush();
 return {success:true,operationId:operationId,sequence:next,stage:stage};
}

function Swap20Journal_encodePayload_(payload){
 var typed=Swap20Journal_markDates_(payload);
 var raw=JSON.stringify(typed);
 if(raw.length<=25000)return raw;
 if(typeof Utilities==='undefined')throw Error('SWAP journal compression unavailable');
 var bytes=Utilities.gzip(Utilities.newBlob(raw,'application/json')).getBytes();
 return 'SWAP_GZIP_V1:'+Utilities.base64Encode(bytes);
}
function Swap20Journal_decodePayload_(raw){
 if(raw.indexOf('SWAP_GZIP_V1:')===0){
  if(typeof Utilities==='undefined')throw Error('SWAP journal decompression unavailable');
  var bytes=Utilities.base64Decode(raw.substring(13));
  raw=Utilities.ungzip(Utilities.newBlob(bytes,'application/x-gzip')).getDataAsString();
 }
 return Swap20Journal_rehydrateDates_(JSON.parse(raw));
}
function Swap20Journal_markDates_(input){
 if(Object.prototype.toString.call(input)==='[object Date]'){
  if(isNaN(input.getTime()))throw Error('Invalid SWAP journal date');
  return {'__AMS_SWAP_DATE_ISO__':input.toISOString()};
 }
 if(Array.isArray(input))return input.map(Swap20Journal_markDates_);
 if(input&&typeof input==='object'){
  var obj={};
  Object.keys(input).forEach(function(k){obj[k]=Swap20Journal_markDates_(input[k]);});
  return obj;
 }
 return input;
}
function Swap20Journal_rehydrateDates_(input){
 if(Array.isArray(input))return input.map(Swap20Journal_rehydrateDates_);
 if(input&&typeof input==='object'){
  if(Object.keys(input).length===1&&typeof input.__AMS_SWAP_DATE_ISO__==='string'){
   var date=new Date(input.__AMS_SWAP_DATE_ISO__);
   if(isNaN(date.getTime())||date.toISOString()!==input.__AMS_SWAP_DATE_ISO__)throw Error('SWAP journal date corrupted');
   return date;
  }
  Object.keys(input).forEach(function(k){input[k]=Swap20Journal_rehydrateDates_(input[k]);});
 }
 return input;
}
