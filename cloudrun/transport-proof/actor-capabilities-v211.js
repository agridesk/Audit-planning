function clean(v){return String(v==null?'':v).trim();}
function statusKey(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function email(v){return clean(v).toLowerCase();}

export function v211ActorCapabilities(input={}){
  const role=clean(input.actorRole).toUpperCase();
  const actorEmail=email(input.actorEmail);
  const status=statusKey(input.status);
  const assigned=email(input.assignedToEmail||input.assignedTo);
  const preassigned=email(input.preassignedToEmail||input.preassignedAuditor);
  const allowSelfPlanning=input.allowSelfPlanning===true;
  const hardEligible=input.hardEligible===true;
  const isOwnAssigned=!!actorEmail&&assigned===actorEmail;
  const isOwnPreassigned=!!actorEmail&&preassigned===actorEmail;
  const noAssignment=!assigned&&!preassigned;
  const selfPool=status==='PENDING_PLANNING'&&allowSelfPlanning&&noAssignment&&hardEligible;
  const auditorOwn=isOwnAssigned||isOwnPreassigned;
  const auditorVisible=auditorOwn||selfPool;

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
    c.canPlan=status==='PENDING_PLANNING'&&((isOwnPreassigned&&hardEligible)||selfPool);
    c.canAccept=status==='APPROVED'&&isOwnAssigned;
    c.canCancel=status==='PENDING_APPROVAL'&&isOwnAssigned;
    c.canComplete=status==='ACCEPTED'&&isOwnAssigned;
    c.canExport=auditorVisible;
  }

  return{
    role,status,actorEmail,assignedToEmail:assigned,preassignedToEmail:preassigned,
    isOwnAssigned,isOwnPreassigned,selfPlanningPool:selfPool,preassignmentConflict:role==='AUDITOR'&&status==='PENDING_PLANNING'&&isOwnPreassigned&&!hardEligible,visible:role==='MANAGER'?true:role==='AUDITOR'?auditorVisible:false,
    capabilities:c
  };
}

export function v211AuditVisibleToActor(input={}){
  return v211ActorCapabilities(input).visible;
}
