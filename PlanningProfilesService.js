/***********************************************************************
 * PlanningProfilesService.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_PROFILES_R3_BOUNDED_COLUMNS
 *
 * Read-only CompanyPlanningProfile + AuditorPlanningProfile projection.
 * Canonical owners remain Companies / Auditors / Config_Scopes.
 * Hot-path callers may pass precomputed canonical active scope names from
 * Config_Scopes, avoiding a repeated scope-catalog lookup in the same request.
 *
 * AMS-01.2 SPEED
 * - Header is read once per sheet.
 * - Body read is bounded to the contiguous span containing only required
 *   projection columns, instead of getDataRange() for the full sheet width.
 * - No per-row Spreadsheet calls, no new cache and no truth changes.
 ***********************************************************************/

var PLANNING_PROFILES_BUILD = '2026-09-10_AMS01_2_PLANNING_PROFILES_R3_BOUNDED_COLUMNS';

function PPS_clean_(v) { return String(v == null ? '' : v).trim(); }
function PPS_norm_(v) { return PPS_clean_(v).toLowerCase(); }
function PPS_key_(v) { return PPS_norm_(v).replace(/[^a-z0-9]+/g, ''); }
function PPS_email_(v) { return PPS_norm_(v); }
function PPS_headerMap_(headers) { var out={}; for(var i=0;i<(headers||[]).length;i++){var raw=PPS_clean_(headers[i]);if(!raw)continue;out[raw]=i;out[raw.toLowerCase()]=i;out[PPS_key_(raw)]=i;} return out; }
function PPS_col_(hm,candidates){for(var i=0;i<candidates.length;i++){var c=PPS_clean_(candidates[i]);if(!c)continue;if(hm.hasOwnProperty(c))return hm[c];if(hm.hasOwnProperty(c.toLowerCase()))return hm[c.toLowerCase()];var k=PPS_key_(c);if(hm.hasOwnProperty(k))return hm[k];}return -1;}
function PPS_val_(row,idx){return idx>=0&&idx<row.length?row[idx]:'';}
function PPS_requestedSet_(arr,normalizer){if(!Array.isArray(arr)||!arr.length)return null;var out={};for(var i=0;i<arr.length;i++){var k=normalizer(arr[i]);if(k)out[k]=true;}return Object.keys(out).length?out:null;}
function PPS_usedSpan_(cols){var used=(cols||[]).filter(function(x){return x>=0;});if(!used.length)return{min:0,max:-1,width:0};var min=Math.min.apply(null,used),max=Math.max.apply(null,used);return{min:min,max:max,width:max-min+1};}
function PPS_rel_(idx,span){return idx<0?-1:idx-span.min;}
function PPS_body_(sh,span,perf,stage){var rowCount=Math.max(0,sh.getLastRow()-1);var values=(rowCount&&span.width)?sh.getRange(2,span.min+1,rowCount,span.width).getValues():[];if(typeof DPL_mark_==='function')DPL_mark_(perf,stage,{rows:values.length,cols:span.width,minCol:span.width?span.min+1:0,maxCol:span.width?span.max+1:0});return{values:values,rowCount:rowCount};}

function PPS_scopeNames_(input) {
  var supplied = input && input.precomputedEvidence && input.precomputedEvidence.activeScopeNames;
  if (Array.isArray(supplied)) {
    var seen={}, clean=[];
    for(var i=0;i<supplied.length;i++){var n=PPS_clean_(supplied[i]);var k=PPS_key_(n);if(n&&k&&!seen[k]){seen[k]=true;clean.push(n);}}
    return { names:clean, source:'precomputedCanonicalEvidence' };
  }
  try {
    if (typeof ConfigScopes_GetActiveScopes === 'function') {
      var rows=ConfigScopes_GetActiveScopes(false)||[];
      return {names:rows.map(function(x){return PPS_clean_(x&&(x.displayName||x.name||x.code));}).filter(function(x){return !!x;}),source:'Config_Scopes'};
    }
  } catch(e) {}
  return {names:[],source:'Config_Scopes'};
}

