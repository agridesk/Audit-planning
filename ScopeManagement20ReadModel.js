// AMS Scope Management 2.0 — Manager read model. Read-only; DEV.
// No mutations, no automatic version migration, no invented legacy version IDs.
var SCOPE_MGMT_20_FIELDS=[
['slotKey','SlotKey'],['scopeCode','ScopeCode'],['displayName','DisplayName'],
['color','Color'],['textColor','TextColor'],['active','Active'],['archived','Archived'],
['sortOrder','SortOrder'],['hoursToPlan','Default_hours'],['rotationLimit','Max number audits'],
['planningFrom','Planning from'],['planningTo','Planning to'],['extension','Extension'],
['recurring','Recurring'],['obligationCycle','Obligation cycle'],['completeBy','Complete by'],
['provisioningSource','Provisioning source'],['triggerSource','Trigger source'],
['sourceService','Source service'],['maxOffsiteHours','Max_Offsite_Hours'],
['minimumIntervalMonths','Min_Interval_Months']
];
function ScopeManagement20_readRows_(sheet){
  if(!sheet)return {success:false,errors:['Required sheet missing'],rows:[]};
  var values=sheet.getDataRange().getValues();
  var headers=(values[0]||[]).map(function(x){return String(x||'').trim();});
  var missing=SCOPE_MGMT_20_FIELDS.map(function(f){return f[1];}).filter(function(h){return headers.indexOf(h)<0;});
  if(missing.length)return {success:false,errors:['Missing scope columns: '+missing.join(', ')],rows:[]};
  var rows=values.slice(1).filter(function(row){return row.some(function(v){return v!==''&&v!==null;});}).map(function(row){
    var obj={};SCOPE_MGMT_20_FIELDS.forEach(function(f){obj[f[0]]=row[headers.indexOf(f[1])];});return obj;
  });
  return {success:true,errors:[],rows:rows};
}
function ScopeManagement20_isYes_(value){return value===true||['TRUE','YES','Y','1'].indexOf(String(value||'').trim().toUpperCase())>=0;}
function ScopeManagement20_colorContrast_(bg,fg){
  function rgb(hex){hex=String(hex||'').trim();if(!/^#[0-9a-fA-F]{6}$/.test(hex))return null;return [1,3,5].map(function(i){var v=parseInt(hex.substr(i,2),16)/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});}
  var a=rgb(bg),b=rgb(fg);if(!a||!b)return {valid:false,ratio:null,readable:false};
  function luminance(v){return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];}
  var x=luminance(a),y=luminance(b),ratio=(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
  return {valid:true,ratio:Math.round(ratio*100)/100,readable:ratio>=4.5};
}
function ScopeManagement20_read_(ss,options){
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();options=options||{};
  var catalog=ScopeManagement20_readRows_(ss.getSheetByName('Config_Scopes'));
  if(!catalog.success)return {success:false,readOnly:true,errors:catalog.errors};
  var versions=ScopeVersion20_read_(ss);
  if(!versions.success)return {success:false,readOnly:true,errors:versions.errors};
  var byScope={},versionErrors=[];
  (versions.rows||[]).forEach(function(v){var code=String(v.ScopeCode||'').trim();if(!byScope[code])byScope[code]=[];byScope[code].push(v);});
  var rows=catalog.rows.map(function(item){
    var code=String(item.scopeCode||'').trim(),history=byScope[code]||[];
    var current=history.filter(function(v){return String(v.Status||'').trim().toUpperCase()==='CURRENT';});
    if(current.length>1)versionErrors.push('Multiple Current versions: '+code);
    var version=current[0]||null;
    var projected=item.hoursToPlan;
    if(version&&Number(String(projected).replace(',','.'))!==Number(String(version.Hours_to_plan).replace(',','.')))versionErrors.push('Current version hours mismatch Config_Scopes: '+code);
    var contrast=ScopeManagement20_colorContrast_(item.color,item.textColor);
    var alerts=[];
    if(!contrast.valid)alerts.push('Invalid scope color');
    else if(!contrast.readable)alerts.push('Low color contrast');
    if(!versions.initialized)alerts.push('Version storage not initialized');
    else if(!version)alerts.push('No Current version');
    return {scopeCode:code,slotKey:String(item.slotKey||''),displayName:String(item.displayName||''),
      active:ScopeManagement20_isYes_(item.active),archived:ScopeManagement20_isYes_(item.archived),
      currentVersion:version?String(version.VersionId):null,
      hoursToPlan:version?Number(String(version.Hours_to_plan).replace(',','.')):projected,
      rotationLimit:item.rotationLimit,minimumIntervalMonths:item.minimumIntervalMonths,
      planningFrom:item.planningFrom,planningTo:item.planningTo,sortOrder:item.sortOrder,
      alerts:alerts,contrast:contrast,policy:item,versions:history};
  });
  if(versionErrors.length)return {success:false,readOnly:true,errors:versionErrors};
  rows.sort(function(a,b){return (Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||a.displayName.localeCompare(b.displayName);});
  var all=rows.slice(),search=String(options.search||'').toLowerCase().trim();
  if(search)rows=rows.filter(function(r){return (r.scopeCode+' '+r.displayName).toLowerCase().indexOf(search)>=0;});
  if(options.filter==='active')rows=rows.filter(function(r){return r.active&&!r.archived;});
  if(options.filter==='archived')rows=rows.filter(function(r){return r.archived;});
  if(options.scopeCode)rows=rows.filter(function(r){return r.scopeCode===String(options.scopeCode);});
  return {success:true,readOnly:true,writesPerformed:false,versionStorageInitialized:versions.initialized,
    totalScopes:all.length,matchingScopes:rows.length,rows:rows};
}
function RUN_SCOPE_MANAGEMENT_20_READ_MODEL(){
  var result=ScopeManagement20_read_(null,{});
  Logger.log(JSON.stringify({success:result.success,readOnly:true,writesPerformed:false,totalScopes:result.totalScopes||0,
    versionStorageInitialized:result.versionStorageInitialized||false,errors:result.errors||[]}));
  return result;
}
