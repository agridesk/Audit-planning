// Auditor identity resolution. Pure/read-only; never grants login authorization.
const norm = value => String(value ?? '').trim().toLowerCase();
const iso = value => {
  const s=String(value ?? '').trim();
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('IDENTITY_INVALID_UTC_INSTANT');
  return new Date(s).toISOString();
};
export function buildAuditorIdentityIndex(auditors,versions=[]){
  const byUid=new Map(),byEmail=new Map(),activeByUid=new Map();
  for(const a of auditors){
    const uid=String(a.uid??'').trim(),email=norm(a.email);
    if(!uid||!email)throw Error('IDENTITY_MISSING_UID_OR_EMAIL');
    if(byUid.has(uid))throw Error('IDENTITY_DUPLICATE_UID');
    byUid.set(uid,{...a,uid,email});
  }
  for(const v of versions){
    const uid=String(v.uid??'').trim(),email=norm(v.email),state=String(v.state??'').trim().toUpperCase();
    if(!byUid.has(uid)||!email)throw Error('IDENTITY_ORPHAN_VERSION');
    if(!['ACTIVE','EXPIRED','PENDING','CANCELLED'].includes(state))throw Error('IDENTITY_INVALID_STATE');
    const from=iso(v.validFrom),to=v.validTo?iso(v.validTo):null;
    if(to&&to<=from)throw Error('IDENTITY_INVALID_INTERVAL');
    if(state==='ACTIVE'&&to)throw Error('IDENTITY_ACTIVE_VERSION_CLOSED');
    if(state==='EXPIRED'&&!to)throw Error('IDENTITY_EXPIRED_VERSION_OPEN');
    if(state==='ACTIVE'){if(activeByUid.has(uid))throw Error('IDENTITY_MULTIPLE_ACTIVE_VERSIONS');activeByUid.set(uid,email)}
    if(state==='CANCELLED'||state==='PENDING')continue;
    const prev=byEmail.get(email);
    if(prev&&prev.uid!==uid)throw Error('IDENTITY_ALIAS_REUSED_BY_ANOTHER_AUDITOR');
    if(!prev)byEmail.set(email,{uid,intervals:[]});
    byEmail.get(email).intervals.push({from,to});
  }
  for(const [email,record] of byEmail){
    const sorted=record.intervals.sort((a,b)=>a.from.localeCompare(b.from));
    for(let i=1;i<sorted.length;i++)if(!sorted[i-1].to||sorted[i].from<sorted[i-1].to)throw Error('IDENTITY_OVERLAPPING_ALIAS_INTERVALS');
  }
  for(const [uid,a] of byUid)if(activeByUid.get(uid)!==a.email)throw Error('IDENTITY_CURRENT_EMAIL_PROJECTION_MISMATCH');
  return {byUid,byEmail};
}
export function resolveAuditorUid(index,email,at=null){
  const record=index.byEmail.get(norm(email));
  if(!record)return null;
  if(at!==null){const time=iso(at);if(!record.intervals.some(x=>x.from<=time&&(!x.to||time<x.to)))return null}
  return record.uid;
}
export function activeAuditorEmail(index,uid,at){
  const a=index.byUid.get(String(uid??'').trim());if(!a)return null;
  return resolveAuditorUid(index,a.email,at)===a.uid?a.email:null;
}
