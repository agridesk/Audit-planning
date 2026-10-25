/**
 * Pure DEV SWAP schedule validator aligned with canonical GAS guard.
 * No I/O and no write authorization.
 */
const dateOk=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
};
function minutes(value){
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('SWAP_SCHEDULE_TIME_INVALID');
 return Number(value.slice(0,2))*60+Number(value.slice(3));
}
function overlap(a,b){return a.date===b.date&&minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);}
export function validateSwapCanonicalSchedule({proposal,pair}={}){
 if(!proposal||!Array.isArray(pair)||pair.length!==2||pair[0]?.auditId!==proposal.auditA||pair[1]?.auditId!==proposal.auditB)
  throw Error('SWAP_SCHEDULE_PAIR_INVALID');
 const ids=[proposal.auditA,proposal.auditB];
 if(!proposal.originalRevisions||ids.some(id=>!proposal.originalRevisions[id]))throw Error('SWAP_SCHEDULE_REVISIONS_REQUIRED');
 const final=[proposal.blocksA,proposal.blocksB];
 for(let i=0;i<2;i++){
  const source=pair[i]?.canonical;
  const before=source?.plannedBlocks;
  const after=final[i];
  if(!Array.isArray(before)||!Array.isArray(after)||!before.length||before.length!==after.length)
   throw Error('SWAP_SCHEDULE_BLOCK_COUNT');
  if(String(proposal.originalRevisions[ids[i]])!==String(pair[i].canonical.revision))
   throw Error('SWAP_SCHEDULE_REVISION_CONFLICT');
  if(source.status!=='Accepted'&&pair[i].status!=='Accepted')throw Error('SWAP_SCHEDULE_STATUS_INVALID');
  for(let j=0;j<after.length;j++){
   const b=before[j],n=after[j];
   if(!n||!dateOk(n.date))throw Error('SWAP_SCHEDULE_DATE_INVALID');
   const original=minutes(b.start),originalEnd=minutes(b.end),start=minutes(n.start),end=minutes(n.end);
   if(originalEnd<=original||end<=start||originalEnd-original!==end-start)
    throw Error('SWAP_SCHEDULE_DURATION_MISMATCH');
  }
  for(let j=0;j<after.length;j++)for(let k=j+1;k<after.length;k++)
   if(overlap(after[j],after[k]))throw Error('SWAP_SCHEDULE_INTERNAL_OVERLAP');
 }
 const ownerA=String(pair[0].canonical.assignedTo||'').trim().toLowerCase();
 const ownerB=String(pair[1].canonical.assignedTo||'').trim().toLowerCase();
 if(!ownerA.includes('@')||!ownerB.includes('@'))throw Error('SWAP_SCHEDULE_OWNER_INVALID');
 if(ownerA===ownerB)for(const a of final[0])for(const b of final[1])
  if(overlap(a,b))throw Error('SWAP_SCHEDULE_CROSS_AUDIT_OVERLAP');
 return {ok:true,owners:{[ids[0]]:ownerA,[ids[1]]:ownerB}};
}