function PPS_companyProfiles_(ss,input,perf){
  var sh=ss.getSheetByName('Companies'); if(!sh)return{rows:[],meta:{sourceRows:0,columnsRead:0,missingSheet:true}};
  var lastCol=sh.getLastColumn();if(lastCol<1)return{rows:[],meta:{sourceRows:0,columnsRead:0}};
  var hdr=sh.getRange(1,1,1,lastCol).getValues()[0]||[],hm=PPS_headerMap_(hdr);
  var cUid=PPS_col_(hm,['Company_UID','Company UID','CompanyUID','UID']),cName=PPS_col_(hm,['Company','Company name','Name','Bedrijf']),cCountry=PPS_col_(hm,['Country']),cRegion=PPS_col_(hm,['Region']),cLocation=PPS_col_(hm,['Location','HQ Location','HQ']),cLocationsJson=PPS_col_(hm,['Locations_JSON','Locations JSON','LocationsJSON']),cDays=PPS_col_(hm,['Audit planning limitations - days','Audit planning limitations days','Non working days','Non-working days']),cHours=PPS_col_(hm,['Audit planning limitations - hours','Audit planning limitations hours','Working hours','Hours working']),cComments=PPS_col_(hm,['Comments','Comment']),cTz=PPS_col_(hm,['Time zone','Timezone']),cContact=PPS_col_(hm,['Contactperson','Contact person','Contact name','Contact Name','Contact']),cEmail=PPS_col_(hm,['Contactperson e-mail','Contactperson email','Contact email','Contact Email']),cPhone=PPS_col_(hm,['Contactperson phone','Contact phone','Contact Phone','Phone']),cActive=PPS_col_(hm,['Active']);
  var span=PPS_usedSpan_([cUid,cName,cCountry,cRegion,cLocation,cLocationsJson,cDays,cHours,cComments,cTz,cContact,cEmail,cPhone,cActive]),body=PPS_body_(sh,span,perf,'companiesBulkRead'),values=body.values;
  function rel(x){return PPS_rel_(x,span);} cUid=rel(cUid);cName=rel(cName);cCountry=rel(cCountry);cRegion=rel(cRegion);cLocation=rel(cLocation);cLocationsJson=rel(cLocationsJson);cDays=rel(cDays);cHours=rel(cHours);cComments=rel(cComments);cTz=rel(cTz);cContact=rel(cContact);cEmail=rel(cEmail);cPhone=rel(cPhone);cActive=rel(cActive);
  var uidSet=PPS_requestedSet_(input.companyUids||[],PPS_key_),nameSet=PPS_requestedSet_(input.companyNames||[],PPS_key_),out=[];
  for(var r=0;r<values.length;r++){var row=values[r]||[],uid=PPS_clean_(PPS_val_(row,cUid)),name=PPS_clean_(PPS_val_(row,cName));if(!uid&&!name)continue;if(uidSet||nameSet){var match=(uidSet&&uidSet[PPS_key_(uid)])||(nameSet&&nameSet[PPS_key_(name)]);if(!match)continue;}out.push({companyUid:uid,companyName:name,active:PPS_clean_(PPS_val_(row,cActive)),country:PPS_clean_(PPS_val_(row,cCountry)),region:PPS_clean_(PPS_val_(row,cRegion)),hqLocation:PPS_clean_(PPS_val_(row,cLocation)),locationsJson:PPS_clean_(PPS_val_(row,cLocationsJson)),planningLimitsDays:PPS_clean_(PPS_val_(row,cDays)),planningLimitsHours:PPS_clean_(PPS_val_(row,cHours)),planningComments:PPS_clean_(PPS_val_(row,cComments)),timezone:PPS_clean_(PPS_val_(row,cTz)),contactName:PPS_clean_(PPS_val_(row,cContact)),contactEmail:PPS_clean_(PPS_val_(row,cEmail)),contactPhone:PPS_clean_(PPS_val_(row,cPhone))});}
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'companiesProject',{returned:out.length}); return{rows:out,meta:{sourceRows:body.rowCount,columnsRead:span.width,sourceColumns:lastCol}};
}

