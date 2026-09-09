/***********************************************************************
 * PlanningWorkspaceCanonicalCommitDevTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R5_FULL_WORKLOAD
 * CONTROLLED DESTRUCTIVE DEV TEST.
 ***********************************************************************/
var PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R5_FULL_WORKLOAD';
var PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_AUDIT_ID='AUD_CultiusMasarnauS.C.P_HQ_1777531729237_21';
function PWCCT_assert_(r,n,o,d){r.push({name:n,ok:o===true,detail:d||''});}
function PWCCT_date_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');return String(v||'').trim();}
function PWCCT_addDays_(s,n){var p=String(s||'').split('-'),d=new Date(+p[0],+p[1]-1,+p[2]);d.setDate(d.getDate()+n);return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
function PWCCT_weekday_(s){var p=String(s||'').split('-');return new Date(+p[0],+p[1]-1,+p[2]).getDay();}
function PWCCT_pending_(v){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='pending planning';}
function PWCCT_blocks_(from,to,totalHours){var blocks=[],d=from,remaining=Math.max(1,Number(totalHours||8)||8),guard=0;while(remaining>0&&d<=to&&guard<90){guard++;var w=PWCCT_weekday_(d);if(w!==0&&w!==6){var h=Math.min(8,remaining),mins=Math.round(h*60),endM=9*60+mins,hh=Math.floor(endM/60),mm=endM%60;blocks.push({date:d,start:'09:00',end:String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'),hours:h});remaining-=h;}d=PWCCT_addDays_(d,1);}if(remaining>0)throw new Error('Planning window cannot contain required workload: remaining '+remaining+'h');return blocks;}
function RUN_PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST(){
 var r=[],started=Date.now(),auditId=PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_AUDIT_ID;
 if(!(typeof V5_ENTRY_isDevEnv_==='function'&&V5_ENTRY_isDevEnv_()===true))throw new Error('DEV only');
 var rev=PlanningWorkspaceRpc_getRevision({auditId:auditId}),revision=rev&&rev.data&&rev.data.revision||'';
 PWCCT_assert_(r,'targetAuditFound',rev&&rev.ok===true,auditId);PWCCT_assert_(r,'revisionPresent',revision.indexOf('PRT1-')===0);PWCCT_assert_(r,'canonicalStatusPendingPlanning',rev&&rev.data&&rev.data.snapshot&&PWCCT_pending_(rev.data.snapshot.status),rev&&rev.data&&rev.data.snapshot&&rev.data.snapshot.status||'');
 if(!(rev&&rev.ok&&rev.data&&rev.data.snapshot&&PWCCT_pending_(rev.data.snapshot.status)))throw new Error('Explicit DEV audit is not canonical Pending Planning: '+auditId);
 var refresh=EligibilityTargetedRefreshService_refresh({auditIds:[auditId],maxRefresh:1,force:false,dryRun:false});
 PWCCT_assert_(r,'eligibilityRefreshSuccess',refresh&&refresh.success===true,refresh&&refresh.items&&refresh.items[0]&&refresh.items[0].error||'');PWCCT_assert_(r,'eligibilityCurrent',refresh&&refresh.failed===0&&refresh.orphaned===0);PWCCT_assert_(r,'eligibilityBusinessTruthUntouched',refresh&&refresh.meta&&refresh.meta.writesBusinessTruth===false);
 if(!(refresh&&refresh.success===true))throw new Error('Targeted eligibility refresh failed for '+auditId);
 var now=new Date(),tz=Session.getScriptTimeZone()||'Europe/Amsterdam',from=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth()-1,1),tz,'yyyy-MM-dd'),to=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth()+6,0),tz,'yyyy-MM-dd');
 var advisory=PlanningWorkspaceRpc_loadAdvisory({from:from,to:to,maxCandidates:10}),rows=advisory&&advisory.data&&advisory.data.rows||[],pick=null;
 PWCCT_assert_(r,'advisoryOk',advisory&&advisory.ok===true);for(var i=0;i<rows.length;i++)if(String(rows[i]&&rows[i].auditId||'').trim()===auditId){pick=rows[i];break;}
 PWCCT_assert_(r,'targetAuditInAdvisory',!!pick);PWCCT_assert_(r,'targetAuditReady',!!(pick&&pick.advisoryState==='READY'),pick&&pick.advisoryState||'');PWCCT_assert_(r,'candidateAuditorAvailable',!!(pick&&pick.candidateAuditors&&pick.candidateAuditors.length));
 if(!(pick&&pick.advisoryState==='READY'&&pick.candidateAuditors&&pick.candidateAuditors.length))throw new Error('Explicit DEV audit not READY: '+auditId);
 var c=pick.candidateAuditors[0],windowFrom=PWCCT_date_(pick.planningWindowFrom)||from,windowTo=PWCCT_date_(pick.planningWindowTo)||to,requiredHours=Math.max(1,Number(pick.hoursToPlan||8)||8),blocks=PWCCT_blocks_(windowFrom,windowTo,requiredHours),plannedHours=blocks.reduce(function(a,b){return a+Number(b.hours||0);},0);
 PWCCT_assert_(r,'fullWorkloadConstructed',plannedHours>=requiredHours,'required='+requiredHours+' planned='+plannedHours+' blocks='+blocks.length);
 var pre=PlanningWorkspaceRpc_commitPreflight({auditId:auditId,expectedRevision:revision,auditorEmail:c.email,auditorName:c.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER'});
 PWCCT_assert_(r,'preflightRpcOk',pre&&pre.ok===true);PWCCT_assert_(r,'statusTransitionPrecheckAccepted',pre&&pre.data&&pre.data.statusTransition&&pre.data.statusTransition.ok===true,pre&&pre.data&&pre.data.reason||'');PWCCT_assert_(r,'preflightAccepted',pre&&pre.data&&pre.data.canCommit===true,pre&&pre.data&&pre.data.reason||'');if(!(pre&&pre.ok&&pre.data&&pre.data.canCommit))throw new Error('Controlled DEV commit blocked by canonical preflight');
 var commit=PlanningWorkspaceRpc_commit({auditId:auditId,expectedRevision:revision,auditorEmail:c.email,auditorName:c.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER',actorEmail:'planning@agriqa.es',confirmCanonicalCommit:true});
 PWCCT_assert_(r,'commitRpcOk',commit&&commit.ok===true,commit&&commit.error&&commit.error.message||'');PWCCT_assert_(r,'canonicalCommitted',commit&&commit.data&&commit.data.committed===true,commit&&commit.data&&commit.data.reason||'');PWCCT_assert_(r,'canonicalWriterUsed',commit&&commit.data&&commit.data.meta&&commit.data.meta.canonicalWriterCalled===true);PWCCT_assert_(r,'newRevisionPresent',commit&&commit.data&&String(commit.data.newRevision||'').indexOf('PRT1-')===0);
 if(!(commit&&commit.ok&&commit.data&&commit.data.committed===true)){Logger.log(JSON.stringify({ok:false,build:PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD,results:r,commit:commit,meta:{auditId:auditId,requiredHours:requiredHours,blocks:blocks}},null,2));return{ok:false,build:PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD,results:r,commit:commit};}
 var reread=PlanningWorkspaceRpc_getRevision({auditId:auditId});PWCCT_assert_(r,'postCommitRevisionMatches',reread&&reread.ok&&reread.data&&reread.data.revision===commit.data.newRevision);PWCCT_assert_(r,'postCommitStatusApproved',reread&&reread.ok&&reread.data&&reread.data.snapshot&&String(reread.data.snapshot.status||'').trim().toLowerCase()==='approved',reread&&reread.data&&reread.data.snapshot&&reread.data.snapshot.status||'');
 var failed=r.filter(function(x){return !x.ok;}),out={ok:failed.length===0,build:PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD,total:r.length,passed:r.length-failed.length,failed:failed.length,results:r,meta:{destructive:true,devOnly:true,explicitAudit:true,targetedEligibilityRefresh:true,canonicalWritePerformed:true,auditId:auditId,auditorEmail:c.email,requiredHours:requiredHours,plannedHours:plannedHours,blocks:blocks,durationMs:Date.now()-started}};Logger.log(JSON.stringify(out,null,2));return out;
}
