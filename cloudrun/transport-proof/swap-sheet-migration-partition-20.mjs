/**
 * Read-only DEV migration partition. Unresolved records remain in Sheets.
 * This module neither writes data nor authorizes Firestore cutover.
 */
const val=x=>String(x??'').trim();
const field=(h,n)=>{const i=h.indexOf(n);if(i<0)throw Error('SWAP_PARTITION_HEADER_'+n.replace(/[^A-Za-z0-9]/g,'_'));return i;};
export function partitionSwapSheetMigration({auditRows,availabilityRows}={}){
 if(!Array.isArray(auditRows)||auditRows.length<2||!Array.isArray(availabilityRows)||!availabilityRows.length)throw Error('SWAP_PARTITION_INPUT_INVALID');
 const ah=auditRows[0],vh=availabilityRows[0],ai=field(ah,'Audit ID'),st=field(ah,'Status'),pj=field(ah,'Planning JSON'),owner=field(ah,'Assigned to');
 const date=field(vh,'Date'),email=field(vh,'Auditor_Email'),id1=field(vh,'Audit_ID_1'),id2=field(vh,'Audit_ID_2'),s1=field(vh,'First_Audit_Start_Time'),e1=field(vh,'First_Audit_End_Time'),s2=field(vh,'Second_Audit_Start_Time'),e2=field(vh,'Second_Audit_End_Time');
 const records=new Map(),quarantine=[],references=new Map(),unknown=[];
 for(let i=1;i<auditRows.length;i++){
  const row=auditRows[i]||[],id=val(row[ai]);if(!id)continue;
  if(records.has(id)){quarantine.push({kind:'DUPLICATE_AUDIT_ID',row:i+1});records.get(id).blocked=true;continue;}
  const status=val(row[st]),assignedTo=val(row[owner]).toLowerCase();
  let blocks=null,reason=null;
  if(status==='Approved')reason='LEGACY_STATUS_UNRESOLVED';
  if(status!=='Accepted'&&status!=='Approved')reason='NOT_ACCEPTED';
  if(!val(row[pj]))reason=reason||'PLANNING_MISSING';
  else try{
   const parsed=JSON.parse(val(row[pj]));
   if(!Array.isArray(parsed.blocks)||!parsed.blocks.length)reason=reason||'PLANNING_BLOCKS_MISSING';
   else blocks=parsed.blocks.map(b=>({date:val(b.date),start:val(b.start),end:val(b.end)}));
  }catch{reason=reason||'PLANNING_INVALID';}
  if(status==='Accepted'&&!assignedTo.includes('@'))reason=reason||'AUDITOR_UNRESOLVED';
  records.set(id,{row:i+1,status,assignedTo,blocks,reason,blocked:false});
 }
 for(let i=1;i<availabilityRows.length;i++){
  const row=availabilityRows[i]||[];
  for(const [idCol,startCol,endCol] of [[id1,s1,e1],[id2,s2,e2]]){
   const id=val(row[idCol]);if(!id)continue;
   if(!records.has(id)){unknown.push({kind:'ORPHAN_RESERVATION',row:i+1});continue;}
   const r={date:val(row[date]),owner:val(row[email]).toLowerCase(),start:val(row[startCol]),end:val(row[endCol])};
   if(!references.has(id))references.set(id,[]);
   references.get(id).push(r);
  }
 }
 const eligible=[],quarantined=[];
 for(const [id,r] of records){
  let reason=r.reason;
  if(r.blocked)reason='DUPLICATE_AUDIT_ID';
  const slots=references.get(id)||[];
  if(!reason&&slots.length!==r.blocks.length)reason='RESERVATION_COUNT_MISMATCH';
  if(!reason&&slots.some(s=>!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.start>=s.end||s.owner!==r.assignedTo))reason='RESERVATION_INVALID';
  if(!reason&&new Set(slots.map(s=>[s.date,s.start,s.end,s.owner].join('|'))).size!==slots.length)reason='DUPLICATE_RESERVATION';
  if(!reason){
   const a=r.blocks.map(b=>[b.date,b.start,b.end].join('|')).sort();
   const b=slots.map(s=>[s.date,s.start,s.end].join('|')).sort();
   if(JSON.stringify(a)!==JSON.stringify(b))reason='RESERVATION_PLAN_MISMATCH';
  }
  if(reason)quarantined.push({auditId:id,row:r.row,reason});
  else eligible.push({auditId:id,status:r.status,assignedTo:r.assignedTo,plannedBlocks:r.blocks,reservations:slots});
 }
 return Object.freeze({eligible,quarantined,orphanReservations:unknown,counts:{source:records.size,eligible:eligible.length,quarantined:quarantined.length,orphans:unknown.length},writeAuthorized:false,cutoverAuthorized:false});
}
