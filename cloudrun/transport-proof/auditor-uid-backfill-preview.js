export function previewAuditorUidBackfill(rows){
 const emails=new Set(),uids=new Set(),pending=[];
 for(const row of rows){
  const email=String(row.email||'').trim().toLowerCase(),uid=String(row.uid||'').trim();
  if(!email)throw Error('BACKFILL_EMAIL_MISSING');
  if(emails.has(email))throw Error('BACKFILL_DUPLICATE_EMAIL');
  emails.add(email);
  if(uid){if(uids.has(uid))throw Error('BACKFILL_DUPLICATE_UID');uids.add(uid)}
  else pending.push({email});
 }
 return {total:rows.length,existing:rows.length-pending.length,pending};
}
