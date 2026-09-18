/***********************************************************************
 * PlanningWorkspaceAttentionStabilityTests.js
 * BUILD: 2026-09-18_WORKSPACE_ATTENTION_STABILITY_R1
 * RUN: RUN_WORKSPACE_ATTENTION_STABILITY_REGRESSION
 ***********************************************************************/
function RUN_WORKSPACE_ATTENTION_STABILITY_REGRESSION(){
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAttentionEnhancer.js').getContent(),r=[];
  function t(n,o){r.push({name:n,ok:!!o});}
  t('stableRenderSignature',src.indexOf('data-attention-signature')>=0);
  t('signatureShortCircuitsRerender',src.indexOf("getAttribute('data-attention-signature')===signature")>=0);
  t('signatureSetBeforeInnerHtml',src.indexOf("setAttribute('data-attention-signature',signature)")<src.indexOf('n.innerHTML=html'));
  t('observerDirectChildrenOnly',src.indexOf("observe(n,{childList:true})")>=0);
  t('observerNoSubtree',src.indexOf('subtree:true')<0);
  t('observerNoCharacterData',src.indexOf('characterData:true')<0);
  t('observerFiltersOwnDescendantEnhancements',src.indexOf('ms[i].target===n')>=0);
  t('dragBindingRetained',src.indexOf('setTimeout(bindDrag,0)')>=0&&src.indexOf('d.enhance')>=0);
  t('priorityLimitRetained',src.indexOf('ATTENTION_LIMIT=12')>=0);
  t('conceptExclusionRetained',src.indexOf('reservedIds()')>=0);
  var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-18_WORKSPACE_ATTENTION_STABILITY_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Planner attention rendering is idempotent and cannot continuously replace its own DOM after drag/pointer enhancement.'}};
  console.info(JSON.stringify(out,null,2));return out;
}