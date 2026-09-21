/**
 * AMS-01.6 Model C — ECAS stale canonical cleanup readiness.
 * Read-only. Classifies stale MPS-ABC obligations that are absent from the
 * current explicit ECAS batch before any lifecycle cleanup is allowed.
 *
 * Canonical deselection policy remains:
 * - preserve history;
 * - Company_Scope -> Active NO;
 * - open obligation -> CANCELLED;
 * - active visit link -> INACTIVE;
 * - never delete historical rows.
 *
 * This audit additionally determines whether the linked Audit planning visit
 * still has any other active Model C obligations. Visits that would become
 * empty require separate visit/status handling and are not mutated here.
 */
var MODEL_C_ECAS_STALE_CLEANUP_READINESS_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_STALE_CLEANUP_READINESS_R1';

function RUN_MODEL_C_ECAS_STALE_CLEANUP_READINESS(){
  var ss=SpreadsheetApp.getActive();
  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  var out={success:false,build:MODEL_C_ECAS_STALE_CLEANUP_READINESS_BUILD,batchYear:String(importPlan&&importPlan.batchYear||''),readOnly:true,writesPerformed:false,counts:{staleCanonical:0,zeroHours:0,positiveHours:0,testCompanies:0,visitsWithOtherActiveObligations:0,visitsThatWouldBecomeEmpty:0,companyScopesCurrentlyActive:0,companyScopesAlreadyInactive:0,unsafeVisitStatus:0},gates:{},errors:[],items:[]};
  if(!importPlan||importPlan.success!==true){out.errors.push('ECAS import preview is not clean');Logger.log(JSON.stringify(out,null,2));return out;}

  var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS),apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING),companies=ss.getSheetByName('Companies');
  if(!csSheet||!obSheet||!lkSheet||!apSheet||!companies){out.errors.push('Required sheet missing');Logger.log(JSON.stringify(out,null,2));return out;}

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;});

  var cs=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues());
  var ob=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var lk=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues=apSheet.getDataRange().getValues(),apHeaders=apValues[0]||[],apMap=ModelCFoundation_headerMap_(apHeaders);
  var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']),ixStatus=ModelCEcasVisitMaterialization_header_(apMap,['Status']);
  var apByAudit={};
  for(var r=1;r<apValues.length;r++){var aid=ixAudit>=0?String(apValues[r][ixAudit]||'').trim():'';if(aid)apByAudit[aid]={status:ixStatus>=0?String(apValues[r][ixStatus]||'').trim():''};}

  var cv=companies.getDataRange().getValues(),ch=cv[0]||[],cm=ModelCFoundation_headerMap_(ch),ixUid=ModelCEcasAnnualImport_header_(cm,['Company_UID','Company UID']),ixNum=ModelCEcasAnnualImport_header_(cm,['Number','MPS-nummer','MPS nummer']),ixName=ModelCEcasAnnualImport_header_(cm,['Company','Company name','Name']);
  var companyByUid={};
  for(var cr=1;cr<cv.length;cr++){var uid=ixUid>=0?String(cv[cr][ixUid]||'').trim():'';if(uid)companyByUid[uid]={mpsNumber:ixNum>=0?String(cv[cr][ixNum]||'').trim():'',company:ixName>=0?String(cv[cr][ixName]||'').trim():''};}

  var csById={},obById={},activeLinksByOb={},activeLinksByAudit={};
  cs.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});
  ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){if(String(x.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;var oid=String(x.Obligation_ID||'').trim(),aid=String(x.Audit_ID||'').trim();if(!oid||!aid)return;(activeLinksByOb[oid]||(activeLinksByOb[oid]=[])).push(x);(activeLinksByAudit[aid]||(activeLinksByAudit[aid]=[])).push(x);});

  ob.forEach(function(x){
    if(String(x.ScopeCode||'').trim().toUpperCase()!=='MPS-ABC')return;
    if(String(x.Trigger_Source||'').trim().toUpperCase()!=='ECAS')return;
    if(String(x.Cycle_Key||'').trim()!==out.batchYear)return;
    var state=String(x.Obligation_State||'').trim().toUpperCase();
    if(state==='COMPLETED'||state==='CANCELLED'||state==='REJECTED')return;
    var uid=String(x.Company_UID||'').trim();if(sourceUid[uid])return;

    out.counts.staleCanonical++;
    var hours=Number(String(x.Formal_Hours==null?'':x.Formal_Hours).replace(',','.'));if(isFinite(hours)&&hours>0)out.counts.positiveHours++;else out.counts.zeroHours++;
    var company=companyByUid[uid]||{mpsNumber:'',company:''};var testCompany=/^TEST[_\s-]/i.test(company.company)||/^NO-/i.test(company.mpsNumber);if(testCompany)out.counts.testCompanies++;
    var scope=csById[String(x.Company_Scope_ID||'')]||null;var scopeActive=scope&&(String(scope.Active||'').trim().toUpperCase()==='YES'||scope.Active===true);if(scopeActive)out.counts.companyScopesCurrentlyActive++;else out.counts.companyScopesAlreadyInactive++;
    var ownLinks=activeLinksByOb[String(x.Obligation_ID||'')]||[];var visits=[];
    ownLinks.forEach(function(link){
      var auditId=String(link.Audit_ID||'').trim(),other=[];
      (activeLinksByAudit[auditId]||[]).forEach(function(otherLink){var oid=String(otherLink.Obligation_ID||'').trim();if(oid===String(x.Obligation_ID||''))return;var otherOb=obById[oid];if(!otherOb)return;var os=String(otherOb.Obligation_State||'').trim().toUpperCase();if(os==='COMPLETED'||os==='CANCELLED'||os==='REJECTED')return;other.push({obligationId:oid,scopeCode:String(otherOb.ScopeCode||'').trim(),cycleKey:String(otherOb.Cycle_Key||'').trim(),state:os});});
      var status=(apByAudit[auditId]&&apByAudit[auditId].status)||'';
      if(other.length)out.counts.visitsWithOtherActiveObligations++;else out.counts.visitsThatWouldBecomeEmpty++;
      var normStatus=String(status||'').trim().toUpperCase().replace(/_/g,' ');
      if(['PENDING PLANNING','PENDING'].indexOf(normStatus)<0)out.counts.unsafeVisitStatus++;
      visits.push({auditId:auditId,status:status,otherActiveObligations:other,wouldBecomeEmpty:other.length===0});
    });
    out.items.push({obligationId:String(x.Obligation_ID||''),companyUid:uid,mpsNumber:company.mpsNumber,company:company.company,formalHours:isFinite(hours)?hours:'',obligationState:state,testCompany:testCompany,companyScopeId:String(x.Company_Scope_ID||''),companyScopeActive:!!scopeActive,activeVisitLinks:ownLinks.length,visits:visits,proposedCanonicalAction:'DEACTIVATE_SCOPE_CANCEL_OBLIGATION_UNLINK_VISIT_PRESERVE_HISTORY'});
  });

  out.gates.matchesImportStaleCount=out.counts.staleCanonical===Number(importPlan.counts&&importPlan.counts.staleCanonicalNotInSource||0);
  out.gates.noMissingLinks=out.items.every(function(x){return x.activeVisitLinks===1;});
  out.gates.noUnsafeVisitStatus=out.counts.unsafeVisitStatus===0;
  out.gates.historyPreservationPolicy=true;
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&out.gates.matchesImportStaleCount&&out.gates.noMissingLinks&&out.gates.noUnsafeVisitStatus;
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
