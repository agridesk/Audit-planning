// Scope Management 2.0 — read-only schema preflight (DEV).
function RUN_SCOPE_MANAGEMENT_2_0_SCHEMA_PREFLIGHT() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var required=['SlotKey','ScopeCode','DisplayName','Color','TextColor','Active','Archived','SortOrder','Default_hours','Max number audits','Planning from','Planning to','Extension','Recurring','Obligation cycle','Complete by','Provisioning source','Trigger source','Source service','Max_Offsite_Hours','Min_Interval_Months'];
  var sh=ss.getSheetByName('Config_Scopes'),errors=[],warnings=[],headers=[];
  if(!sh)errors.push('Config_Scopes missing');
  else headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  required.forEach(function(h){if(headers.indexOf(h)<0)errors.push('Missing column: '+h);});
  var seen={},codes={},slots={},rows=sh?sh.getDataRange().getValues():[];
  for(var i=1;i<rows.length;i++){
    var row=rows[i],code=String(row[headers.indexOf('ScopeCode')]||'').trim(),slot=String(row[headers.indexOf('SlotKey')]||'').trim();
    if(!code&&!slot)continue;
    if(!code||!slot)errors.push('Incomplete scope identity at row '+(i+1));
    if(codes[code])errors.push('Duplicate ScopeCode: '+code);
    if(slots[slot])errors.push('Duplicate SlotKey: '+slot);
    codes[code]=true;slots[slot]=true;seen[code]=true;
  }
  if(Object.keys(seen).length>20)errors.push('More than 20 configured scopes');
  var out={success:errors.length===0,readOnly:true,writesPerformed:false,scopeCount:Object.keys(seen).length,columnsPresent:headers.length,errors:errors,warnings:warnings};
  Logger.log(JSON.stringify(out));return out;
}
