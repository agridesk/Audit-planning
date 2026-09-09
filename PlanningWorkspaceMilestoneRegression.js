/***********************************************************************
 * PlanningWorkspaceMilestoneRegression.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_MILESTONE_REGRESSION_R1
 *
 * One consolidated DEV regression for the current Workspace milestone.
 * Live reads only. No concept/canonical/availability/status writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_MILESTONE_REGRESSION_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_MILESTONE_REGRESSION_R1';
function RUN_PLANNING_WORKSPACE_MILESTONE_REGRESSION(){
  if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)throw new Error('DEV_ONLY');
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var route=PlanningWorkspaceEntryV5Override_contract();
  t('entryOverrideActive',route&&route.build===PLANNING_WORKSPACE_ENTRY_V5_OVERRIDE_BUILD);
  t('workspaceNormalize',V5_ENTRY_normAction_('planningworkspace')==='planningworkspace');
  t('workspaceAlias',V5_ENTRY_normAction_('workspace')==='planningworkspace');
  t('planningAliasStillToolkit',V5_ENTRY_normAction_('planning')==='planningtoolkit');
  t('managerRoutePreserved',V5_ENTRY_normAction_('manager')==='manager');
  t('workspaceTitle',V5_ENTRY_browserTitle_('planningworkspace','Manager')==='AMS - Planning Workspace');
  t('workspaceManagerRole',V5_ENTRY_expectedRole_('planningworkspace','')==='Manager');
  t('workspaceAuditorRole',V5_ENTRY_expectedRole_('planningworkspace','auditor')==='Auditor');
  t('entryOwnsAuth',route.authOwner==='EntryV5');
  t('prodHardBlockDeclared',route.prodHardBlockBeforeBootstrap===true);
  var rpc=PlanningWorkspaceRpc_contract();
  t('rpcR4',String(rpc.build||'').indexOf('RPC_R4_SPLIT_FIRST_PAINT')>=0,rpc.build);
  t('splitFirstPaintContract',rpc.meta&&rpc.meta.splitFirstPaint===true);
  t('targetedOverlayContract',rpc.meta&&rpc.meta.targetedOverlayPhase===true);
  var html=PlanningWorkspaceDevRoute_render({email:'planning@agriqa.es',role:'Manager'});
  t('shellR4',html.indexOf('HTML_SHELL_R4_SPLIT_FIRST_PAINT_PREFLIGHT')>=0);
  t('clientR5',html.indexOf('CLIENT_R5_SPLIT_FIRST_PAINT_PREFLIGHT')>=0);
  t('advisoryRpcBound',html.indexOf('PlanningWorkspaceRpc_loadAdvisory')>=0);
  t('overlayRpcBound',html.indexOf('PlanningWorkspaceRpc_loadOverlays')>=0);
  t('preflightRpcBound',html.indexOf('PlanningWorkspaceRpc_commitPreflight')>=0);
  t('canonicalLiveCommitNotBrowserBound',html.indexOf('.PlanningWorkspaceRpc_commit(')<0);
  t('noDirectSheetAccessInBrowser',html.indexOf('SpreadsheetApp')<0);

  var req={from:'2026-09-01',to:'2026-11-30'},ta=Date.now(),adOut=PlanningWorkspaceRpc_loadAdvisory(req),adMs=Date.now()-ta;
  t('liveAdvisoryOk',adOut&&adOut.ok===true,adOut&&adOut.error&&adOut.error.message);
  var rows=adOut&&adOut.data&&adOut.data.rows||[],emails={},ids=[],ready=null,aud=null;
  rows.forEach(function(row){if(row&&row.auditId)ids.push(row.auditId);(row.candidateAuditors||[]).forEach(function(a){var e=String(a&&a.email||'').trim().toLowerCase();if(e)emails[e]=1;});if(!ready&&String(row.advisoryState||'').toUpperCase()==='READY'&&(row.candidateAuditors||[]).length){ready=row;aud=row.candidateAuditors[0];}});
  t('advisoryRowsPresent',rows.length>0,'No demand rows');
  t('readyAuditFound',!!ready,'No READY audit with candidate auditor');
  var to=Date.now(),ovOut=PlanningWorkspaceRpc_loadOverlays({from:req.from,to:req.to,auditorEmails:Object.keys(emails),auditIds:ids}),ovMs=Date.now()-to;
  t('liveTargetedOverlaysOk',ovOut&&ovOut.ok===true,ovOut&&ovOut.error&&ovOut.error.message);
  t('overlayCandidateTargeted',ovOut&&ovOut.data&&ovOut.data.meta&&Number(ovOut.data.meta.candidateAuditors)===Object.keys(emails).length,'candidate targeting mismatch');

  var preMs=0,pre=null;
  if(ready){
    var rr=PlanningWorkspaceRpc_getRevision({auditId:ready.auditId}),revision=rr&&rr.ok&&rr.data&&rr.data.revision||'';
    t('revisionPresent',!!revision);
    var date=ready.planningWindowFrom||req.from,hours=Math.max(1,Math.min(8,Number(ready.hoursToPlan||4)||4)),endHour=Math.min(17,9+Math.ceil(hours)),blocks=[{date:date,start:'09:00',end:(endHour<10?'0':'')+endHour+':00',hours:hours}];
    var tp=Date.now();pre=PlanningWorkspaceRpc_commitPreflight({auditId:ready.auditId,expectedRevision:revision,auditorEmail:aud.email,auditorName:aud.name||'',blocks:blocks,waiverAccepted:false});preMs=Date.now()-tp;
    t('livePreflightOk',pre&&pre.ok===true,pre&&pre.error&&pre.error.message);
    t('preflightReadOnly',pre&&pre.data&&pre.data.meta&&pre.data.meta.readOnly===true);
    t('fastCanonicalQualificationUsed',pre&&pre.data&&pre.data.preflight&&pre.data.preflight.meta?pre.data.preflight.meta.fastCanonicalQualificationUsed===true:pre&&pre.data&&pre.data.meta&&pre.data.meta.fastCanonicalQualificationUsed===true,'fast qualification not used');
    t('gateDecisionPresent',pre&&pre.data&&typeof pre.data.canCommit==='boolean');
    t('preflightNoWrites',pre&&pre.data&&pre.data.meta&&pre.data.meta.writes===false);
  }
  t('advisoryFirstPaintUnder6s',adMs<6000,'advisoryMs='+adMs);
  t('targetedOverlayUnder5s',ovMs<5000,'overlayMs='+ovMs);
  t('canonicalPreflightUnder8s',!ready||preMs<8000,'preflightMs='+preMs);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_MILESTONE_REGRESSION_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,entryRouting:true,splitFirstPaint:true,targetedOverlays:true,canonicalLiveWriteBrowserBound:false,advisoryMs:adMs,overlayMs:ovMs,preflightMs:preMs,readyAuditId:ready&&ready.auditId||'',nextStep:'If green: bind canonical commit behind explicit DEV confirmation and run one controlled end-to-end canonical DEV planning test.'}};console.log(JSON.stringify(out,null,2));return out;
}
