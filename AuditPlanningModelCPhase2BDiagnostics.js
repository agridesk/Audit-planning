/**
 * AMS-01.6 Model C Phase 2B diagnostics.
 * Read-only. No writes.
 */
var MODEL_C_PHASE2B_DIAG_BUILD='2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_DIAG_R1';

function RUN_MODEL_C_PHASE2B_TEST_AUDIT_DIAGNOSTIC(){
  var ss=SpreadsheetApp.getActive();
  var auditId='AUD_TEST_AcceptedDelta_HQ_1777979469906_101';
  var ap=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!ap)throw new Error('Missing Audit planning');
  var values=ap.getDataRange().getValues();
  var headers=values[0]||[];
  var map=ModelCFoundation_headerMap_(headers);
  var rowIndex=ModelCExtension_findRow_(values,map,'Audit ID',auditId);
  if(!rowIndex)throw new Error('Test audit not found: '+auditId);
  var row=values[rowIndex-1];
  var companyUid=ModelCFoundation_valueByHeader_(row,map,['Company_UID']);
  var status=ModelCFoundation_valueByHeader_(row,map,['Status']);
  var source=ModelCMigration_readSource_(ss);
  if(!source.success)throw new Error(source.error||'Unable to read source');
  var legacyScopes=ModelCFoundation_selectedScopes_(headers,row,source.scopeCatalog);

  var target=ModelCRecon_readTargets_(ss);
  if(!target.success)throw new Error((target.errors||[]).join('; '));
  var rows=target.rows||{},obRows=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],linkRows=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var obById={}; obRows.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  var modelScopes=[];
  linkRows.forEach(function(x){
    if(String(x.Audit_ID)!==auditId||String(x.Link_State).toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(x.Obligation_ID||'')]; if(!ob)return;
    modelScopes.push({scope:String(ob.ScopeCode||''),formalHours:ob.Formal_Hours,baseExpiry:ModelCExtension_dateInTz_(ob.Base_Expiry_Date,ss.getSpreadsheetTimeZone()),effectiveExpiry:ModelCExtension_dateInTz_(ob.Effective_Expiry_Date,ss.getSpreadsheetTimeZone()),windowFrom:ModelCExtension_dateInTz_(ob.Planning_Window_From,ss.getSpreadsheetTimeZone()),windowTo:ModelCExtension_dateInTz_(ob.Planning_Window_To,ss.getSpreadsheetTimeZone()),sourceAuditId:String(ob.Source_Audit_ID||'')});
  });

  var hdr=m5t_makeHeaderMap_(headers),uidCol=m5t_pickHeader_(hdr,['Company_UID']),auditIdCol=m5t_pickHeader_(hdr,['Audit ID','Audit_ID','AuditId']),statusCol=m5t_pickHeader_(hdr,['Status','STATUS']);
  var matches=[];
  for(var r=1;r<values.length;r++)if(String(values[r][uidCol]||'').trim()===companyUid)matches.push({rowIndex1:r+1,row:values[r]});
  var selected=matches.length?m5t_selectActiveAuditRow_(matches,hdr):null;
  var scopeManagerAuditId=selected&&auditIdCol>=0?String(selected.row[auditIdCol]||'').trim():'';
  var companyAudits=matches.map(function(m){return{rowIndex1:m.rowIndex1,auditId:auditIdCol>=0?String(m.row[auditIdCol]||'').trim():'',status:statusCol>=0?String(m.row[statusCol]||'').trim():''};});

  var out={success:true,build:MODEL_C_PHASE2B_DIAG_BUILD,readOnly:true,writesPerformed:false,testAudit:{auditId:auditId,rowIndex1:rowIndex,companyUid:companyUid,status:status,legacyScopes:legacyScopes.map(function(s){return{scope:s.scopeCode,formalHours:s.formalHours};}),modelScopes:modelScopes},scopeManagerSelection:{auditId:scopeManagerAuditId,targetsTestAudit:scopeManagerAuditId===auditId,companyAudits:companyAudits}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
