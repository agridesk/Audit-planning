// Canonical auditor × scope qualification resolver (DEV migration foundation).
// Rows are supplied by the caller; no network or mutation. Missing, conflicting
// or malformed identities fail closed. A scope version is not a new identity.
const norm=x=>String(x??'').trim();
const key=x=>norm(x).toLowerCase();
const truth=x=>['x','yes','true','1'].includes(key(x));
const idx=(h,name)=>h.findIndex(x=>key(x)===key(name));
export function resolveAuditorScopeQualifications20({auditors,catalog,relations,auditorUid,auditorEmail}={}){
 if(!Array.isArray(auditors)||!auditors.length||!Array.isArray(catalog)||!catalog.length||!Array.isArray(relations)||!relations.length)throw Error('QUALIFICATION_SCHEMA_UNAVAILABLE');
 const ah=auditors[0],ch=catalog[0],rh=relations[0];
 const ae=idx(ah,'E-mail'),au=idx(ah,'Auditor_UID'),cs=idx(ch,'ScopeCode'),ct=idx(ch,'SlotKey');
 const ru=idx(rh,'Auditor_UID'),rs=idx(rh,'ScopeCode'),rq=idx(rh,'Qualified');
 if(ae<0||au<0||cs<0||ct<0||ru<0||rs<0||rq<0)throw Error('QUALIFICATION_SCHEMA_INCOMPLETE');
 const matches=auditors.slice(1).filter(r=>(norm(auditorUid)&&norm(r[au])===norm(auditorUid))||(key(auditorEmail)&&key(r[ae])===key(auditorEmail)));
 if(matches.length!==1||!norm(matches[0][au]))throw Error('AUDITOR_IDENTITY_AMBIGUOUS');
 const uid=norm(matches[0][au]);
 if(norm(auditorUid)&&uid!==norm(auditorUid))throw Error('AUDITOR_IDENTITY_MISMATCH');
 if(key(auditorEmail)&&key(matches[0][ae])!==key(auditorEmail))throw Error('AUDITOR_IDENTITY_MISMATCH');
 const scopeCodes=new Map(), slots=new Set();
 for(const r of catalog.slice(1)){
  const code=key(r[cs]),slot=key(r[ct]);
  if(!code||!/^scope_(?:0[1-9]|1[0-9]|20)$/.test(slot)||scopeCodes.has(code)||slots.has(slot))throw Error('SCOPE_CATALOG_AMBIGUOUS');
  scopeCodes.set(code,norm(r[cs]));slots.add(slot);
 }
 if(scopeCodes.size>20)throw Error('SCOPE_CAPACITY_20_EXCEEDED');
 const knownUids=new Set(),knownEmails=new Set();
 for(const row of auditors.slice(1)){
  if(row.every(x=>!norm(x)))continue;
  const recordUid=norm(row[au]);
  const recordEmail=key(row[ae]);
  if(!recordUid||!recordEmail||knownUids.has(recordUid)||knownEmails.has(recordEmail))throw Error('AUDITOR_IDENTITY_AMBIGUOUS');
  knownUids.add(recordUid);knownEmails.add(recordEmail);
 }
 const qualified=new Set(),seen=new Set();
 for(const r of relations.slice(1)){
  if(r.every(x=>!norm(x)))continue;
  const id=norm(r[ru]),code=key(r[rs]);
  if(!id||!knownUids.has(id)||!scopeCodes.has(code))throw Error('QUALIFICATION_ORPHAN_RELATION');
  const pair=id+'|'+code;
  if(seen.has(pair))throw Error('QUALIFICATION_DUPLICATE_RELATION');
  seen.add(pair);
  const value=key(r[rq]);
  if(!['yes','no','true','false','1','0','x',''].includes(value))throw Error('QUALIFICATION_INVALID_STATE');
  if(id===uid&&truth(value))qualified.add(scopeCodes.get(code));
 }
 return {auditorUid:uid,qualifiedScopeCodes:[...qualified],qualificationCount:qualified.size,source:'Auditor_Scope_Qualifications'};
}
