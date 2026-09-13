/***********************************************************************
 * PlanningWorkspaceConceptLifecycleVerification.js
 * BUILD: 2026-09-13_WORKSPACE_CONCEPT_LIFECYCLE_VERIFY_R1
 * READ-ONLY verification. No planning/status/availability/concept writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_VERIFY_BUILD='2026-09-13_WORKSPACE_CONCEPT_LIFECYCLE_VERIFY_R1';
function PWCLV_assert_(items,name,condition,details){items.push({name:name,passed:condition===true,details:details||null});}
function RUN_PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_VERIFICATION(){
  var items=[];
  PWCLV_assert_(items,'Lifecycle projector loaded',typeof PlanningWorkspaceConceptLifecycle_project==='function');
  PWCLV_assert_(items,'Pure lifecycle projector loaded',typeof PWCL_projectFromStatusMap_==='function');
  var fixtureRows=[{auditId:'A',auditorEmail:'a@test'},{auditId:'B',auditorEmail:'b@test'},{auditId:'C',auditorEmail:'c@test'},{auditId:'D',auditorEmail:'d@test'}];
  var fixture=PWCL_projectFromStatusMap_(fixtureRows,{A:'Pending Planning',B:'Pending Approval',C:'Accepted',D:'Approved'});
  PWCLV_assert_(items,'Pure projection keeps Pending Planning active',fixture.activeRows.length===1&&fixture.activeRows[0].auditId==='A');
  PWCLV_assert_(items,'Pure projection marks non-planning lifecycle stale',fixture.staleRows.length===3);
  PWCLV_assert_(items,'Pure projection active row is planable lifecycle',fixture.activeRows.every(function(x){return x.canonicalStatusNormalized==='PENDING_PLANNING'&&x.lifecycleCurrent===true;}));
  PWCLV_assert_(items,'Pure projection stale rows are not planable lifecycle',fixture.staleRows.every(function(x){return x.canonicalStatusNormalized!=='PENDING_PLANNING'&&x.staleLifecycle===true;}));

  var period={from:'2026-01-01',to:'2027-12-31'};
  var cr=ConceptReservationReadModel_get(period);
  var sourceRows=cr&&Array.isArray(cr.rows)?cr.rows:[];
  var live=PlanningWorkspaceConceptLifecycle_project(sourceRows);
  var active=live&&Array.isArray(live.activeRows)?live.activeRows:[],stale=live&&Array.isArray(live.staleRows)?live.staleRows:[];
  PWCLV_assert_(items,'Live projection preserves reservation row count',active.length+stale.length===sourceRows.length,{source:sourceRows.length,active:active.length,stale:stale.length});
  PWCLV_assert_(items,'No stale concept remains active',active.every(function(x){return x.canonicalStatusNormalized==='PENDING_PLANNING'&&x.lifecycleCurrent===true;}));
  PWCLV_assert_(items,'Live stale concepts are classified',stale.every(function(x){return x.staleLifecycle===true&&x.canonicalStatusNormalized!=='PENDING_PLANNING';}));
  PWCLV_assert_(items,'Lifecycle projection is read-only',live&&live.meta&&live.meta.writes===false&&live.meta.perAuditReads===0);

  var indexed=PWOB_reservationIndexes_(active,[]);
  PWCLV_assert_(items,'Active indexes contain only lifecycle-current concepts',indexed.rows.length===active.length&&indexed.rows.every(function(x){return x.lifecycleCurrent===true;}));
  var staleIds={};stale.forEach(function(x){staleIds[String(x.auditId||'')]=1;});
  PWCLV_assert_(items,'Stale concepts excluded from byAuditId index',Object.keys(indexed.byAuditId||{}).every(function(id){return !staleIds[id];}));

  var failed=items.filter(function(x){return !x.passed;});
  var out={ok:failed.length===0,build:PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_VERIFY_BUILD,passed:items.length-failed.length,total:items.length,items:items,live:{reservationCount:sourceRows.length,activeCount:active.length,staleCount:stale.length,active:active.map(function(x){return{auditId:x.auditId,canonicalStatus:x.canonicalStatus};}),stale:stale.map(function(x){return{auditId:x.auditId,canonicalStatus:x.canonicalStatus,lifecycleReason:x.lifecycleReason};})},meta:{nonDestructive:true,spreadsheetReads:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,statusWrites:false,conceptWrites:false,noNewSsot:true}};
  console.log(JSON.stringify(out,null,2));
  if(failed.length)throw new Error('Planning Workspace concept lifecycle verification failed: '+failed.map(function(x){return x.name;}).join(', '));
  return out;
}
