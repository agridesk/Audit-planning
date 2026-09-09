/***********************************************************************
 * ConceptReservationCommandServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMAND_TESTS_R1
 ***********************************************************************/

var CONCEPT_RESERVATION_COMMAND_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMAND_TESTS_R1';

function CRCT_firstAudit_(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss&&ss.getSheetByName('Audit planning');
  if(!sh||sh.getLastRow()<2)return null;
  var vals=sh.getDataRange().getValues();
  var h=vals[0]||[],c=-1;
  for(var i=0;i<h.length;i++)if(String(h[i]||'').trim().toLowerCase()==='audit id'){c=i;break;}
  if(c<0)return null;
  for(var r=1;r<vals.length;r++){var id=String(vals[r][c]||'').trim();if(id)return{id:id};}
  return null;
}

function RUN_CONCEPT_RESERVATION_COMMAND_REGRESSION(){
  var results=[];function check(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});}
  check('serviceUpsertPresent',typeof ConceptReservationCommandService_upsert==='function');
  check('serviceReleasePresent',typeof ConceptReservationCommandService_release==='function');
  check('platformLockPresent',typeof Platform_withLock==='function');
  check('revisionServicePresent',typeof PlanningRevisionTokenService_get==='function');
  check('revisionGuardPresent',typeof PlanningOptimisticRevisionGuard_evaluate==='function');
  check('contractPresent',typeof ConceptReservationService_build==='function');
  check('headersStable',CONCEPT_RESERVATION_HEADERS.length===15);

  var live=CRCT_firstAudit_();
  check('liveAuditAvailable',!!live,'No live Audit planning row');
  var liveResult=null,serverMs=0;
  if(live){
    var rr=PlanningRevisionTokenService_get({auditId:live.id});
    var t0=Date.now();
    liveResult=ConceptReservationCommandService_upsert({
      auditId:live.id,
      auditorEmail:'test@example.com',
      auditorName:'Regression Test',
      sourceRevision:rr.revision,
      blocks:[{date:'2099-01-01',start:'09:00',end:'10:00',hours:1}],
      createdBy:'regression@example.com',
      dryRun:true
    });
    serverMs=Date.now()-t0;
    check('dryRunAccepted',liveResult&&liveResult.reason==='DRY_RUN_VALID',JSON.stringify(liveResult));
    check('dryRunNoWrite',liveResult&&liveResult.meta&&liveResult.meta.writes===false);
    check('dryRunUsesRevisionGuard',liveResult&&liveResult.revisionGuard&&liveResult.revisionGuard.accepted===true);
    check('dryRunFinalPlanningUntouched',liveResult&&liveResult.meta&&liveResult.meta.finalPlanningWrites===false);
    check('dryRunAvailabilityUntouched',liveResult&&liveResult.meta&&liveResult.meta.availabilityWrites===false);
    check('dryRunStatusUntouched',liveResult&&liveResult.meta&&liveResult.meta.statusWrites===false);

    var conflict=ConceptReservationCommandService_upsert({
      auditId:live.id,auditorEmail:'test@example.com',sourceRevision:'PRT1-0000000000000000000000000000000000000000',
      blocks:[{date:'2099-01-01',start:'09:00',end:'10:00',hours:1}],dryRun:true
    });
    check('revisionConflictBlocked',conflict&&conflict.reason==='REVISION_CONFLICT');
    check('revisionConflictNoWrite',conflict&&conflict.meta&&conflict.meta.writes===false);
  }

  var failed=results.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_RESERVATION_COMMAND_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,liveAuditId:live&&live.id||'',liveServerMs:serverMs,liveResult:liveResult,results:results,meta:{nonDestructive:true,liveReadsPerformed:!!live,liveWritesPerformed:false,sheetProvisioningPerformed:false,nextStep:'After green regression, merge then wire reservation overlay into Planning Workspace read flow.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
