/**
 * AMS-01.6 Model C — Auditor grid expiry projection.
 * Canonical owner: Audit_Obligations per scope.
 * Single expirationDate remains compatibility/display projection only.
 */
var MODEL_C_AUDITOR_PROJECTION_BUILD='2026-09-21_AMS_01_6_MODEL_C_AUDITOR_PROJECTION_R2_CANONICAL';

function ModelCAuditorProjection_rows_(sheet){
  if(!sheet||sheet.getLastRow()<2||sheet.getLastColumn()<1)return[];
  return ModelCMigration_rowsToObjects_(sheet.getDataRange().getValues());
}

function ModelCAuditorProjection_buildIndex_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!csSheet||!obSheet||!lkSheet)throw new Error('Model C auditor projection sheets missing');
  var cs=ModelCAuditorProjection_rows_(csSheet),ob=ModelCAuditorProjection_rows_(obSheet),lk=ModelCAuditorProjection_rows_(lkSheet);
  var cfg=ModelCRecurringConfig_byCode_(ss),csById={},obById={},byAudit={};
  cs.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});
  ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){
    if(String(x.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var auditId=String(x.Audit_ID||'').trim(),obligation=obById[String(x.Obligation_ID||'')];
    if(!auditId||!obligation)return;
    var state=String(obligation.Obligation_State||'').toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED'||state==='COMPLETED')return;
    var scope=csById[String(obligation.Company_Scope_ID||'')];
    if(!scope)return;
    (byAudit[auditId]=byAudit[auditId]||[]).push({scope:scope,obligation:obligation});
  });
  var out={};
  Object.keys(byAudit).forEach(function(auditId){
    var linked=byAudit[auditId],scopeExpiries=[],recurringExpiries=[];
    linked.forEach(function(pair){
      var scopeCode=String(pair.scope.ScopeCode||''),def=cfg[scopeCode];
      if(!def)throw new Error('Config_Scopes missing scope: '+scopeCode);
      var recurring=def.recurring===true;
      var base=ModelCAuditorProjection_date_(pair.obligation.Base_Expiry_Date,ss);
      var effective=ModelCAuditorProjection_date_(pair.obligation.Effective_Expiry_Date,ss)||base;
      var from=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_From,ss);
      var to=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_To,ss);
      scopeExpiries.push({scopeCode:scopeCode,recurring:recurring,lifecycleType:recurring?'CERTIFICATE_RECURRING':'NON_RECURRING',baseExpiry:recurring?base:'',effectiveExpiry:recurring?effective:'',planningWindowFrom:from,planningWindowTo:to});
      if(recurring&&effective)recurringExpiries.push(effective);
    });
    recurringExpiries.sort();
    scopeExpiries.sort(function(a,b){return String(a.scopeCode).localeCompare(String(b.scopeCode));});
    out[auditId]={auditId:auditId,expirationDate:recurringExpiries.length?recurringExpiries[0]:'',scopeExpiries:scopeExpiries,source:'MODEL_C'};
  });
  return out;
}

function ModelCAuditorProjection_date_(value,ss){
  if(value===null||value===undefined||value==='')return '';
  if(typeof ModelCExtension_dateInTz_==='function')return ModelCExtension_dateInTz_(value,ss.getSpreadsheetTimeZone());
  if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value.getTime()))return Utilities.formatDate(value,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  var s=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}

function ModelCAuditorProjection_applyToGrid_(grid,ss){
  if(!grid||grid.success!==true||!Array.isArray(grid.rows))return grid;
  ss=ss||SpreadsheetApp.getActive();
  var index=ModelCAuditorProjection_buildIndex_(ss),projected=0,missing=[];
  grid.rows=grid.rows.map(function(row){
    row=row||{};
    var out={};Object.keys(row).forEach(function(k){out[k]=row[k];});
    var auditId=String(row.auditId||row.auditID||'').trim(),p=index[auditId];
    if(!auditId)return out;
    if(!p){missing.push(auditId);return out;}
    out.expirationDate=p.expirationDate;
    out.scopeExpiries=p.scopeExpiries;
    out.expirationSource='MODEL_C';
    projected++;
    return out;
  });
  grid.modelCExpiryProjection={build:MODEL_C_AUDITOR_PROJECTION_BUILD,projectedRows:projected,missingAuditIds:missing};
  return grid;
}

function RUN_MODEL_C_AUDITOR_EXPIRY_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive(),ap=ss.getSheetByName('Audit planning');
  if(!ap)throw new Error('Missing Audit planning');
  var values=ap.getDataRange().getValues(),hdr=values[0]||[],idCol=hdr.indexOf('Audit ID');
  if(idCol<0)throw new Error('Missing Audit ID');
  var fakeRows=[];
  for(var r=1;r<values.length;r++){var id=String(values[r][idCol]||'').trim();if(id)fakeRows.push({auditId:id,expirationDate:'LEGACY'});}
  var projected=ModelCAuditorProjection_applyToGrid_({success:true,rows:fakeRows},ss),index=ModelCAuditorProjection_buildIndex_(ss),errors=[],recurringAudits=0,nonRecurringOnlyAudits=0,modelResolved=0,legacyLeft=0,scopeRows=0;
  projected.rows.forEach(function(row){
    var p=index[String(row.auditId||'')];
    if(!p){errors.push('Missing Model C projection: '+row.auditId);return;}
    scopeRows+=p.scopeExpiries.length;
    var recurring=p.scopeExpiries.filter(function(x){return x.recurring===true;});
    if(recurring.length)recurringAudits++;else nonRecurringOnlyAudits++;
    if(row.expirationSource==='MODEL_C')modelResolved++;
    if(row.expirationDate==='LEGACY')legacyLeft++;
    if(String(row.expirationDate||'')!==String(p.expirationDate||''))errors.push('Expiry mismatch: '+row.auditId);
    p.scopeExpiries.forEach(function(s){if(s.recurring!==true&&(s.baseExpiry||s.effectiveExpiry))errors.push('Non-recurring expiry exposed: '+row.auditId+'|'+s.scopeCode);});
  });
  var nonRecurringLeak=errors.filter(function(x){return x.indexOf('Non-recurring expiry exposed:')===0;}).length;
  var out={success:errors.length===0&&legacyLeft===0&&modelResolved===fakeRows.length,build:MODEL_C_AUDITOR_PROJECTION_BUILD,readOnly:true,writesPerformed:false,owner:'Config_Scopes.Recurring + Audit_Obligations',counts:{auditRows:fakeRows.length,recurringAudits:recurringAudits,nonRecurringOnlyAudits:nonRecurringOnlyAudits,modelResolved:modelResolved,scopeRows:scopeRows,legacyExpiryLeft:legacyLeft,nonRecurringExpiryLeaks:nonRecurringLeak},gates:{allAuditRowsBackedByModelC:errors.filter(function(x){return x.indexOf('Missing Model C projection:')===0;}).length===0,expiryDerivedFromPerScopeObligations:legacyLeft===0,nonRecurringExpiryBlank:nonRecurringLeak===0},errors:errors.slice(0,25),samples:projected.rows.slice(0,8).map(function(x){return{auditId:x.auditId,expirationDate:x.expirationDate,scopeExpiries:x.scopeExpiries};})};
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C auditor expiry acceptance failed');
  return out;
}
