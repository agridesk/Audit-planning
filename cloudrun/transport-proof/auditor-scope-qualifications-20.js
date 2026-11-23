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

// Complete sources are required: an unresolved owner must not hide an open audit.
export function qualificationOpenAuditImpact20({auditors,planning,auditorUid,scopeColumns}={}){
 if(!Array.isArray(auditors)||!Array.isArray(auditors[0])||auditors.length>=1000||
    !Array.isArray(planning)||!Array.isArray(planning[0])||planning.length>=2500||
    !norm(auditorUid)||!Array.isArray(scopeColumns)||!scopeColumns.length)
  throw Error('QUALIFICATION_IMPACT_SOURCE_INCOMPLETE');
 const headerKey=x=>key(x).replace(/[^a-z0-9]/g,'');
 const column=(header,names,optional=false)=>{
  const wanted=new Set(names.map(headerKey)),matches=header.map((x,i)=>wanted.has(headerKey(x))?i:-1).filter(i=>i>=0);
  if(matches.length>1||(!optional&&matches.length!==1))throw Error('QUALIFICATION_IMPACT_SCHEMA_INVALID');
  return matches.length?matches[0]:-1;
 };
 const ah=auditors[0],ph=planning[0],uidColumn=column(ah,['Auditor_UID','Auditor UID']),
  emailColumn=column(ah,['E-mail','Email']),nameColumn=column(ah,['Name','Auditor name'],true),
  assigned=column(ph,['Assigned to','Assigned auditor','Auditor']),
  assignedUid=column(ph,['Auditor_UID','Assigned_Auditor_UID']),
  preassigned=column(ph,['Preassigned Auditor']),statusColumn=column(ph,['Status']),
  auditColumn=column(ph,['Audit ID','Audit_ID','AuditId']);
 if(scopeColumns.some(i=>!Number.isSafeInteger(i)||i<0||i>=ph.length||
    !headerKey(ph[i])||ph.filter(h=>headerKey(h)===headerKey(ph[i])).length!==1))
  throw Error('QUALIFICATION_IMPACT_SCHEMA_INVALID');
 const byUid=new Set(),aliases=new Map();
 for(const row of auditors.slice(1)){
  if(!Array.isArray(row))throw Error('QUALIFICATION_IMPACT_SOURCE_INCOMPLETE');
  if(!row.some(x=>norm(x)))continue;
  const uid=norm(row[uidColumn]),email=key(row[emailColumn]);
  if(!uid||!email||byUid.has(uid))throw Error('QUALIFICATION_IMPACT_IDENTITY_INVALID');
  byUid.add(uid);
  for(const alias of [email,nameColumn<0?'':key(row[nameColumn])].filter(Boolean)){
   const ids=aliases.get(alias)||new Set();ids.add(uid);aliases.set(alias,ids);
  }
 }
 if(!byUid.has(norm(auditorUid)))throw Error('QUALIFICATION_IMPACT_IDENTITY_INVALID');
 const resolve=value=>{
  const alias=key(value);if(!alias)return '';
  const ids=aliases.get(alias);
  if(!ids||ids.size!==1)throw Error('QUALIFICATION_IMPACT_OWNER_UNRESOLVED');
  return [...ids][0];
 };
 const ids=new Set(),impacted=[];
 for(const row of planning.slice(1)){
  if(!Array.isArray(row))throw Error('QUALIFICATION_IMPACT_SOURCE_INCOMPLETE');
  const status=norm(row[statusColumn]).toUpperCase().replace(/[\s-]+/g,'_');
  if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(status)||
     !scopeColumns.some(i=>truth(row[i])||key(row[i])==='ja'))continue;
  const auditId=norm(row[auditColumn]);
  if(!auditId||ids.has(auditId))throw Error('QUALIFICATION_IMPACT_AUDIT_ID_INVALID');
  ids.add(auditId);
  const uid=norm(row[assignedUid]),assignedValue=norm(row[assigned]);
  if(uid&&!byUid.has(uid))throw Error('QUALIFICATION_IMPACT_OWNER_UNRESOLVED');
  // An old display email is not allowed to reassign a UID-bound audit.
  const assignedAlias=assignedValue&&(!uid||aliases.has(key(assignedValue)))?resolve(assignedValue):'';
  if(uid&&assignedAlias&&uid!==assignedAlias)throw Error('QUALIFICATION_IMPACT_OWNER_CONFLICT');
  const preassignedUid=resolve(row[preassigned]);
  if((uid||assignedAlias)===norm(auditorUid)||preassignedUid===norm(auditorUid))impacted.push(auditId);
 }
 return impacted;
}
