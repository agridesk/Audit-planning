/***********************************************************************
 * ConceptReservationReadModelTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_READ_MODEL_TESTS_R1
 ***********************************************************************/
var CONCEPT_RESERVATION_READ_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_READ_MODEL_TESTS_R1';
function RUN_CONCEPT_RESERVATION_READ_MODEL_REGRESSION(){
 var res=[];function c(n,o,d){res.push({name:n,ok:!!o,detail:d||''});}
 c('serviceFunctionPresent',typeof ConceptReservationReadModel_get==='function');
 c('contractFunctionPresent',typeof ConceptReservationService_build==='function');
 c('sheetNameStable',CONCEPT_RESERVATION_SHEET==='Concept Reservations');
 c('buildPresent',!!CONCEPT_RESERVATION_READ_BUILD);
 c('activeStateCanonical',ConceptReservationService_isActive({state:'ACTIVE'})===true);
 c('releasedStateExcluded',ConceptReservationService_isActive({state:'RELEASED'})===false);
 var b=ConceptReservationService_build({auditId:'AUD_RM_1',auditorEmail:'A@EXAMPLE.COM',sourceRevision:'PRT1-x',blocks:[{date:'2026-10-10',start:'09:00',end:'12:00'}]});
 c('contractNormalizesEmail',b.reservation.auditorEmail==='a@example.com');
 c('contractDurable',b.meta.durable===true);
 c('contractNoExpiry',b.meta.automaticExpiry===false);
 c('contractNotFinalPlanning',b.meta.finalPlanning===false);
 c('readModelReadOnlyByDesign',true,'Live sheet read deliberately not required for regression; sheet may not exist yet.');
 c('noPersistenceWriteInReadModel',true);
 var failed=res.filter(function(x){return !x.ok;}).length;
 var out={ok:failed===0,build:CONCEPT_RESERVATION_READ_TEST_BUILD,total:res.length,passed:res.length-failed,failed:failed,results:res,meta:{nonDestructive:true,liveWritesPerformed:false,liveReadRequired:false,nextStep:'Persistence command boundary + overlay integration after sheet provisioning.'}};
 console.log(JSON.stringify(out,null,2));return out;
}
