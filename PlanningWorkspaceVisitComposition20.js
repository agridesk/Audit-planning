/**
 * Issue #87 — DEV Planning Workspace focused Model C composition inspection.
 * READ ONLY. No writes, no new lifecycle and no implication of commit readiness.
 * A manager must deliberately request this view; not part of initial bootstrap.
 */
var AMS_VISIT_COMPOSITION_WORKSPACE_BUILD='2026-11-11_ISSUE87_FOCUSED_READONLY_R1';
function PWVC20_clean_(x){return String(x==null?'':x).trim();}
function PWVC20_norm_(x){return PWVC20_clean_(x).toUpperCase().replace(/[\s-]+/g,'_');}
function PWVC20_header_(headers,name){return headers.findIndex(function(x){return PWVC20_clean_(x).toLowerCase()===name.toLowerCase();});}
function PWVC20_col_(headers,name){var i=PWVC20_header_(headers,name);if(i<0)throw Error('VISIT_COMPOSITION_SOURCE_SCHEMA_MISSING_'+name);return i;}
function PWVC20_date_(value){
 if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value.getTime()))
  return Utilities.formatDate(value,Session.getScriptTimeZone(),'yyyy-MM-dd');
 var s=PWVC20_clean_(value);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):s;
}
function PWVC20_tab_(ss,name){
 var sheet=ss.getSheetByName(name);if(!sheet)throw Error('VISIT_COMPOSITION_TAB_MISSING_'+name);
 var values=sheet.getDataRange().getValues();
 if(!Array.isArray(values)||!values.length||!Array.isArray(values[0]))
  throw Error('VISIT_COMPOSITION_TAB_EMPTY_'+name);
 return values;
}
function PlanningWorkspaceVisitComposition20_preview(input){
 input=input||{};
 if(typeof V5_ENTRY_isDevEnv_!=='function'||!V5_ENTRY_isDevEnv_())
  throw Error('VISIT_COMPOSITION_DEV_ONLY');
 var token=PWVC20_clean_(input.trustedToken||input.token),
  device=PWVC20_clean_(input.deviceFingerprint||input.deviceId);
 if(!token||!device||typeof V5_AUTH==='undefined'||
    typeof V5_AUTH.validateTrustedTokenByRole!=='function')
  throw Error('VISIT_COMPOSITION_MANAGER_AUTH_REQUIRED');
 var auth=V5_AUTH.validateTrustedTokenByRole(token,'Manager',device);
 if(!auth||auth.ok!==true||!PWVC20_clean_(auth.email))
  throw Error('VISIT_COMPOSITION_MANAGER_AUTH_REQUIRED');
 var claimed=PWVC20_clean_(input.actorEmail).toLowerCase();
 if(claimed&&claimed!==PWVC20_clean_(auth.email).toLowerCase())
  throw Error('VISIT_COMPOSITION_MANAGER_IDENTITY_MISMATCH');
 var auditId=PWVC20_clean_(input.auditId);
 if(!auditId||auditId.length>180||/[\/]/.test(auditId))
  throw Error('VISIT_COMPOSITION_AUDIT_ID_INVALID');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 var planning=PWVC20_tab_(ss,'Audit planning'),
  obligations=PWVC20_tab_(ss,'Audit_Obligations'),
  links=PWVC20_tab_(ss,'Audit_Visit_Obligations'),
  config=PWVC20_tab_(ss,'Config_Scopes');
 var ph=planning[0],auditColumn=PWVC20_col_(ph,'Audit ID'),
  statusColumn=PWVC20_col_(ph,'Status'),companyColumn=PWVC20_col_(ph,'Company_UID');
 var sources=planning.slice(1).filter(function(r){return PWVC20_clean_(r[auditColumn])===auditId;});
 if(sources.length!==1)throw Error('VISIT_COMPOSITION_SOURCE_AUDIT_NOT_UNIQUE');
 var source=sources[0],companyUid=PWVC20_clean_(source[companyColumn]);
 if(!companyUid||PWVC20_norm_(source[statusColumn])!=='PENDING_PLANNING')
  throw Error('VISIT_COMPOSITION_SOURCE_NOT_PENDING_PLANNING');
 var lh=links[0],linkAudit=PWVC20_col_(lh,'Audit_ID'),
  linkOb=PWVC20_col_(lh,'Obligation_ID'),linkState=PWVC20_col_(lh,'Link_State'),
  active=links.slice(1).filter(function(r){return PWVC20_norm_(r[linkState])==='ACTIVE';}),
  selected=active.filter(function(r){return PWVC20_clean_(r[linkAudit])===auditId;}),
  selectedIds=selected.map(function(r){return PWVC20_clean_(r[linkOb]);});
 if(!selectedIds.length||selectedIds.some(function(x){return !x;})||
    new Set(selectedIds).size!==selectedIds.length)
  throw Error('VISIT_COMPOSITION_SOURCE_LINKS_INVALID');
 if(active.some(function(r){return PWVC20_clean_(r[linkAudit])!==auditId&&
      selectedIds.indexOf(PWVC20_clean_(r[linkOb]))>=0;}))
  throw Error('VISIT_COMPOSITION_ACTIVE_LINK_CONFLICT');
 var oh=obligations[0],obId=PWVC20_col_(oh,'Obligation_ID'),
  obCompany=PWVC20_col_(oh,'Company_UID'),
  obScope=PWVC20_col_(oh,'ScopeCode'),
  obHours=PWVC20_col_(oh,'Formal_Hours'),
  obExpiry=PWVC20_col_(oh,'Effective_Expiry_Date'),
  obFrom=PWVC20_col_(oh,'Planning_Window_From'),
  obTo=PWVC20_col_(oh,'Planning_Window_To');
 var selectedObligations=obligations.slice(1).filter(function(r){
  return selectedIds.indexOf(PWVC20_clean_(r[obId]))>=0;
 });
 if(selectedObligations.length!==selectedIds.length||
    new Set(selectedObligations.map(function(r){return PWVC20_clean_(r[obId]);})).size!==selectedIds.length)
  throw Error('VISIT_COMPOSITION_OBLIGATION_MEMBERSHIP_INVALID');
 var ch=config[0],configCode=PWVC20_col_(ch,'ScopeCode'),
  configName=PWVC20_col_(ch,'DisplayName'),
  codes=new Map();
 config.slice(1).forEach(function(row){
  var code=PWVC20_clean_(row[configCode]).toLowerCase();
  if(!code)return;
  if(codes.has(code))throw Error('VISIT_COMPOSITION_SCOPE_CATALOG_DUPLICATE');
  codes.set(code,PWVC20_clean_(row[configName]));
 });
 var scopeRows=selectedObligations.map(function(row){
  var code=PWVC20_clean_(row[obScope]),raw=PWVC20_clean_(row[obHours]).replace(',','.'),
   hrs=raw?Number(raw):NaN;
  if(PWVC20_clean_(row[obCompany])!==companyUid||!code||!codes.has(code.toLowerCase()))
   throw Error('VISIT_COMPOSITION_COMPANY_SCOPE_IDENTITY_INVALID');
  return {obligationId:PWVC20_clean_(row[obId]),scopeCode:code,
   scopeName:codes.get(code.toLowerCase())||code,
   requiredHours:Number.isFinite(hrs)&&hrs>0?hrs:null,
   effectiveExpiry:PWVC20_date_(row[obExpiry]),
   windowFrom:PWVC20_date_(row[obFrom]),windowTo:PWVC20_date_(row[obTo])};
 });
 var missing=scopeRows.filter(function(x){return x.requiredHours===null;}).map(function(x){return x.obligationId;});
 var revised=PlanningRevisionTokenService_get({auditId:auditId});
 if(!PWVC20_clean_(revised&&revised.revision))
  throw Error('VISIT_COMPOSITION_SOURCE_REVISION_UNAVAILABLE');
 return {success:true,readOnly:true,canCommit:false,auditId:auditId,
  companyUid:companyUid,sourceRevision:PWVC20_clean_(revised.revision),
  sourceStatus:PWVC20_clean_(source[statusColumn]),
  compositionOptions:scopeRows.length>1?['TOGETHER','SEPARATELY']:['SINGLE'],
  scopes:scopeRows,missingRequiredHours:missing,
  formalHoursComplete:missing.length===0,
  totalFormalHours:missing.length?null:scopeRows.reduce(function(n,x){return n+x.requiredHours;},0),
  reason:'ATOMIC_WRITER_NOT_CONNECTED',build:AMS_VISIT_COMPOSITION_WORKSPACE_BUILD};
}
