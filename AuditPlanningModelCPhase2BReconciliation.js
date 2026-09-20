/**
 * AuditPlanningModelCPhase2BReconciliation.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_RECONCILIATION_R1
 * Read-only reconciliation after Scope Manager ownership cutover.
 *
 * Important difference from Phase 1 reconciliation:
 * - Per-scope expiry/cycle is canonical in Audit_Obligations.
 * - Legacy Audit planning carries only aggregate compatibility dates.
 * - Therefore a legacy global expiry must not be compared as the Cycle_Key
 *   for every certificate scope.
 */
var MODEL_C_PHASE2B_RECON_BUILD='2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_RECONCILIATION_R1';

function RUN_MODEL_C_PHASE2B_SCOPE_OWNER_RECONCILIATION(){
  var ss=SpreadsheetApp.getActive();
  var source=ModelCMigration_readSource_(ss);
  if(!source.success)throw new Error(source.error||'Unable to read source');
  var target=ModelCRecon_readTargets_(ss);
  var result=target.success?ModelCPhase2BRecon_compare_(ss,source,target):target;
  Logger.log(JSON.stringify(ModelCPhase2BRecon_compact_(result),null,2));
  if(!result.success)throw new Error('Model C Phase 2B reconciliation failed: '+(result.errors||[]).join('; '));
  return result;
}

