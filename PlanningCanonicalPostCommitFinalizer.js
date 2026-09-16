/***********************************************************************
 * PlanningCanonicalPostCommitFinalizer.js
 * BUILD: 2026-09-16_ROADMAP_2_4_POST_COMMIT_FINALIZER_R2_NOTIFICATION_BOUNDARY
 *
 * Exception boundary for post-commit coordination side effects.
 * Canonical planning is already committed when this runs.
 * Reservation cleanup and Notification Queue dispatch are isolated: neither
 * failure may reverse or misreport the canonical commit.
 ***********************************************************************/
var PLANNING_CANONICAL_POST_COMMIT_FINALIZER_BUILD='2026-09-16_ROADMAP_2_4_POST_COMMIT_FINALIZER_R2_NOTIFICATION_BOUNDARY';

function PlanningCanonicalPostCommitFinalizer_finalize(input){
  input=input||{};
  if(typeof input.releaseFn!=='function')throw new Error('PlanningCanonicalPostCommitFinalizer: releaseFn required');

  var release=null,releaseError='';
  try{
    release=input.releaseFn();
  }catch(e){
    releaseError=String(e&&e.message||e);
    release={success:false,released:false,reason:'RELEASE_EXCEPTION',error:releaseError};
  }
  var releaseRepairRequired=!!(release&&release.success===false);

  var notification=null,notificationError='',notificationRepairRequired=false;
  if(typeof input.notificationFn==='function'){
    try{
      notification=input.notificationFn();
      notificationRepairRequired=!!(!notification||notification.success===false||notification.skipped===true);
    }catch(n){
      notificationError=String(n&&n.message||n);
      notification={success:false,reason:'NOTIFICATION_EXCEPTION',error:notificationError};
      notificationRepairRequired=true;
    }
  }else if(input.notificationRequired===true){
    notification={success:false,reason:'NOTIFICATION_DISPATCH_UNAVAILABLE'};
    notificationRepairRequired=true;
  }

  var repairRequired=releaseRepairRequired||notificationRepairRequired;
  var reason='COMMITTED';
  if(releaseRepairRequired&&notificationRepairRequired)reason='COMMITTED_POST_COMMIT_REPAIR_REQUIRED';
  else if(releaseRepairRequired)reason='COMMITTED_RESERVATION_RELEASE_REPAIR_REQUIRED';
  else if(notificationRepairRequired)reason='COMMITTED_NOTIFICATION_REPAIR_REQUIRED';

  return{
    success:true,
    committed:true,
    reason:reason,
    reservationRelease:release,
    notification:notification,
    releaseRepairRequired:releaseRepairRequired,
    notificationRepairRequired:notificationRepairRequired,
    repairRequired:repairRequired,
    error:releaseError||notificationError,
    errors:{reservationRelease:releaseError,notification:notificationError},
    meta:{
      canonicalCommitPreserved:true,
      cleanupFailureCannotReverseCommit:true,
      notificationFailureCannotReverseCommit:true,
      notificationRequired:input.notificationRequired===true
    }
  };
}
