/**
 * AMS Swap 2.0 — operational proposal state only.
 * No lifecycle mutation, availability write, ECAS dispatch or audit re-accept.
 * Persistence, authentication, scheduling and atomic commit belong to canonical GAS owners.
 */
export const SWAP_PROPOSAL_STATES=Object.freeze({
 AWAITING_ACKNOWLEDGEMENT:'AWAITING_ACKNOWLEDGEMENT',
 CONFIRMED:'CONFIRMED',DECLINED:'DECLINED',WITHDRAWN:'WITHDRAWN',
 ESCALATED:'ESCALATED',APPLIED:'APPLIED',CONFLICT:'CONFLICT'
});
const terminal=new Set(['DECLINED','WITHDRAWN','APPLIED','CONFLICT']);
const distinct=a=>[...new Set(a.filter(Boolean))];
export function createSwapProposal(input){
 const {operationId,auditA,auditB,requiredAuditorUids,createdAt,originalRevisions,internalReason,ecasComment}=input||{};
 if(!operationId||!auditA||!auditB||auditA===auditB)throw Error('Two distinct audits and operationId required');
 if(!Array.isArray(requiredAuditorUids)||!requiredAuditorUids.length||distinct(requiredAuditorUids).length!==requiredAuditorUids.length)throw Error('Auditor UID acknowledgement required');
 if(!createdAt||!Number.isFinite(Date.parse(createdAt)))throw Error('Valid creation timestamp required');
 if(!originalRevisions||originalRevisions[auditA]==null||originalRevisions[auditB]==null)throw Error('Both original revisions required');
 if(!String(internalReason||'').trim())throw Error('Internal reason required');
 if(!String(ecasComment||'').trim())throw Error('Distinct ECAS explanation required');
 return {operationId,auditA,auditB,requiredAuditorUids:[...requiredAuditorUids],acknowledgedAuditorUids:[],createdAt,status:SWAP_PROPOSAL_STATES.AWAITING_ACKNOWLEDGEMENT,reminderSentAt:null,escalatedAt:null,originalRevisions:{[auditA]:originalRevisions[auditA],[auditB]:originalRevisions[auditB]},internalReason:String(internalReason).trim(),ecasComment:String(ecasComment).trim()};
}
export function applySwapProposalEvent(proposal,event){
 if(!proposal||!event||!event.type)throw Error('Proposal and event required');
 const p={...proposal,acknowledgedAuditorUids:[...proposal.acknowledgedAuditorUids]};
 if(terminal.has(p.status))throw Error('Swap proposal is terminal');
 const at=event.at;
 if(!at||!Number.isFinite(Date.parse(at)))throw Error('Valid event timestamp required');
 switch(event.type){
 case 'ACKNOWLEDGE':
  if(!p.requiredAuditorUids.includes(event.auditorUid))throw Error('Auditor not assigned to proposal');
  if(p.status==='CONFIRMED')return p;
  p.acknowledgedAuditorUids=distinct([...p.acknowledgedAuditorUids,event.auditorUid]);
  if(p.requiredAuditorUids.every(uid=>p.acknowledgedAuditorUids.includes(uid)))p.status='CONFIRMED';
  return p;
 case 'DECLINE':
  if(!p.requiredAuditorUids.includes(event.auditorUid))throw Error('Auditor not assigned to proposal');
  p.status='DECLINED';p.declinedBy=event.auditorUid;p.declinedAt=at;return p;
 case 'WITHDRAW':
  if(event.actorRole!=='MANAGER')throw Error('Manager required');
  p.status='WITHDRAWN';p.withdrawnAt=at;return p;
 case 'REMIND':
  if(p.status!=='AWAITING_ACKNOWLEDGEMENT'&&p.status!=='ESCALATED')throw Error('No acknowledgement outstanding');
  if(Date.parse(at)-Date.parse(p.createdAt)<86400000)throw Error('24h reminder not yet due');
  if(p.reminderSentAt)return p;
  p.reminderSentAt=at;return p;
 case 'ESCALATE':
  if(p.status!=='AWAITING_ACKNOWLEDGEMENT')throw Error('No acknowledgement outstanding');
  if(Date.parse(at)-Date.parse(p.createdAt)<172800000)throw Error('48h escalation not yet due');
  p.status='ESCALATED';p.escalatedAt=at;return p;
 case 'APPLY':
  if(p.status!=='CONFIRMED')throw Error('All auditors must acknowledge first');
  if(event.actorRole!=='MANAGER')throw Error('Manager required');
  if(event.canonicalCommitVerified!==true)throw Error('Canonical atomic commit not verified');
  p.status='APPLIED';p.appliedAt=at;return p;
 case 'CONFLICT':
  if(event.actorRole!=='MANAGER'&&event.actorRole!=='SYSTEM')throw Error('Unauthorized conflict report');
  p.status='CONFLICT';p.conflictAt=at;return p;
 default:throw Error('Unknown swap proposal event');
 }
}
export function previewSwapFinalState(input){
 const {auditA,auditB,blocksA,blocksB,otherReservations=[],auditorA,auditorB}=input||{};
 if(!auditA||!auditB||auditA===auditB)throw Error('Distinct audit IDs required');
 if(!auditorA||!auditorB)throw Error('Auditor IDs required');
 const entries=[];
 for(const [auditId,auditorUid,blocks] of [[auditA,auditorA,blocksA],[auditB,auditorB,blocksB]]){
  if(!Array.isArray(blocks)||!blocks.length)throw Error('Planning blocks required');
  for(const b of blocks){
   if(!b||!b.date||!b.start||!b.end||b.start>=b.end)throw Error('Invalid block');
   entries.push({...b,auditId,auditorUid});
  }
 }
 const others=otherReservations.filter(x=>x.auditId!==auditA&&x.auditId!==auditB);
 const all=[...others,...entries],conflicts=[];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];
  if(a.auditId!==b.auditId&&a.auditorUid===b.auditorUid&&a.date===b.date&&a.start<b.end&&b.start<a.end)
   conflicts.push({auditA:a.auditId,auditB:b.auditId,date:a.date});
 }
 return {canProceed:conflicts.length===0,conflicts,proposedBlocks:entries,committed:false,requiresCanonicalValidation:true};
}
export function validateSwapProposalSource(proposal,current){
 if(!proposal||!current)throw Error('Proposal and current revisions required');
 const ids=[proposal.auditA,proposal.auditB];
 const conflicts=ids.filter(id=>!current[id]||String(current[id].revision)!==String(proposal.originalRevisions[id])||String(current[id].status).trim().toLowerCase()!=='accepted');
 return {valid:conflicts.length===0,conflictingAuditIds:conflicts,readOnly:true};
}
export function swapProposalNeedsAction(proposal,now){
 const age=Date.parse(now)-Date.parse(proposal.createdAt);
 const waiting=proposal.status==='AWAITING_ACKNOWLEDGEMENT'||proposal.status==='ESCALATED';
 return {reminderDue:waiting&&!proposal.reminderSentAt&&age>=86400000,escalationDue:proposal.status==='AWAITING_ACKNOWLEDGEMENT'&&age>=172800000,unacknowledgedAuditorUids:proposal.requiredAuditorUids.filter(uid=>!proposal.acknowledgedAuditorUids.includes(uid))};
}

