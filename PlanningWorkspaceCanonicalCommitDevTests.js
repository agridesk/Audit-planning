/***********************************************************************
 * PlanningWorkspaceCanonicalCommitDevTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R2_PENDING_PLANNING_ONLY
 *
 * CONTROLLED DESTRUCTIVE DEV TEST.
 * Selects exactly one READY Pending Planning audit, validates it, then performs
 * one canonical MANAGER PLAN commit through the browser RPC boundary.
 ***********************************************************************/
var PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CANONICAL_COMMIT_DEV_TEST_R2_PENDING_PLANNING_ONLY';
function PWCCT_assert_(results,name,ok,detail){results.push({name:name,ok:ok===true,detail:detail||''});}
function PWCCT_date_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');return String(v||'').trim();}
function PWCCT_addDays_(s,n){var p=String(s||'').split('-'),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));d.setDate(d.getDate()+n);return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
function PWCCT_weekday_(s){var p=String(s||'').split('-'),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return d.getDay();}
function PWCCT_firstWeekday_(from,to){var d=from;for(var i=0;i<31&&d<=to;i++,d=PWCCT_addDays_(d,1)){var w=PWCCT_weekday_(d);if(w!==0&&w!==6)return d;}return from;}
function PWCCT_isPendingPlanning_(v){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ')==='pending planning';}
function RUN_PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST(){
  var results=[],started=Date.now();
  if(!(typeof V5_ENTRY_isDevEnv_==='function'&&V5_ENTRY_isDevEnv_()===true))throw new Error('DEV only');
  var now=new Date(),tz=Session.getScriptTimeZone()||'Europe/Amsterdam',from=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth(),1),tz,'yyyy-MM-dd'),to=Utilities.formatDate(new Date(now.getFullYear(),now.getMonth()+3,0),tz,'yyyy-MM-dd');
  var advisory=PlanningWorkspaceRpc_loadAdvisory({from:from,to:to,maxCandidates:5});
  PWCCT_assert_(results,'advisoryOk',advisory&&advisory.ok===true);
  var rows=advisory&&advisory.data&&advisory.data.rows||[],pick=null;
  for(var i=0;i<rows.length;i++){if(rows[i]&&PWCCT_isPendingPlanning_(rows[i].status)&&rows[i].advisoryState==='READY'&&rows[i].candidateAuditors&&rows[i].candidateAuditors.length){pick=rows[i];break;}}
  PWCCT_assert_(results,'readyPendingPlanningAuditFound',!!pick);
  if(!pick)throw new Error('No READY Pending Planning audit available for controlled DEV commit');
  var candidate=pick.candidateAuditors[0],date=PWCCT_firstWeekday_(PWCCT_date_(pick.planningWindowFrom)||from,PWCCT_date_(pick.planningWindowTo)||to),hours=Math.min(8,Math.max(1,Number(pick.hoursToPlan||8)||8)),endHour=9+hours;
  if(endHour>17){hours=8;endHour=17;}
  var start='09:00',end=String(Math.floor(endHour)).padStart(2,'0')+':'+(endHour%1?'30':'00'),blocks=[{date:date,start:start,end:end,hours:hours}];
  var rev=PlanningWorkspaceRpc_getRevision({auditId:pick.auditId}),revision=rev&&rev.data&&rev.data.revision||'';
  PWCCT_assert_(results,'revisionPresent',rev&&rev.ok===true&&revision.indexOf('PRT1-')===0);
  PWCCT_assert_(results,'canonicalStatusPendingPlanning',rev&&rev.data&&rev.data.snapshot&&PWCCT_isPendingPlanning_(rev.data.snapshot.status),rev&&rev.data&&rev.data.snapshot&&rev.data.snapshot.status||'');
  var pre=PlanningWorkspaceRpc_commitPreflight({auditId:pick.auditId,expectedRevision:revision,auditorEmail:candidate.email,auditorName:candidate.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER'});
  PWCCT_assert_(results,'preflightRpcOk',pre&&pre.ok===true);
  PWCCT_assert_(results,'statusTransitionPrecheckAccepted',pre&&pre.data&&pre.data.statusTransition&&pre.data.statusTransition.ok===true,pre&&pre.data&&pre.data.reason||'');
  PWCCT_assert_(results,'preflightAccepted',pre&&pre.data&&pre.data.canCommit===true,pre&&pre.data&&pre.data.reason||'');
  if(!(pre&&pre.ok===true&&pre.data&&pre.data.canCommit===true))throw new Error('Controlled DEV commit blocked by canonical preflight');
  var commit=PlanningWorkspaceRpc_commit({auditId:pick.auditId,expectedRevision:revision,auditorEmail:candidate.email,auditorName:candidate.name,blocks:blocks,waiverAccepted:false,actorRole:'MANAGER',actorEmail:'planning@agriqa.es',confirmCanonicalCommit:true});
  PWCCT_assert_(results,'commitRpcOk',commit&&commit.ok===true,commit&&commit.error&&commit.error.message||'');
  PWCCT_assert_(results,'canonicalCommitted',commit&&commit.data&&commit.data.committed===true,commit&&commit.data&&commit.data.reason||'');
  PWCCT_assert_(results,'statusOwnerCanonical',commit&&commit.data&&commit.data.meta&&commit.data.meta.statusOwner==='StatusMachine');
  PWCCT_assert_(results,'availabilityOwnerCanonical',!!(commit&&commit.data&&commit.data.meta&&commit.data.meta.availabilityOwner));
  PWCCT_assert_(results,'canonicalWriterUsed',commit&&commit.data&&commit.data.meta&&commit.data.meta.canonicalWriterCalled===true);
  PWCCT_assert_(results,'newRevisionPresent',commit&&commit.data&&String(commit.data.newRevision||'').indexOf('PRT1-')===0);
  var reread=PlanningWorkspaceRpc_getRevision({auditId:pick.auditId});
  PWCCT_assert_(results,'postCommitRevisionMatches',reread&&reread.ok===true&&reread.data&&reread.data.revision===commit.data.newRevision);
  PWCCT_assert_(results,'postCommitStatusApproved',reread&&reread.ok===true&&reread.data&&reread.data.snapshot&&String(reread.data.snapshot.status||'').trim().toLowerCase()==='approved',reread&&reread.data&&reread.data.snapshot&&reread.data.snapshot.status||'');
  var failed=results.filter(function(x){return !x.ok;});
  var out={ok:failed.length===0,build:PLANNING_WORKSPACE_CANONICAL_COMMIT_DEV_TEST_BUILD,total:results.length,passed:results.length-failed.length,failed:failed.length,results:results,meta:{destructive:true,devOnly:true,canonicalWritePerformed:!!(commit&&commit.data&&commit.data.committed),auditId:pick.auditId,auditorEmail:candidate.email,date:date,start:start,end:end,durationMs:Date.now()-started,nextStep:'If green: browser-bind canonical commit with explicit confirmation; keep non-Pending Planning rows read/advisory only until Re-adjust is implemented.'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
