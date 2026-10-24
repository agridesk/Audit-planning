/**
 * DEV-only canonical Firestore SWAP write-set builder.
 * Requires a previously verified pair snapshot and immutable revisions.
 * This does not authorize migration of spreadsheet-backed audits.
 */
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const statusOk=s=>s==='Accepted';
const encode=value=>({stringValue:JSON.stringify(value)});
function validBlocks(blocks){
 return Array.isArray(blocks)&&blocks.length>0&&blocks.length<=100&&blocks.every(b=>
  (typeof b==='string'&&b.trim().length>0&&b.length<=150)||
  (b!==null&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).length>0));
}
export function buildSwapFirestoreWriteSet({project,operationId,proposal,pair,availability,finalReservations,actorEmail,now=new Date().toISOString()}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||'')||!ID.test(operationId||'')||
  !proposal||proposal.operationId!==operationId||proposal.status!=='CONFIRMED'||!TIMESTAMP.test(proposal.updateTime||'')||
  !proposal.auditA||!proposal.auditB||proposal.auditA===proposal.auditB||
  !Array.isArray(pair)||pair.length!==2||!Array.isArray(availability)||availability.length!==2||!Array.isArray(finalReservations)||finalReservations.length!==2||
  !TIMESTAMP.test(now)||typeof actorEmail!=='string'||!actorEmail.includes('@'))
  throw Error('SWAP_WRITESET_INPUT_INVALID');
 if(!validBlocks(proposal.blocksA)||!validBlocks(proposal.blocksB))throw Error('SWAP_WRITESET_PROPOSED_BLOCKS_REQUIRED');
 if(proposal.dateChanged===true&&(!Array.isArray(proposal.requiredAuditorUids)||!proposal.requiredAuditorUids.length||
  proposal.requiredAuditorUids.some(uid=>!proposal.acknowledgedAuditorUids?.includes(uid))))
  throw Error('SWAP_WRITESET_ACK_INCOMPLETE');
 const ids=[proposal.auditA,proposal.auditB];
 const revisions=new Set();
 for(let i=0;i<2;i++){
  const row=pair[i],slot=availability[i],finalSlot=finalReservations[i];
  if(!row||row.auditId!==ids[i]||!statusOk(row.status)||!TIMESTAMP.test(row.updateTime||'')||
   !row.canonical||typeof row.canonical!=='object'||!slot||slot.auditId!==ids[i]||
   !TIMESTAMP.test(slot.updateTime||'')||!Array.isArray(slot.reservations)||!finalSlot||finalSlot.auditId!==ids[i]||!Array.isArray(finalSlot.reservations)||finalSlot.verified!==true)
   throw Error('SWAP_WRITESET_PAIR_INVALID');
  revisions.add(row.updateTime+'|'+row.auditId);
 }
 if(revisions.size!==2)throw Error('SWAP_WRITESET_REVISIONS_INVALID');
 const root='projects/'+project+'/databases/(default)/documents/';
 const writes=[];
 for(let i=0;i<2;i++){
  const source=pair[i],slot=availability[i];
  // Only exchange explicitly supplied planned dates and reservation sets.
  if(!Array.isArray(source.canonical.plannedBlocks))
   throw Error('SWAP_WRITESET_BLOCKS_MISSING');
  const next={...source.canonical,plannedBlocks:i===0?proposal.blocksA:proposal.blocksB};
  writes.push({update:{name:root+'ams_swap20_dev_audits/'+encodeURIComponent(source.auditId),fields:{payload:encode(next)}},currentDocument:{updateTime:source.updateTime}});
  writes.push({update:{name:root+'ams_swap20_dev_availability/'+encodeURIComponent(slot.auditId),fields:{payload:encode({reservations:finalReservations[i].reservations})}},currentDocument:{updateTime:slot.updateTime}});
 }
 writes.push({update:{name:root+'ams_swap20_dev_proposals/'+operationId,
  fields:{payload:encode({...proposal,status:'APPLIED',canonicalCommitVerified:true,appliedAt:now,appliedBy:actorEmail})}},
  currentDocument:{updateTime:proposal.updateTime}});
 const journal={operationId,auditA:ids[0],auditB:ids[1],stage:'COMMITTED',actorEmail,committedAt:now,
  auditRevisions:pair.map(row=>row.updateTime),availabilityRevisions:availability.map(row=>row.updateTime)};
 writes.push({update:{name:root+'ams_swap20_dev_journal/'+operationId,fields:{payload:encode(journal)}},currentDocument:{exists:false}});
 return Object.freeze({operationId,writes});
}
