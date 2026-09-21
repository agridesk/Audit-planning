/**
 * AMS-01.6 Model C — ECAS stale canonical obligation audit.
 * Read-only. Classifies same-cycle MPS-ABC obligations that are not present in
 * the current explicit ECAS source batch. No automatic deletion/deactivation.
 */
var MODEL_C_ECAS_STALE_AUDIT_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_STALE_CANONICAL_AUDIT_R1';

function RUN_MODEL_C_ECAS_STALE_CANONICAL_AUDIT(){
  var ss=SpreadsheetApp.getActive();
  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  var out={success:false,build:MODEL_C_ECAS_STALE_AUDIT_BUILD,batchYear:String(importPlan&&importPlan.batchYear||''),readOnly:true,writesPerformed:false,counts:{staleCanonical:0,zeroHours:0,positiveHours:0,activeVisitLinks:0,missingVisitLinks:0,testCompanies:0,terminalVisitRows:0,openVisitRows:0},gates:{},errors:[],items:[]};
  if(!importPlan||importPlan.success!==true){out.errors.push('ECAS import preview is not clean');Logger.log(JSON.stringify(out,null,2));return out;}

  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var companies=ss.getSheetByName('Companies');
  if(!obSheet||!lkSheet||!apSheet||!companies){out.errors.push('Required sheet missing');Logger.log(JSON.stringify(out,null,2));return out;}

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;});

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues=apSheet.getDataRange().getValues(),apHeaders=apValues[0]||[],apMap=ModelCFoundation_headerMap_(apHeaders);
  var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']);
  var ixStatus=ModelCEcasVisitMaterialization_header_(apMap,['Status']);
  var apByAudit={};
  if(ixAudit>=0){for(var r=1;r<apValues.length;r++){var aid=String(apValues[r][ixAudit]||'').trim();if(aid)apByAudit[aid]={status:ixStatus>=0?String(apValues[r][ixStatus]||'').trim():''};}}

  var cv=companies.getDataRange().getValues(),ch=cv[0]||[],cm=ModelCFoundation_headerMap_(ch);
  var ixUid=ModelCEcasAnnualImport_header_(cm,['Company_UID','Company UID']);
  var ixName=ModelCEcasAnnualImport_header_(cm,['Company','Company name','Name']);
  var ixNumber=ModelCEcasAnnualImport_header_(cm,['Number','MPS-nummer','MPS nummer']);
  var companyByUid={};
  if(ixUid>=0){for(var cr=1;cr<cv.length;cr++){var uid=String(cv[cr][ixUid]||'').trim();if(!uid)continue;companyByUid[uid]={company:ixName>=0?String(cv[cr][ixName]||'').trim():'',mpsNumber:ixNumber>=0?String(cv[cr][ixNumber]||'').trim():''};}}

  var linksByOb={};
  links.forEach(function(link){if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;var obId=String(link.Obligation_ID||'').trim();if(!obId)return;(linksByOb[obId]||(linksByOb[obId]=[])).push(link);});

  obligations.forEach(function(ob){
    if(String(ob.ScopeCode||'').trim().toUpperCase()!=='MPS-ABC')return;
    if(String(ob.Trigger_Source||'').trim().toUpperCase()!=='ECAS')return;
    if(String(ob.Cycle_Key||'').trim()!==out.batchYear)return;
    var state=String(ob.Obligation_State||'').trim().toUpperCase();
    if(['COMPLETED','CANCELLED','REJECTED'].indexOf(state)>=0)return;
    var uid=String(ob.Company_UID||'').trim();
    if(sourceUid[uid])return;

    out.counts.staleCanonical++;
    var company=companyByUid[uid]||{company:'',mpsNumber:''};
    var hours=Number(String(ob.Formal_Hours||'').replace(',','.'));
    if(isFinite(hours)&&hours>0)out.counts.positiveHours++;else out.counts.zeroHours++;
    var test=/\bTEST\b/i.test(company.company)||/^NO-/i.test(company.mpsNumber);
    if(test)out.counts.testCompanies++;

    var own=linksByOb[String(ob.Obligation_ID||'')]||[];
    if(own.length)out.counts.activeVisitLinks++;else out.counts.missingVisitLinks++;
    var visitStatuses=[];
    own.forEach(function(link){var aid=String(link.Audit_ID||'').trim(),ap=apByAudit[aid]||{},st=String(ap.status||'').trim();visitStatuses.push({auditId:aid,status:st});var u=st.toUpperCase().replace(/_/g,' ');if(['COMPLETED','CANCELLED','REJECTED'].indexOf(u)>=0)out.counts.terminalVisitRows++;else out.counts.openVisitRows++;});

    out.items.push({obligationId:String(ob.Obligation_ID||''),companyUid:uid,mpsNumber:company.mpsNumber,company:company.company,formalHours:isFinite(hours)?hours:null,obligationState:state,testCompany:test,activeVisitLinks:own.length,visits:visitStatuses});
  });

  out.gates.matchesImportStaleCount=out.counts.staleCanonical===Number(importPlan.counts&&importPlan.counts.staleCanonicalNotInSource||0);
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&out.gates.matchesImportStaleCount;
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ECAS stale canonical audit failed');
  return out;
}
