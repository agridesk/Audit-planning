/***********************************************************************
 * ConceptReservationLifecycleTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_LIFECYCLE_TESTS_R1
 *
 * DEV-only destructive-to-test-data regression with explicit cleanup.
 * Creates/provisions Concept Reservations, verifies write/read/overlay/release,
 * then deletes the test row. Never writes Audit planning/Availability/Status.
 ***********************************************************************/
var CONCEPT_RESERVATION_LIFECYCLE_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_LIFECYCLE_TESTS_R1';

function CRLT_firstAudit_(){
  var ss=SpreadsheetApp.getActive(),sh=ss&&ss.getSheetByName('Audit planning');
  if(!sh||sh.getLastRow()<2)return null;
  var vals=sh.getDataRange().getValues(),h=vals[0]||[],c=-1;
  for(var i=0;i<h.length;i++)if(String(h[i]||'').trim().toLowerCase()==='audit id'){c=i;break;}
  if(c<0)return null;
  for(var r=1;r<vals.length;r++){var id=String(vals[r][c]||'').trim();if(id)return id;}
  return null;
}
function CRLT_cleanup_(auditId){
  var sh=SpreadsheetApp.getActive().getSheetByName(CONCEPT_RESERVATION_SHEET||'Concept Reservations');
  if(!sh||sh.getLastRow()<2)return false;
  var row=CRCS_findRow_(sh,auditId);if(!row)return false;sh.deleteRow(row);return true;
}
function RUN_CONCEPT_RESERVATION_LIFECYCLE_REGRESSION(){
  var results=[];function c(n,o,d){results.push({name:n,ok:!!o,detail:d||''});}
  var auditId=CRLT_firstAudit_();c('liveAuditAvailable',!!auditId,'No Audit planning row');
  var created=null,read=null,overlay=null,released=null,readAfter=null,cleanup=false;
  try{
    if(!auditId)throw new Error('No live audit');
    CRLT_cleanup_(auditId);
    var rr=PlanningRevisionTokenService_get({auditId:auditId});
    created=ConceptReservationCommandService_upsert({auditId:auditId,auditorEmail:'concept.lifecycle@example.com',auditorName:'Concept Lifecycle Test',sourceRevision:rr.revision,blocks:[{date:'2026-12-15',start:'09:00',end:'10:00',hours:1}],createdBy:'regression@example.com'});
    c('reservationSaved',created&&created.saved===true,JSON.stringify(created&&created.reason));
    c('noFinalPlanningWrite',created&&created.meta&&created.meta.finalPlanningWrites===false);
    c('noAvailabilityWrite',created&&created.meta&&created.meta.availabilityWrites===false);
    c('noStatusWrite',created&&created.meta&&created.meta.statusWrites===false);
    read=ConceptReservationReadModel_get({from:'2026-12-15',to:'2026-12-15'});
    c('readFindsReservation',read&&read.rows&&read.rows.some(function(x){return x.auditId===auditId&&x.state==='ACTIVE';}));
    overlay=ConceptPlanningReservationOverlay_get({from:'2026-12-15',to:'2026-12-15',auditorEmails:['concept.lifecycle@example.com']});
    c('overlayFindsReservation',overlay&&overlay.rows&&overlay.rows.length===1);
    c('overlayByAuditIndexed',overlay&&overlay.byAuditId&&!!overlay.byAuditId[auditId]);
    released=ConceptReservationCommandService_release({auditId:auditId,releasedBy:'regression@example.com',reason:'REGRESSION_CLEANUP'});
    c('releaseSaved',released&&released.released===true);
    readAfter=ConceptReservationReadModel_get({from:'2026-12-15',to:'2026-12-15'});
    c('releasedExcludedFromRead',readAfter&&readAfter.rows&&!readAfter.rows.some(function(x){return x.auditId===auditId;}));
  }catch(e){c('lifecycleExecution',false,String(e&&e.message||e));}
  finally{try{cleanup=!!auditId&&CRLT_cleanup_(auditId);}catch(e2){cleanup=false;}}
  c('testRowCleanup',cleanup===true,'Test row not deleted');
  var failed=results.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_RESERVATION_LIFECYCLE_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,auditId:auditId||'',results:results,meta:{devOnly:true,testDataWritePerformed:true,testDataCleanupPerformed:cleanup,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false,sheetProvisioningExpected:true}};
  console.log(JSON.stringify(out,null,2));return out;
}