function ModelCPhase2BRecon_compare_(ss,source,target){
  var errors=[];
  var rows=target.rows||{};
  var csRows=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[];
  var obRows=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[];
  var linkRows=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var csById={},obById={},activeByAudit={};
  csRows.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});
  obRows.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  linkRows.forEach(function(link){
    if(String(link.Link_State).toUpperCase()!=='ACTIVE')return;
    var auditId=String(link.Audit_ID||''),ob=obById[String(link.Obligation_ID||'')];
    if(!ob){errors.push('Orphan active link: '+String(link.Obligation_ID||''));return;}
    if(!activeByAudit[auditId])activeByAudit[auditId]=[];
    activeByAudit[auditId].push(ob);
  });

  var headers=source.planningHeaders||[],map=ModelCFoundation_headerMap_(headers),checkedAudits=0,checkedScopes=0;
  var tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  for(var r=0;r<(source.planningRows||[]).length;r++){
    var row=source.planningRows[r];
    var auditId=ModelCFoundation_valueByHeader_(row,map,['Audit ID']);
    var companyUid=ModelCFoundation_valueByHeader_(row,map,['Company_UID']);
    if(!auditId)continue;
    checkedAudits++;
    var selected=ModelCFoundation_selectedScopes_(headers,row,source.scopeCatalog),legacyByCode={};
    selected.forEach(function(s){legacyByCode[String(s.scopeCode)]=s;});
    var active=activeByAudit[String(auditId)]||[],modelByCode={};
    active.forEach(function(ob){
      var code=String(ob.ScopeCode||'');
      if(modelByCode[code])errors.push('Duplicate active scope for audit: '+auditId+'|'+code);
      modelByCode[code]=ob;
      var cs=csById[String(ob.Company_Scope_ID||'')];
      if(!cs)errors.push('Missing Company_Scope for audit: '+auditId+'|'+code);
      else if(String(cs.Company_UID)!==String(companyUid)||String(cs.ScopeCode)!==code)errors.push('Company identity mismatch: '+auditId+'|'+code);
      if(String(ob.Company_UID)!==String(companyUid))errors.push('Obligation company mismatch: '+auditId+'|'+code);
    });

    Object.keys(legacyByCode).forEach(function(code){
      checkedScopes++;
      var legacy=legacyByCode[code],ob=modelByCode[code];
      if(!ob){errors.push('Missing active obligation: '+auditId+'|'+code);return;}
      if(Number(legacy.formalHours)!==Number(ob.Formal_Hours))errors.push('Formal hours mismatch: '+auditId+'|'+code);
      if(!ModelCFoundation_isAbc_(code,code)){
        var base=ModelCExtension_dateInTz_(ob.Base_Expiry_Date,tz),cycle=ModelCFoundation_clean_(ob.Cycle_Key);
        if(base!==cycle)errors.push('Canonical cycle/base-expiry mismatch: '+auditId+'|'+code+' base='+base+' cycle='+cycle);
      }
    });
    Object.keys(modelByCode).forEach(function(code){if(!legacyByCode[code])errors.push('Legacy scope projection missing: '+auditId+'|'+code);});

    var cert=active.filter(function(x){return !ModelCFoundation_isAbc_(x.ScopeCode,x.ScopeCode);});
    var earliest='',effectiveEarliest='',from='',to='';
    cert.forEach(function(x){
      var e=ModelCExtension_dateInTz_(x.Base_Expiry_Date,tz),z=ModelCExtension_dateInTz_(x.Effective_Expiry_Date,tz),f=ModelCExtension_dateInTz_(x.Planning_Window_From,tz),t=ModelCExtension_dateInTz_(x.Planning_Window_To,tz);
      if(e&&(!earliest||e<earliest))earliest=e;
      if(z&&(!effectiveEarliest||z<effectiveEarliest))effectiveEarliest=z;
      if(f&&(!from||f>from))from=f;
      if(t&&(!to||t<to))to=t;
    });
    var legacyExpiry=ModelCFoundation_valueByHeader_(row,map,['Date - Will Expire']);
    var legacyEffective=ModelCFoundation_valueByHeader_(row,map,['Extended Expiration Date']);
    var legacyFrom=ModelCFoundation_valueByHeader_(row,map,['Planning window from']);
    var legacyTo=ModelCFoundation_valueByHeader_(row,map,['Planning window to']);
    if(legacyExpiry!==earliest)errors.push('Compatibility expiry mismatch: '+auditId+' expected='+earliest+' actual='+legacyExpiry);
    if(legacyEffective!==(effectiveEarliest||earliest))errors.push('Compatibility effective expiry mismatch: '+auditId);
    if(legacyFrom!==from)errors.push('Compatibility planning-window-from mismatch: '+auditId+' expected='+from+' actual='+legacyFrom);
    if(legacyTo!==to)errors.push('Compatibility planning-window-to mismatch: '+auditId+' expected='+to+' actual='+legacyTo);

    var legacyPre=ModelCFoundation_valueByHeader_(row,map,['Preassigned Auditor']).toLowerCase();
    var legacySelf=ModelCFoundation_valueByHeader_(row,map,['Allow self planning']);
    active.forEach(function(ob){
      if(ModelCFoundation_clean_(ob.Preassigned_Auditor_Email).toLowerCase()!==legacyPre)errors.push('Preassigned auditor mismatch: '+auditId+'|'+String(ob.ScopeCode||''));
      if(ModelCFoundation_clean_(ob.Allow_Self_Planning)!==legacySelf)errors.push('Allow self planning mismatch: '+auditId+'|'+String(ob.ScopeCode||''));
    });
  }

  return{
    success:errors.length===0,
    build:MODEL_C_PHASE2B_RECON_BUILD,
    readOnly:true,
    writesPerformed:false,
    counts:{sourceRows:(source.planningRows||[]).length,checkedAudits:checkedAudits,checkedScopes:checkedScopes,companyScopes:csRows.length,obligations:obRows.length,visitLinks:linkRows.length},
    gates:{scopeProjection:errors.filter(function(x){return /active obligation|Legacy scope projection|Duplicate active scope/.test(x);}).length===0,formalHours:errors.filter(function(x){return /Formal hours/.test(x);}).length===0,perScopeCycle:errors.filter(function(x){return /cycle\/base-expiry/.test(x);}).length===0,compatibilityDates:errors.filter(function(x){return /Compatibility/.test(x);}).length===0,companyIdentity:errors.filter(function(x){return /company|Company identity/.test(x);}).length===0,assignmentProjection:errors.filter(function(x){return /Preassigned auditor|Allow self planning/.test(x);}).length===0},
    errors:errors.slice(0,50)
  };
}

function ModelCPhase2BRecon_compact_(result){
  return{success:result.success===true,build:result.build||MODEL_C_PHASE2B_RECON_BUILD,readOnly:true,writesPerformed:false,counts:result.counts||{},gates:result.gates||{},errors:result.errors||[]};
}
