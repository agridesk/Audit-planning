// Scope Management 2.0 — version storage contract; no sheet writes.
var SCOPE_VERSION_20_HEADERS=['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From','Effective_To','Created_At','Created_By','Change_Reason'];

function ScopeVersion20_validateRows_(rows){
  var errors=[],current={},keys={};
  (rows||[]).forEach(function(r,i){
    var code=String(r.ScopeCode||'').trim(),version=String(r.VersionId||'').trim();
    var key=code+'|'+version,status=String(r.Status||'').trim().toUpperCase();
    if(!code||!version)errors.push('Missing version identity at row '+(i+1));
    if(keys[key])errors.push('Duplicate scope version: '+key);
    keys[key]=true;
    if(!['CURRENT','HISTORICAL','DRAFT'].includes(status))errors.push('Invalid version status: '+key);
    if(status==='CURRENT'){current[code]=(current[code]||0)+1;if(current[code]>1)errors.push('Multiple Current versions: '+code);}
    var hours=r.Hours_to_plan;
    if(hours===null||hours===undefined||String(hours).trim()===''||!isFinite(Number(String(hours).replace(',','.')))||Number(String(hours).replace(',','.'))<0)errors.push('Invalid Hours_to_plan: '+key);
  });
  return {success:errors.length===0,errors:errors,currentByScope:current};
}

function ScopeVersion20_read_(ss){
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('ScopeVersions');
  if(!sh)return {success:true,initialized:false,rows:[],readOnly:true};
  var values=sh.getDataRange().getValues(),headers=(values[0]||[]).map(function(x){return String(x||'').trim();});
  var missing=SCOPE_VERSION_20_HEADERS.filter(function(h){return headers.indexOf(h)<0;});
  if(missing.length)return {success:false,initialized:true,errors:['ScopeVersions missing columns: '+missing.join(', ')],readOnly:true};
  var rows=values.slice(1).filter(function(r){return r.some(function(v){return v!==''&&v!==null;});}).map(function(r){var out={};SCOPE_VERSION_20_HEADERS.forEach(function(h){out[h]=r[headers.indexOf(h)];});return out;});
  var validation=ScopeVersion20_validateRows_(rows);
  return {success:validation.success,initialized:true,rows:rows,errors:validation.errors,readOnly:true};
}

function RUN_SCOPE_VERSION_20_READ_ONLY(){
  var result=ScopeVersion20_read_();
  var out={success:result.success,readOnly:true,writesPerformed:false,initialized:result.initialized,versionCount:result.rows.length,errors:result.errors||[]};
  Logger.log(JSON.stringify(out));return out;
}
