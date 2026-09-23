/***********************************************************************
 * PlanningWorkspaceDecisionReadModelTests.js
 * BUILD: 2026-09-23_AMS01_3_WORKSPACE_DECISION_READ_MODEL_TEST_R1
 ***********************************************************************/
var PWDRM_TEST_BUILD='2026-09-23_AMS01_3_WORKSPACE_DECISION_READ_MODEL_TEST_R1';
function RUN_AMS01_3_WORKSPACE_DECISION_READ_MODEL_REGRESSION(){
 var src=String(PlanningWorkspaceDecisionReadModel_get),contract=PlanningWorkspaceDecisionReadModel_contract(),r=[];function t(n,v){r.push({name:n,ok:!!v});}
 t('readModelPresent',typeof PlanningWorkspaceDecisionReadModel_get==='function');
 t('canonicalAdvisoryOwner',src.indexOf('ConceptPlanningService_get(input)')>=0);
 t('noSheetAccess',src.indexOf('SpreadsheetApp')<0&&src.indexOf('getRange(')<0&&src.indexOf('getDataRange(')<0);
 t('noWrites',src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0);
 t('noPersistentCache',contract.persistentCache===false);
 t('noNewSsot',contract.newSsot===false);
 t('noCanonicalRuleReimplementation',contract.canonicalRulesReimplemented===false);
 t('compactProjection',src.indexOf('PWDRM_audit_')>=0&&src.indexOf('candidateAuditorEmails')>=0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:PWDRM_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
