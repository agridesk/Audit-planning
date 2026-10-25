/**
 * Read-only DEV migration coverage assessment. Never writes or enables cutover.
 */
export function assessSwapSheetMigrationCoverage({auditRows,availabilityRows}={}){
 if(!Array.isArray(auditRows)||!Array.isArray(availabilityRows)||!auditRows.length||!availabilityRows.length)throw Error('SWAP_COVERAGE_INPUT_MISSING');
 const ah=auditRows[0],vh=availabilityRows[0];
 const col=(h,k)=>{const i=h.indexOf(k);if(i<0)throw Error('SWAP_COVERAGE_HEADER_MISSING');return i;};
 const idCol=col(ah,'Audit ID'),statusCol=col(ah,'Status'),planCol=col(ah,'Planning JSON');
 const aid1=col(vh,'Audit_ID_1'),aid2=col(vh,'Audit_ID_2');
 const auditIds=new Set(),reservations=new Map(),issues=[],statuses={};
 for(let i=1;i<auditRows.length;i++){
  const row=auditRows[i]||[],id=String(row[idCol]||'').trim();if(!id)continue;
  if(auditIds.has(id))issues.push({kind:'DUPLICATE_AUDIT',row:i+1});auditIds.add(id);
  const status=String(row[statusCol]||'').trim();statuses[status]=(statuses[status]||0)+1;
  if(status==='Approved')issues.push({kind:'LEGACY_STATUS_UNMAPPED',row:i+1});
  if(status==='Accepted'&&!row[planCol])issues.push({kind:'ACCEPTED_PLAN_MISSING',row:i+1});
 }
 for(let i=1;i<availabilityRows.length;i++){
  const row=availabilityRows[i]||[];
  for(const c of [aid1,aid2]){
   const id=String(row[c]||'').trim();if(!id)continue;
   if(!auditIds.has(id))issues.push({kind:'ORPHAN_RESERVATION',row:i+1});
   reservations.set(id,(reservations.get(id)||0)+1);
  }
 }
 const counts={};for(const issue of issues)counts[issue.kind]=(counts[issue.kind]||0)+1;
 return Object.freeze({auditCount:auditIds.size,reservationReferences:[...reservations.values()].reduce((a,b)=>a+b,0),auditsWithReservations:reservations.size,statuses,issueCounts:counts,issues,ready:issues.length===0,cutoverAuthorized:false});
}