export function evaluateSwapEligibility(pair){
 const a=pair&&pair.auditA,b=pair&&pair.auditB;
 if(!a||!b||a.auditId===b.auditId)throw Error('Distinct canonical audits required');
 const accepted=x=>String(x.status||'').trim().toLowerCase()==='accepted';
 const planned=x=>Array.isArray(x.blocks)&&x.blocks.length>0;
 const eligible=accepted(a)&&accepted(b)&&planned(a)&&planned(b)&&Boolean(a.assignedTo)&&Boolean(b.assignedTo)&&Boolean(a.revision)&&Boolean(b.revision);
 return {eligible,readOnly:true,canCommit:false,revisions:{[a.auditId]:a.revision,[b.auditId]:b.revision},reason:eligible?null:'CANONICAL_SWAP_INELIGIBLE'};
}

export function prepareSwapCommit(proposal,current,preview){
 if(!proposal||proposal.status!=='CONFIRMED')throw Error('Auditor acknowledgements incomplete');
 const source=validateSwapProposalSource(proposal,current);
 if(!source.valid)throw Error('Canonical revision conflict: '+source.conflictingAuditIds.join(','));
 if(!preview||!preview.canProceed||preview.requiresCanonicalValidation!==true||preview.committed!==false)throw Error('Final-state preview not approved');
 if(!Array.isArray(preview.proposedBlocks)||!preview.proposedBlocks.length)throw Error('Missing final-state blocks');
 const ids=new Set(preview.proposedBlocks.map(x=>x.auditId));
 if(ids.size!==2||!ids.has(proposal.auditA)||!ids.has(proposal.auditB))throw Error('Preview audit pair mismatch');
 return {operationId:proposal.operationId,auditIds:[proposal.auditA,proposal.auditB],expectedRevisions:{...proposal.originalRevisions},proposedBlocks:preview.proposedBlocks.map(x=>({...x})),ecasComment:proposal.ecasComment,requiresCanonicalLock:true,requiresDurableJournal:true,requiresAtomicCommit:true,commitAuthorized:false};
}

