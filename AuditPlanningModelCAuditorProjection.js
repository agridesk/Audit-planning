/**
 * AMS-01.6 Model C — Auditor grid expiry projection.
 * Canonical owner: Audit_Obligations per scope.
 * The auditor grid keeps a single expirationDate only as a derived compatibility/display projection.
 */
var MODEL_C_AUDITOR_PROJECTION_BUILD='2026-09-20_AMS_01_6_MODEL_C_AUDITOR_PROJECTION_R1';

function ModelCAuditorProjection_buildIndex_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var target=ModelCRecon_readTargets_(ss), rows=target.rows||{};
  var cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[];
  var ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[];
  var lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var csById={},obById={},byAudit={};
  cs.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});
  ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){
    if(String(x.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var auditId=String(x.Audit_ID||'').trim();
    var obligation=obById[String(x.Obligation_ID||'')];
    if(!auditId||!obligation)return;
    var state=String(obligation.Obligation_State||'').toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED')return;
    var scope=csById[String(obligation.Company_Scope_ID||'')];
    if(!scope)return;
    (byAudit[auditId]=byAudit[auditId]||[]).push({scope:scope,obligation:obligation});
  });
  var out={};
  Object.keys(byAudit).forEach(function(auditId){
    var linked=byAudit[auditId], scopeExpiries=[], certExpiries=[];
    linked.forEach(function(pair){
      var scopeCode=String(pair.scope.ScopeCode||'');
      var lifecycle=String(pair.scope.Lifecycle_Type||'');
      var base=ModelCAuditorProjection_date_(pair.obligation.Base_Expiry_Date,ss);
      var effective=ModelCAuditorProjection_date_(pair.obligation.Effective_Expiry_Date,ss)||base;
      var from=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_From,ss);
      var to=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_To,ss);
      var externalAnnual=lifecycle==='EXTERNAL_ANNUAL'||ModelCFoundation_isAbc_(scopeCode,scopeCode);
      scopeExpiries.push({scopeCode:scopeCode,lifecycleType:lifecycle,baseExpiry:externalAnnual?'':base,effectiveExpiry:externalAnnual?'':effective,planningWindowFrom:from,planningWindowTo:to});
      if(!externalAnnual&&effective)certExpiries.push(effective);
    });
    certExpiries.sort();
    scopeExpiries.sort(function(a,b){return String(a.scopeCode).localeCompare(String(b.scopeCode));});
    out[auditId]={auditId:auditId,expirationDate:certExpiries.length?certExpiries[0]:'',scopeExpiries:scopeExpiries,source:'MODEL_C'};
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
  var index=ModelCAuditorProjection_buildIndex_(ss), projected=0, missing=[];
  grid.rows=grid.rows.map(function(row){
    row=row||{};
    var out={}; Object.keys(row).forEach(function(k){out[k]=row[k];});
    var auditId=String(row.auditId||row.auditID||'').trim(), p=index[auditId];
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
  var ss=SpreadsheetApp.getActive();
  var ap=ss.getSheetByName('Audit planning');
  if(!ap)throw new Error('Missing Audit planning');
  var values=ap.getDataRange().getValues(), hdr=values[0]||[], idCol=hdr.indexOf('Audit ID');
  if(idCol<0)throw new Error('Missing Audit ID');
  var fakeRows=[];
  for(var r=1;r<values.length;r++){
    var id=String(values[r][idCol]||'').trim();
    if(id)fakeRows.push({auditId:id,expirationDate:'LEGACY'});
  }
  var projected=ModelCAuditorProjection_applyToGrid_({success:true,rows:fakeRows},ss);
  var index=ModelCAuditorProjection_buildIndex_(ss),errors=[],certificate=0,abcOnly=0,modelResolved=0,legacyLeft=0,scopeRows=0;
  projected.rows.forEach(function(row){
    var p=index[String(row.auditId||'')];
    if(!p){errors.push('Missing Model C projection: '+row.auditId);return;}
    scopeRows+=p.scopeExpiries.length;
    var cert=p.scopeExpiries.filter(function(x){return !!x.effectiveExpiry;});
    if(cert.length)certificate++; else abcOnly++;
    if(row.expirationSource==='MODEL_C')modelResolved++;
    if(row.expirationDate==='LEGACY')legacyLeft++;
    if(String(row.expirationDate||'')!==String(p.expirationDate||''))errors.push('Expiry mismatch: '+row.auditId);
  });
  var out={success:errors.length===0&&legacyLeft===0&&modelResolved===fakeRows.length,build:MODEL_C_AUDITOR_PROJECTION_BUILD,readOnly:true,writesPerformed:false,counts:{auditRows:fakeRows.length,certificateAudits:certificate,abcOnlyAudits:abcOnly,modelResolved:modelResolved,scopeRows:scopeRows,legacyExpiryLeft:legacyLeft},gates:{allAuditRowsBackedByModelC:errors.filter(function(x){return x.indexOf('Missing Model C projection')===0;}).length===0,expiryDerivedFromPerScopeObligations:legacyLeft===0,abcOnlyExpiryBlank:projected.rows.filter(function(x){var p=index[x.auditId],cert=p&&p.scopeExpiries.filter(function(s){return !!s.effectiveExpiry;});return p&&cert.length===0&&String(x.expirationDate||'')!=='';}).length===0},errors:errors.slice(0,25),samples:projected.rows.slice(0,8).map(function(x){return{auditId:x.auditId,expirationDate:x.expirationDate,scopeExpiries:x.scopeExpiries};})};
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C auditor expiry acceptance failed');
  return out;
}
