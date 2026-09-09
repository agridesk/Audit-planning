/***********************************************************************
 * PlanningWorkspaceCanonicalCommitDevTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R3_EXPLICIT_AUDIT
 *
 * CONTROLLED DESTRUCTIVE DEV TEST.
 * Targets one explicitly approved DEV audit ID and performs one canonical
 * MANAGER PLAN commit only when canonical status + advisory + preflight pass.
 ***********************************************************************/
var PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R3_EXPLICIT_AUDIT';
var PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_AUDIT_ID='AUD_CultiusMasarnauS.C.P_HQ_1777531729237_21';
function PWCCT_assert_(results,name,ok,detail){results.push({name:name,ok:ok===true,detail:detail||''});}
function PWCCT_date_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');return String(v||'').trim();}
function PWCCT_addDays_(s,n){var p=String(s||'').split('-'),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));d.setDate(d.getDate()+n);return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
function PWCCT_weekday_(s){var p=String(s||'').split('-'),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return d.getDay();}
function PWCCT_firstWeekday_(from,to){var d=from;for(var i=0;i<31&&d<=to;i++,d=PWCCT_addDays_(d,1)){var w=PWCCT_weekday_(d);if(w!==0&&w!==6)return d;}return from;}
function PWCCT_isPendingPlanning_(v){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='pending planning';}
function RUN_PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST(){
  var results=[],started=Date.now(),auditId=PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_AUDIT_ID;
  if(!(typeof V5_ENTRY_isDevEnv_==='function'&&V5_ENTRY_isDevEnv_()===true))throw new Error('DEV only');
  var rev=PlanningWorkspaceRpc_getRevision({auditId:auditId}),revision=rev&&rev.data&&rev.data.revision||'';
  PWCCT_assert_(results,'targetAuditFound',rev&&rev.ok===true,auditId);
  PWCCT_assert_(results,'revisionPresent',rev&&rev.ok===true&&revision.indexOf('PRT1-')===0);
  PWCCT_assert_(results,'canonicalStatusPendingPlanning',rev&&rev.data&&rev.data.snapshot&&PWCCT_isPendingPlanning_(rev.data.snapshot.status),rev&&rev.data&&rev.data.snapshot&&rev.data.snapshot.status||'');
  if(!(rev&&rev.ok===true&&rev.data&&rev.data.snapshot&&PWCCT_isPendingPlanning_(rev.data.snapshot.status)))throw new Error('Explicit DEV audit is not canonical Pending Planning: '+auditId);
  var now=new Date(),tz=Session.getScriptTimeZone()||'Europe/Amsterdam',from=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth()-1,1),tz,'yyyy-MM-dd'),to=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth()+6,0),tz,'yyyy-MM-dd');
  var advisory=PlanningWorkspaceRpc_loadAdvisory({from:from,to:to,maxCandidates:10});
  PWCCT_assert_(results,'advisoryOk',advisory&&advisory.ok===true);
  var rows=advisory&&advisory.data&&advisory.data.rows||[],pick=null;
  for(var i=0;i<rows.length;i++){if(rows[i]&&String(rows[i].auditId||'').trim()===auditId){pick=rows[i];break;}}
  PWCCT_assert_(results,'targetAuditInAdvisory',!!pick);
  PWCCT_assert_(results,'targetAuditReady',!!(pick&&pick.advisoryState==='READY'),pick&&pick.advisoryState||'');
  PWCCT_assert_(results,'candidateAuditorAvailable',!!(pick&&pick.candidateAuditors&&pick.candidateAuditors.length));
  if(!(pick&&pick.advisoryState==='READY'&&pick.candidateAuditors&&pick.candidateAuditors.length))throw new Error('Explicit DEV audit is not READY with candidate auditor: '+auditId);
  var candidate=pick.candidateAuditors[0],date=PWCCT_firstWeekday_(PWCCT_date_(pick.planningWindowFrom)||from,PWCCT_date_(pick.planningWindowTo)||to),hours=Math.min(8,Math.max(1,Number(pick.hoursToPlan||8)||8)),endHour=9+hours;
  if(endHour>17){hours=8;endHour=17;}
  var start='09:00',end=String(Math.floor(endHour)).padStart(2,'0')+':'+(endHour%1?'30':'00'),blocks=[{date:date,start:start,end:end,hours:hours}];
  var pre=PlanningWorkspaceRpc_commitPreflight({auditId:auditId,expectedRevision:revision,auditorEmail:candidate.email,auditorName:candidate.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER'});
  PWCCT_assert_(results,'preflightRpcOk',pre&&pre.ok===true);
  PWCCT_assert_(results,'statusTransitionPrecheckAccepted',pre&&pre.data&&pre.data.statusTransition&&pre.data.statusTransition.ok===true,pre&&pre.data&&pre.data.reason||'');
  PWCCT_assert_(results,'preflightAccepted',pre&&pre.data&&pre.data.canCommit===true,pre&&pre.data&&pre.data.reason||'');
  if(!(pre&&pre.ok===true&&pre.data&&pre.data.canCommit===true))throw new Error('Controlled DEV commit blocked by canonical preflight');
  var commit=PlanningWorkspaceRpc_commit({auditId:auditId,expectedRevision:revision,auditorEmail:candidate.email,auditorName:candidate.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER',actorEmail:'planning@agriqa.es',confirmCanonicalCommit:true});
  PWCCT_assert_(results,'commitRpcOk',commit&&commit.ok===true,commit&&commit.error&&commit.error.message||'');
  PWCCT_assert_(results,'canonicalCommitted',commit&&commit.data&&commit.data.committed===true,commit&&commit.data&&commit.data.reason||'');
  PWCCT_assert_(results,'statusOwnerCanonical',commit&&commit.data&&commit.data.meta&&commit.data.meta.statusOwner==='StatusMachine');
  PWCCT_assert_(results,'availabilityOwnerCanonical',!!(commit&&commit.data&&commit.data.meta&&commit.data.meta.availabilityOwner));
  PWCCT_assert_(results,'canonicalWriterUsed',commit&&commit.data&&commit.data.meta&&commit.data.meta.canonicalWriterCalled===true);
  PWCCT_assert_(results,'newRevisionPresent',commit&&commit.data&&String(commit.data.newRevision||'').indexOf('PRT1-')===0);
  var reread=PlanningWorkspaceRpc_getRevision({auditId:auditId});
  PWCCT_assert_(results,'postCommitRevisionMatches',reread&&reread.ok===true&&reread.data&&reread.data.revision===commit.data.newRevision);
  PWCCT_assert_(results,'postCommitStatusApproved',reread&&reread.ok===true&&reread.data&&reread.data.snapshot&&String(reread.data.snapshot.status||'').trim().toLowerCase()==='approved',reread&&reread.data&&reread.data.snapshot&&reread.data.snapshot.status||'');
  var failed=results.filter(function(x){return !x.ok;});
  var out={ok:failed.length===0,build:PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD,total:results.length,passed:results.length-failed.length,failed:failed.length,results:results,meta:{destructive:true,devOnly:true,explicitAudit:true,canonicalWritePerformed:!!(commit&&commit.data&&commit.data.committed),auditId:auditId,auditorEmail:candidate.email,date:date,start:start,end:end,durationMs:Date.now()-started,nextStep:'If green: browser-bind canonical commit with explicit confirmation; keep PROD hard-blocked.'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