export function buildSwapSlotExchange(input){
 const {auditA,auditB,blocksA,blocksB}=input||{};
 if(!auditA||!auditB||auditA===auditB)throw Error('Distinct audit IDs required');
 if(!Array.isArray(blocksA)||!blocksA.length||!Array.isArray(blocksB)||!blocksB.length)throw Error('Both audit schedules required');
 if(blocksA.length!==blocksB.length)throw Error('Unequal block counts require explicit manager mapping');
 const mins=t=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||''))throw Error('Invalid time');return Number(t.slice(0,2))*60+Number(t.slice(3));};
 const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const move=(source,target)=>source.map((b,i)=>{
  const slot=target[i];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^\d{4}-\d{2}-\d{2}$/.test(slot.date||''))throw Error('Invalid date');
  const duration=mins(b.end)-mins(b.start),start=mins(slot.start);
  if(duration<=0||start+duration>1440)throw Error('Swap duration cannot fit target slot');
  return {...b,date:slot.date,start:clock(start),end:clock(start+duration)};
 });
 return {auditA,auditB,blocksA:move(blocksA,blocksB),blocksB:move(blocksB,blocksA),requiresCanonicalValidation:true};
}

export function evaluateSwapFinalState(input){
 const {proposal,current,sourceBlocksA,sourceBlocksB,otherReservations=[],auditorA,auditorB}=input||{};
 if(!proposal)throw Error('Proposal required');
 const source=validateSwapProposalSource(proposal,current);
 if(!source.valid)return {canProceed:false,reason:'STALE_CANONICAL_REVISION',conflictingAuditIds:source.conflictingAuditIds,committed:false};
 const exchange=buildSwapSlotExchange({auditA:proposal.auditA,auditB:proposal.auditB,blocksA:sourceBlocksA,blocksB:sourceBlocksB});
 const preview=previewSwapFinalState({auditA:proposal.auditA,auditB:proposal.auditB,blocksA:exchange.blocksA,blocksB:exchange.blocksB,otherReservations,auditorA,auditorB});
 return {...preview,reason:preview.canProceed?null:'AUDITOR_SLOT_CONFLICT',sourceRevisions:{...proposal.originalRevisions},exchange,readOnly:true};
}