function PPS_auditorProfiles_(ss,input,perf){
  var sh=ss.getSheetByName('Auditors');if(!sh)return{rows:[],meta:{sourceRows:0,columnsRead:0,missingSheet:true}};
  var lastCol=sh.getLastColumn();if(lastCol<1)return{rows:[],meta:{sourceRows:0,columnsRead:0}};
  var hdr=sh.getRange(1,1,1,lastCol).getValues()[0]||[],hm=PPS_headerMap_(hdr),cEmail=PPS_col_(hm,['E-mail','Email','Auditor email','Auditor_Email']),cName=PPS_col_(hm,['Name','Auditor','Auditor name','Auditor Name']),cActive=PPS_col_(hm,['Active']),cRole=PPS_col_(hm,['Role','Function']),cBlocked=PPS_col_(hm,['Blocked weekdays','Default blocked weekdays','Default blocked days','Blocked weekdays (default)']),cTz=PPS_col_(hm,['Timezone','Time zone','Default timezone']),cBase=PPS_col_(hm,['Base','Home base','Home location','Location','City']),cCapacity=PPS_col_(hm,['Capacity','Expected capacity','Annual capacity','Capacity hours']),wanted=PPS_requestedSet_(input.auditorEmails||[],PPS_email_);
  var scopeEvidence=PPS_scopeNames_(input),scopeNames=scopeEvidence.names,scopeCols=[];for(var s=0;s<scopeNames.length;s++){var ci=PPS_col_(hm,[scopeNames[s]]);if(ci>=0)scopeCols.push({name:scopeNames[s],col:ci});}
  var allCols=[cEmail,cName,cActive,cRole,cBlocked,cTz,cBase,cCapacity];for(var sc=0;sc<scopeCols.length;sc++)allCols.push(scopeCols[sc].col);var span=PPS_usedSpan_(allCols),body=PPS_body_(sh,span,perf,'auditorsBulkRead'),values=body.values;
  cEmail=PPS_rel_(cEmail,span);cName=PPS_rel_(cName,span);cActive=PPS_rel_(cActive,span);cRole=PPS_rel_(cRole,span);cBlocked=PPS_rel_(cBlocked,span);cTz=PPS_rel_(cTz,span);cBase=PPS_rel_(cBase,span);cCapacity=PPS_rel_(cCapacity,span);for(var sr=0;sr<scopeCols.length;sr++)scopeCols[sr]={name:scopeCols[sr].name,col:PPS_rel_(scopeCols[sr].col,span)};
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'scopeCatalog',{activeScopes:scopeNames.length,matchedColumns:scopeCols.length,evidenceSource:scopeEvidence.source});
  var out=[];for(var r=0;r<values.length;r++){var row=values[r]||[],email=PPS_email_(PPS_val_(row,cEmail));if(!email)continue;if(wanted&&!wanted[email])continue;var qualifiedScopes=[];for(var q=0;q<scopeCols.length;q++){var v=PPS_norm_(PPS_val_(row,scopeCols[q].col));if(v==='x'||v==='yes'||v==='true'||v==='1')qualifiedScopes.push(scopeCols[q].name);}out.push({email:email,name:PPS_clean_(PPS_val_(row,cName))||email,active:PPS_clean_(PPS_val_(row,cActive)),role:PPS_clean_(PPS_val_(row,cRole)),blockedWeekdays:PPS_clean_(PPS_val_(row,cBlocked)),timezone:PPS_clean_(PPS_val_(row,cTz)),baseLocation:PPS_clean_(PPS_val_(row,cBase)),capacityHours:PPS_clean_(PPS_val_(row,cCapacity)),qualifiedScopes:qualifiedScopes});}
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'auditorsProject',{returned:out.length});return{rows:out,meta:{sourceRows:body.rowCount,columnsRead:span.width,sourceColumns:lastCol,scopeColumns:scopeCols.length,scopeEvidenceSource:scopeEvidence.source}};
}

function PlanningProfilesService_get(input){
  input=input||{};var perf=(typeof DPL_start_==='function')?DPL_start_('PlanningProfilesService_get',{companyUidCount:Array.isArray(input.companyUids)?input.companyUids.length:0,companyNameCount:Array.isArray(input.companyNames)?input.companyNames.length:0,auditorCount:Array.isArray(input.auditorEmails)?input.auditorEmails.length:0,hasScopeEvidence:!!(input.precomputedEvidence&&Array.isArray(input.precomputedEvidence.activeScopeNames))}):null;
  var ss=SpreadsheetApp.getActive(),includeCompanies=input.includeCompanies!==false,includeAuditors=input.includeAuditors!==false;
  var companies=includeCompanies?PPS_companyProfiles_(ss,input,perf):{rows:[],meta:{skipped:true}},auditors=includeAuditors?PPS_auditorProfiles_(ss,input,perf):{rows:[],meta:{skipped:true}};
  var result={success:true,build:PLANNING_PROFILES_BUILD,companies:companies.rows,auditors:auditors.rows,meta:{companyMeta:companies.meta,auditorMeta:auditors.meta,writes:false,canonicalOwners:{company:'Companies',auditor:'Auditors',scope:'Config_Scopes'}}};
  if(typeof DPL_end_==='function')result.devPerformance=DPL_end_(perf,{companies:result.companies.length,auditors:result.auditors.length});return result;
}
