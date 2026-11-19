// DEV manager approval: resolve recipient from canonical auditor identity.
const norm=v=>String(v??'').trim();
const key=v=>norm(v).toLowerCase();
const index=(headers,names)=>headers.findIndex(h=>names.some(n=>key(h)===key(n)));
const emailValid=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export function resolveManagerApprovalRecipient20({assigned='',assignedUid='',auditorValues=[]}={}){
  const rows=Array.isArray(auditorValues)?auditorValues:[];
  const headers=rows[0]||[];
  const emailIndex=index(headers,['Email','E-mail','Auditor Email','Auditor email']);
  const uid=norm(assignedUid);
  if(uid){
    const uidIndex=index(headers,['Auditor_UID','Auditor UID']);
    if(uidIndex<0||emailIndex<0)throw Error('APPROVE_AUDITOR_IDENTITY_SCHEMA_MISSING');
    const matches=rows.slice(1).filter(row=>norm(row[uidIndex])===uid);
    if(matches.length!==1)throw Error('APPROVE_AUDITOR_UID_NOT_UNIQUE_OR_MISSING');
    const recipient=key(matches[0][emailIndex]);
    if(!emailValid(recipient))throw Error('APPROVE_AUDITOR_RECIPIENT_REQUIRED');
    return recipient;
  }
  const a=key(assigned);
  if(!a)throw Error('APPROVE_AUDITOR_RECIPIENT_REQUIRED');
  if(emailIndex<0)throw Error('APPROVE_AUDITOR_IDENTITY_SCHEMA_MISSING');
  const nameIndex=index(headers,['Name','Auditor','Auditor Name','Display name']);
  const matches=rows.slice(1).filter(row=>key(row[emailIndex])===a||(nameIndex>=0&&key(row[nameIndex])===a));
  if(matches.length!==1)throw Error('APPROVE_AUDITOR_IDENTITY_NOT_UNIQUE_OR_MISSING');
  const recipient=key(matches[0][emailIndex]);
  if(!emailValid(recipient))throw Error('APPROVE_AUDITOR_RECIPIENT_REQUIRED');
  return recipient;
}

export function managerApprovalBlocks20(raw){
  let plan;
  try{plan=JSON.parse(raw);}catch{return [];}
  const blocks=Array.isArray(plan)?plan:(plan?.blocks??plan?.days);
  if(!Array.isArray(blocks)||!blocks.length)return [];
  const time=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return blocks.every(b=>/^\d{4}-\d{2}-\d{2}$/.test(b?.date)&&time(b?.start)&&time(b?.end)&&b.end>b.start)?blocks:[];
}
