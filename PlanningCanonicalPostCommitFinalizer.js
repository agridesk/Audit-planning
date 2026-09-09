/***********************************************************************
 * PlanningCanonicalPostCommitFinalizer.js
 * BUILD: 2026-09-09_ROADMAP_2_4_POST_COMMIT_FINALIZER_R1
 *
 * Pure exception boundary for coordination cleanup after canonical commit.
 * A cleanup failure can require repair, but can never turn a completed
 * canonical planning commit into an apparent failed commit.
 ***********************************************************************/
var PLANNING_CANONICAL_POST_COMMIT_FINALIZER_BUILD='2026-09-09_ROADMAP_2_4_POST_COMMIT_FINALIZER_R1';
function PlanningCanonicalPostCommitFinalizer_finalize(input){input=input||{};if(typeof input.releaseFn!=='function')throw new Error('PlanningCanonicalPostCommitFinalizer: releaseFn required');var release=null,error='';try{release=input.releaseFn();}catch(e){error=String(e&&e.message||e);release={success:false,released:false,reason:'RELEASE_EXCEPTION',error:error};}var repairRequired=!!(release&&release.success===false);return{success:true,committed:true,reason:repairRequired?'COMMITTED_RESERVATION_RELEASE_REPAIR_REQUIRED':'COMMITTED',reservationRelease:release,repairRequired:repairRequired,error:error,meta:{canonicalCommitPreserved:true,cleanupFailureCannotReverseCommit:true}};}
