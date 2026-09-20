/**
 * AuditPlanningModelCPhase2BReconciliation.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_RECONCILIATION_R2
 * Read-only reconciliation after Scope Manager ownership cutover.
 *
 * Important differences from Phase 1 reconciliation:
 * - Per-scope expiry/cycle is canonical in Audit_Obligations.
 * - Legacy Audit planning carries only aggregate compatibility dates.
 * - MPS-ABC has no certificate expiry. Historic fake ABC compatibility dates in
 *   untouched legacy rows are migration debt and are reported as warnings only.
 */
var MODEL_C_PHASE2B_RECON_BUILD='2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_RECONCILIATION_R2';

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
  var scopeErrors=[],formalErrors=[],cycleErrors=[],compatErrors=[],identityErrors=[],assignmentErrors=[],warnings=[];
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
    if(!ob){scopeErrors.push('Orphan active link: '+String(link.Obligation_ID||''));return;}
    if(!activeByAudit[auditId])activeByAudit[auditId]=[];
    activeByAudit[auditId].push(ob);
  });

  var headers=source.planningHeaders||[],map=ModelCFoundation_headerMap_(headers),checkedAudits=0,checkedScopes=0,abcLegacyDebtAudits=0;
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
      if(modelByCode[code])scopeErrors.push('Duplicate active scope for audit: '+auditId+'|'+code);
      modelByCode[code]=ob;
      var cs=csById[String(ob.Company_Scope_ID||'')];
      if(!cs)identityErrors.push('Missing Company_Scope for audit: '+auditId+'|'+code);
      else if(String(cs.Company_UID)!==String(companyUid)||String(cs.ScopeCode)!==code)identityErrors.push('Company identity mismatch: '+auditId+'|'+code);
      if(String(ob.Company_UID)!==String(companyUid))identityErrors.push('Obligation company mismatch: '+auditId+'|'+code);
    });

    Object.keys(legacyByCode).forEach(function(code){
      checkedScopes++;
      var legacy=legacyByCode[code],ob=modelByCode[code];
      if(!ob){scopeErrors.push('Missing active obligation: '+auditId+'|'+code);return;}
      if(Number(legacy.formalHours)!==Number(ob.Formal_Hours))formalErrors.push('Formal hours mismatch: '+auditId+'|'+code+' legacy='+legacy.formalHours+' model='+ob.Formal_Hours);
      if(!ModelCFoundation_isAbc_(code,code)){
        var base=ModelCExtension_dateInTz_(ob.Base_Expiry_Date,tz),cycle=ModelCFoundation_clean_(ob.Cycle_Key);
        if(base!==cycle)cycleErrors.push('Canonical cycle/base-expiry mismatch: '+auditId+'|'+code+' base='+base+' cycle='+cycle);
      }
    });
    Object.keys(modelByCode).forEach(function(code){if(!legacyByCode[code])scopeErrors.push('Legacy scope projection missing: '+auditId+'|'+code);});

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

    if(cert.length){
      if(legacyExpiry!==earliest)compatErrors.push('Compatibility expiry mismatch: '+auditId+' expected='+earliest+' actual='+legacyExpiry);
      if(legacyEffective!==(effectiveEarliest||earliest))compatErrors.push('Compatibility effective expiry mismatch: '+auditId+' expected='+(effectiveEarliest||earliest)+' actual='+legacyEffective);
      if(legacyFrom!==from)compatErrors.push('Compatibility planning-window-from mismatch: '+auditId+' expected='+from+' actual='+legacyFrom);
      if(legacyTo!==to)compatErrors.push('Compatibility planning-window-to mismatch: '+auditId+' expected='+to+' actual='+legacyTo);
    }else if(active.length){
      if(legacyExpiry||legacyEffective||legacyFrom||legacyTo){
        abcLegacyDebtAudits++;
        if(warnings.length<25)warnings.push('Legacy ABC compatibility dates retained pending cleanup: '+auditId);
      }
    }

    var legacyPre=ModelCFoundation_valueByHeader_(row,map,['Preassigned Auditor']).toLowerCase();
    var legacySelf=ModelCFoundation_valueByHeader_(row,map,['Allow self planning']);
    active.forEach(function(ob){
      if(ModelCFoundation_clean_(ob.Preassigned_Auditor_Email).toLowerCase()!==legacyPre)assignmentErrors.push('Preassigned auditor mismatch: '+auditId+'|'+String(ob.ScopeCode||''));
      if(ModelCFoundation_clean_(ob.Allow_Self_Planning)!==legacySelf)assignmentErrors.push('Allow self planning mismatch: '+auditId+'|'+String(ob.ScopeCode||''));
    });
  }

  var errors=formalErrors.concat(cycleErrors,scopeErrors,identityErrors,assignmentErrors,compatErrors);
  return{
    success:errors.length===0,
    build:MODEL_C_PHASE2B_RECON_BUILD,
    readOnly:true,
    writesPerformed:false,
    counts:{sourceRows:(source.planningRows||[]).length,checkedAudits:checkedAudits,checkedScopes:checkedScopes,companyScopes:csRows.length,obligations:obRows.length,visitLinks:linkRows.length,abcLegacyDebtAudits:abcLegacyDebtAudits},
    gates:{scopeProjection:scopeErrors.length===0,formalHours:formalErrors.length===0,perScopeCycle:cycleErrors.length===0,compatibilityDates:compatErrors.length===0,companyIdentity:identityErrors.length===0,assignmentProjection:assignmentErrors.length===0},
    errorCounts:{formalHours:formalErrors.length,perScopeCycle:cycleErrors.length,scopeProjection:scopeErrors.length,companyIdentity:identityErrors.length,assignmentProjection:assignmentErrors.length,compatibilityDates:compatErrors.length},
    warningCount:abcLegacyDebtAudits,
    warnings:warnings,
    errors:errors.slice(0,50)
  };
}

function ModelCPhase2BRecon_compact_(result){
  return{success:result.success===true,build:result.build||MODEL_C_PHASE2B_RECON_BUILD,readOnly:true,writesPerformed:false,counts:result.counts||{},gates:result.gates||{},errorCounts:result.errorCounts||{},warningCount:result.warningCount||0,warnings:result.warnings||[],errors:result.errors||[]};
}
