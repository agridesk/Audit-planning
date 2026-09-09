/***********************************************************************
 * PlanningWorkspaceConceptDryRunTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_DRY_RUN_TESTS_R1
 *
 * Live DEV read + non-destructive concept-save dry run.
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_DRY_RUN_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_DRY_RUN_TESTS_R1';
function RUN_PLANNING_WORKSPACE_CONCEPT_DRY_RUN_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),1),to=new Date(now.getFullYear(),now.getMonth()+3,0);
  function iso(d){return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
  var advisory=PlanningWorkspaceService_getAdvisory({from:iso(from),to:iso(to),maxCandidates:5});
  var rows=advisory&&advisory.rows||[],row=null,candidate=null;
  for(var i=0;i<rows.length;i++){if(rows[i]&&rows[i].candidateAuditors&&rows[i].candidateAuditors.length){row=rows[i];candidate=rows[i].candidateAuditors[0];break;}}
  t('advisoryOk',advisory&&advisory.success===true,advisory&&advisory.build);
  t('readyAuditFound',!!row,'No READY audit with candidate auditor found in current 3-month period');
  if(row){
    var rev=PlanningWorkspaceRpc_getRevision({auditId:row.auditId});
    t('revisionRpcOk',rev&&rev.ok===true,rev&&rev.error&&rev.error.message);
    t('revisionPresent',rev&&rev.data&&/^PRT1-/.test(String(rev.data.revision||'')),rev&&rev.data&&rev.data.revision);
    var sourceRevision=rev&&rev.data&&rev.data.revision||'';
    var blockDate=String(row.planningWindowFrom||iso(from));
    var dry=PlanningWorkspaceRpc_saveConcept({auditId:row.auditId,auditorEmail:candidate&&candidate.email||'',auditorName:candidate&&candidate.name||'',blocks:[{date:blockDate,start:'09:00',end:'17:00',hours:Number(row.hoursToPlan||8)||8}],sourceRevision:sourceRevision,createdBy:'planning@agriqa.es',dryRun:true});
    t('saveConceptRpcOk',dry&&dry.ok===true,dry&&dry.error&&dry.error.message);
    t('dryRunAccepted',dry&&dry.data&&dry.data.reason==='DRY_RUN_VALID',dry&&dry.data&&dry.data.reason);
    t('savedFalse',dry&&dry.data&&dry.data.saved===false,dry&&dry.data&&dry.data.saved);
    t('writesFalse',dry&&dry.data&&dry.data.meta&&dry.data.meta.writes===false,JSON.stringify(dry&&dry.data&&dry.data.meta||{}));
    t('dryRunTrue',dry&&dry.data&&dry.data.meta&&dry.data.meta.dryRun===true,JSON.stringify(dry&&dry.data&&dry.data.meta||{}));
    t('sameAudit',dry&&dry.data&&dry.data.reservation&&dry.data.reservation.auditId===row.auditId,dry&&dry.data&&dry.data.reservation&&dry.data.reservation.auditId);
    t('sameAuditor',dry&&dry.data&&dry.data.reservation&&dry.data.reservation.auditorEmail===String(candidate.email||'').toLowerCase(),dry&&dry.data&&dry.data.reservation&&dry.data.reservation.auditorEmail);
  } else {
    ['revisionRpcOk','revisionPresent','saveConceptRpcOk','dryRunAccepted','savedFalse','writesFalse','dryRunTrue','sameAudit','sameAuditor'].forEach(function(n){t(n,false,'Skipped: no ready audit');});
  }
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_CONCEPT_DRY_RUN_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,conceptSaveDryRun:true,selectedAuditId:row&&row.auditId||'',selectedAuditor:candidate&&candidate.email||'',nextStep:'Bind Save concept and Release concept buttons after this dry-run path is green.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
