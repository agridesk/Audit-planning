/***********************************************************************
 * PlanningCanonicalPostCommitFinalizer.js
 * BUILD: 2026-09-17_ROADMAP_2_4_POST_COMMIT_FINALIZER_R3_SPLIT_LOCK_BOUNDARY
 ***********************************************************************/
var PLANNING_CANONICAL_POST_COMMIT_FINALIZER_BUILD='2026-09-17_ROADMAP_2_4_POST_COMMIT_FINALIZER_R3_SPLIT_LOCK_BOUNDARY';

function PlanningCanonicalPostCommitFinalizer_release(input){
  input=input||{};
  if(typeof input.releaseFn!=='function')throw new Error('PlanningCanonicalPostCommitFinalizer: releaseFn required');
  var release=null,error='';
  try{release=input.releaseFn();}catch(e){error=String(e&&e.message||e);release={success:false,released:false,reason:'RELEASE_EXCEPTION',error:error};}
  var repair=!!(release&&release.success===false);
  return{success:true,committed:true,reason:repair?'COMMITTED_RESERVATION_RELEASE_REPAIR_REQUIRED':'COMMITTED',reservationRelease:release,releaseRepairRequired:repair,error:error,meta:{canonicalCommitPreserved:true,cleanupFailureCannotReverseCommit:true,callerLockPreserved:true}};
}

function PlanningCanonicalPostCommitFinalizer_notification(input){
  input=input||{};
  var notification=null,error='',repair=false;
  if(typeof input.notificationFn==='function'){
    try{notification=input.notificationFn();repair=!!(!notification||notification.success===false||notification.skipped===true);}
    catch(e){error=String(e&&e.message||e);notification={success:false,reason:'NOTIFICATION_EXCEPTION',error:error};repair=true;}
  }else if(input.notificationRequired===true){notification={success:false,reason:'NOTIFICATION_DISPATCH_UNAVAILABLE'};repair=true;}
  return{success:true,committed:true,reason:repair?'COMMITTED_NOTIFICATION_REPAIR_REQUIRED':'COMMITTED',notification:notification,notificationRepairRequired:repair,error:error,meta:{canonicalCommitPreserved:true,notificationFailureCannotReverseCommit:true,outsidePlanningLock:true,notificationRequired:input.notificationRequired===true}};
}

function PlanningCanonicalPostCommitFinalizer_finalize(input){
  input=input||{};
  var rel=PlanningCanonicalPostCommitFinalizer_release(input);
  var note=PlanningCanonicalPostCommitFinalizer_notification(input);
  var repair=rel.releaseRepairRequired===true||note.notificationRepairRequired===true;
  var reason='COMMITTED';
  if(rel.releaseRepairRequired&&note.notificationRepairRequired)reason='COMMITTED_POST_COMMIT_REPAIR_REQUIRED';
  else if(rel.releaseRepairRequired)reason='COMMITTED_RESERVATION_RELEASE_REPAIR_REQUIRED';
  else if(note.notificationRepairRequired)reason='COMMITTED_NOTIFICATION_REPAIR_REQUIRED';
  return{success:true,committed:true,reason:reason,reservationRelease:rel.reservationRelease,notification:note.notification,releaseRepairRequired:rel.releaseRepairRequired===true,notificationRepairRequired:note.notificationRepairRequired===true,repairRequired:repair,error:rel.error||note.error||'',errors:{reservationRelease:rel.error||'',notification:note.error||''},meta:{canonicalCommitPreserved:true,cleanupFailureCannotReverseCommit:true,notificationFailureCannotReverseCommit:true,notificationRequired:input.notificationRequired===true,splitLockBoundarySupported:true}};
}
