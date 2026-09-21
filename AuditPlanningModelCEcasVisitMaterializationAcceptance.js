/**
 * AMS-01.6 Model C — ECAS visit materialization acceptance.
 * Read-only. Verifies the current explicit ECAS MPS-ABC batch after APPLY.
 */
var MODEL_C_ECAS_VISIT_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_VISIT_MATERIALIZATION_ACCEPTANCE_R1';

function RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var preview=ModelCEcasVisitMaterialization_buildPreview_(ss);
  var out={
    success:false,
    build:MODEL_C_ECAS_VISIT_ACCEPTANCE_BUILD,
    materializationBuild:preview&&preview.build||'',
    batchYear:preview&&preview.batchYear||'',
    readOnly:true,
    writesPerformed:false,
    counts:{
      sourceRows:0,
      sourceBackedTargets:0,
      alreadyLinked:0,
      sourceBackedOpenObligations:0,
      activeLinks:0,
      auditPlanningRows:0,
      positiveHours:0,
      abcCertificateLeaks:0,
      duplicateActiveLinks:0,
      missingAuditPlanningRows:0,
      companyMismatches:0,
      unlinkedSourceBackedOpen:0,
      pendingPlanningSourceBacked:0
    },
    gates:{},
    errors:[],
    warnings:[]
  };

  if(!preview||preview.success!==true){
    out.errors.push('Materialization preview is not clean');
    if(preview&&preview.errors&&preview.errors.length)out.errors=out.errors.concat(preview.errors.slice(0,20));
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  out.counts.sourceRows=Number(preview.counts&&preview.counts.sourceRows||0);
  out.counts.sourceBackedTargets=Number(preview.counts&&preview.counts.sourceBackedTargets||0);
  out.counts.alreadyLinked=Number(preview.counts&&preview.counts.alreadyLinked||0);

  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!obSheet||!lkSheet||!apSheet){
    out.errors.push('Required Model C sheet missing');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  if(!importPlan||importPlan.success!==true){
    out.errors.push('ECAS import preview is not clean');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){
    if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;
  });

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues=apSheet.getDataRange().getValues();
  var apHeaders=apValues[0]||[];
  var apMap=ModelCFoundation_headerMap_(apHeaders);
  var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']);
  var ixCompany=ModelCEcasVisitMaterialization_header_(apMap,['Company_UID','Company UID']);
  var ixStatus=ModelCEcasVisitMaterialization_header_(apMap,['Status']);
  if(ixAudit<0||ixCompany<0){
    out.errors.push('Audit planning missing Audit ID or Company_UID');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var apByAudit={};
  for(var r=1;r<apValues.length;r++){
    var auditId=String(apValues[r][ixAudit]||'').trim();
    if(!auditId)continue;
    apByAudit[auditId]={
      companyUid:String(apValues[r][ixCompany]||'').trim(),
      status:ixStatus>=0?String(apValues[r][ixStatus]||'').trim():''
    };
  }
  out.counts.auditPlanningRows=Object.keys(apByAudit).length;

  var activeLinksByOb={};
  links.forEach(function(link){
    if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;
    var obId=String(link.Obligation_ID||'').trim();
    if(!obId)return;
    if(!activeLinksByOb[obId])activeLinksByOb[obId]=[];
    activeLinksByOb[obId].push(link);
    out.counts.activeLinks++;
  });

  obligations.forEach(function(ob){
    var scope=String(ob.ScopeCode||'').trim().toUpperCase();
    var trigger=String(ob.Trigger_Source||'').trim().toUpperCase();
    var cycle=String(ob.Cycle_Key||'').trim();
    var state=String(ob.Obligation_State||'').trim().toUpperCase();
    var uid=String(ob.Company_UID||'').trim();
    if(scope!=='MPS-ABC'||trigger!=='ECAS'||cycle!==String(out.batchYear)||['COMPLETED','CANCELLED','REJECTED'].indexOf(state)>=0||!sourceUid[uid])return;

    out.counts.sourceBackedOpenObligations++;
    var hours=Number(String(ob.Formal_Hours||'').replace(',','.'));
    if(isFinite(hours)&&hours>0)out.counts.positiveHours++;
    else out.errors.push('Invalid Formal_Hours: '+String(ob.Obligation_ID||''));

    if(String(ob.Base_Expiry_Date||'').trim()||String(ob.Effective_Expiry_Date||'').trim()){
      out.counts.abcCertificateLeaks++;
      out.errors.push('MPS-ABC certificate expiry leak: '+String(ob.Obligation_ID||''));
    }

    var ownLinks=activeLinksByOb[String(ob.Obligation_ID||'')]||[];
    if(ownLinks.length===0){
      out.counts.unlinkedSourceBackedOpen++;
      out.errors.push('Source-backed open ECAS obligation has no active visit link: '+String(ob.Obligation_ID||''));
      return;
    }
    if(ownLinks.length>1){
      out.counts.duplicateActiveLinks++;
      out.errors.push('Source-backed open ECAS obligation has multiple active visit links: '+String(ob.Obligation_ID||''));
      return;
    }

    var auditId=String(ownLinks[0].Audit_ID||'').trim();
    var ap=apByAudit[auditId];
    if(!ap){
      out.counts.missingAuditPlanningRows++;
      out.errors.push('Active ECAS visit link has no Audit planning row: '+auditId);
      return;
    }
    if(ap.companyUid&&ap.companyUid!==uid){
      out.counts.companyMismatches++;
      out.errors.push('ECAS visit/company mismatch: '+auditId);
    }
    if(String(ap.status||'').trim().toUpperCase()==='PENDING PLANNING')out.counts.pendingPlanningSourceBacked++;
  });

  out.gates.previewIdempotent=(Number(preview.counts&&preview.counts.createVisit||0)===0&&Number(preview.counts&&preview.counts.linkExistingVisit||0)===0);
  out.gates.allSourceBackedOpenLinked=out.counts.unlinkedSourceBackedOpen===0;
  out.gates.singleActiveLinkPerObligation=out.counts.duplicateActiveLinks===0;
  out.gates.allLinkedVisitsExist=out.counts.missingAuditPlanningRows===0;
  out.gates.companyConsistent=out.counts.companyMismatches===0;
  out.gates.positiveFormalHours=out.counts.positiveHours===out.counts.sourceBackedOpenObligations;
  out.gates.noCertificateLifecycleLeak=out.counts.abcCertificateLeaks===0;
  out.gates.sourceBackedCountMatchesPreview=out.counts.sourceBackedOpenObligations===out.counts.sourceBackedTargets;
  out.gates.readOnly=true;

  out.success=out.errors.length===0&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ECAS visit materialization acceptance failed: '+out.errors.join('; '));
  return out;
}
