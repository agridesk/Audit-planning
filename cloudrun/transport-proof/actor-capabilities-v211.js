function clean(v){return String(v==null?'':v).trim();}
function statusKey(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function email(v){return clean(v).toLowerCase();}

export function v211ActorCapabilities(input={}){
  const role=clean(input.actorRole).toUpperCase();
  const actorEmail=email(input.actorEmail);
  const actorUid=clean(input.actorUid||input.auditorUid);
  const assignedUid=clean(input.assignedToUid||input.assignedAuditorUid);
  const preassignedUid=clean(input.preassignedToUid||input.preassignedAuditorUid);
  const status=statusKey(input.status);
  const assigned=email(input.assignedToEmail||input.assignedTo);
  const preassigned=email(input.preassignedToEmail||input.preassignedAuditor);
  const allowSelfPlanning=input.allowSelfPlanning===true;
  const hardEligible=input.hardEligible===true;
  // Prefer immutable UID whenever both sides supply one. An explicit UID mismatch
  // must never be overridden by equal legacy email addresses.
  const uidOwnership=(targetUid,targetEmail)=>targetUid?(!!actorUid&&actorUid===targetUid):(!actorUid||!targetUid)&&!!actorEmail&&targetEmail===actorEmail;
  const isOwnAssigned=uidOwnership(assignedUid,assigned);
  const isOwnPreassigned=uidOwnership(preassignedUid,preassigned);
  const noAssignment=!assigned&&!preassigned&&!assignedUid&&!preassignedUid;
  const pending=status==='PENDING_PLANNING';
  const selfPool=pending&&allowSelfPlanning&&noAssignment&&hardEligible;
  const auditorVisible=pending?(isOwnAssigned||isOwnPreassigned||selfPool):isOwnAssigned;

  const c={
    canPlan:false,canApprove:false,canAccept:false,canAcceptOnBehalf:false,
    canCancel:false,canReAdjust:false,canComplete:false,canChangePreassignment:false,
    canChangeSelfPlanning:false,canExport:false
  };

  if(role==='MANAGER'){
    c.canPlan=status==='PENDING_PLANNING';
    c.canApprove=status==='PENDING_APPROVAL';
    c.canAcceptOnBehalf=status==='APPROVED';
    c.canCancel=['PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(status);
    c.canReAdjust=['PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(status);
    c.canComplete=status==='ACCEPTED';
    c.canChangePreassignment=status==='PENDING_PLANNING';
    c.canChangeSelfPlanning=status==='PENDING_PLANNING';
    c.canExport=true;
  }else if(role==='AUDITOR'){
    c.canPlan=pending&&allowSelfPlanning&&hardEligible&&(isOwnAssigned||isOwnPreassigned||noAssignment);
    c.canAccept=status==='APPROVED'&&isOwnAssigned;
    c.canCancel=status==='PENDING_APPROVAL'&&isOwnAssigned;
    c.canComplete=status==='ACCEPTED'&&isOwnAssigned;
    c.canExport=auditorVisible;
  }

  return{
    role,status,actorEmail,actorUid,assignedToUid:assignedUid,preassignedToUid:preassignedUid,assignedToEmail:assigned,preassignedToEmail:preassigned,
    isOwnAssigned,isOwnPreassigned,selfPlanningPool:selfPool,preassignmentConflict:role==='AUDITOR'&&pending&&allowSelfPlanning&&isOwnPreassigned&&!hardEligible,visible:role==='MANAGER'?true:role==='AUDITOR'?auditorVisible:false,
    capabilities:c
  };
}

export function v211AuditVisibleToActor(input={}){
  return v211ActorCapabilities(input).visible;
}
