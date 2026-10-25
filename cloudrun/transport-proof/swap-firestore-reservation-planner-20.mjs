/**
 * Firestore canonical reservation planner, DEV only.
 * Records are normalized per-audit reservations, with a shared owner/day
 * conflict index supplied by the caller. No implicit empty-day availability.
 */
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const clock=s=>{if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('SWAP_RESERVATION_TIME_INVALID');return Number(s.slice(0,2))*60+Number(s.slice(3));};
const key=r=>String(r.owner||'').trim().toLowerCase()+'|'+r.date;
const intersects=(a,b)=>key(a)===key(b)&&clock(a.start)<clock(b.end)&&clock(b.start)<clock(a.end);
export function resolveSwapFirestoreReservations({proposal,pair,availability,owners,externalReservations,completeExternalIndex=false}={}){
 if(!proposal||!Array.isArray(pair)||pair.length!==2||!Array.isArray(availability)||availability.length!==2||
  !owners||!Array.isArray(externalReservations)||completeExternalIndex!==true)
  throw Error('SWAP_RESERVATION_INDEX_INCOMPLETE');
 const ids=[proposal.auditA,proposal.auditB],result=[];
 const seen=new Set();
 if(ids[0]===ids[1])throw Error('SWAP_RESERVATION_PAIR_INVALID');
 for(const record of externalReservations){
  if(!record||typeof record.auditId!=='string'||!record.auditId||
   typeof record.owner!=='string'||!record.owner.includes('@')||!DAY.test(record.date||'')||
   clock(record.start)>=clock(record.end))throw Error('SWAP_RESERVATION_INDEX_INVALID');
  if(ids.includes(record.auditId))throw Error('SWAP_RESERVATION_INDEX_CONTAINS_PAIR');
  const id=[record.auditId,record.owner,record.date,record.start,record.end].join('|');
  if(seen.has(id))throw Error('SWAP_RESERVATION_INDEX_DUPLICATE');
  seen.add(id);
 }
 const allocated=[];
 for(let i=0;i<2;i++){
  const id=ids[i],source=availability[i],blocks=i===0?proposal.blocksA:proposal.blocksB;
  if(!Array.isArray(blocks))throw Error('SWAP_RESERVATION_BLOCK_INVALID');
  if(!source||source.auditId!==id||!Array.isArray(source.reservations)||source.reservations.length!==blocks.length)
   throw Error('SWAP_RESERVATION_COUNT_MISMATCH');
  if(!Array.isArray(blocks))throw Error('SWAP_RESERVATION_BLOCK_INVALID');
  const owner=owners[id];
  if(typeof owner!=='string'||!owner.includes('@'))throw Error('SWAP_RESERVATION_OWNER_INVALID');
  const reservations=blocks.map(block=>{
   if(!block||!DAY.test(block.date||'')||clock(block.start)>=clock(block.end))
    throw Error('SWAP_RESERVATION_BLOCK_INVALID');
   return {auditId:id,owner,date:block.date,start:block.start,end:block.end,status:'Accepted'};
  });
  for(const reservation of reservations){
   if([...externalReservations,...allocated].some(existing=>intersects(reservation,existing)))
    throw Error('SWAP_RESERVATION_OVERLAP');
   allocated.push(reservation);
  }
  result.push({auditId:id,reservations,verified:true});
 }
 return result;
}
