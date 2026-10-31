// Pure, fail-closed canonical auditor identity adapter for read-only actor authorization.
// Use only after a trusted session has established actorEmail. No data I/O.
const str=x=>String(x??'').trim(), key=x=>str(x).toLowerCase();
const idx=(headers,names)=>headers.findIndex(h=>names.some(n=>key(h)===key(n)));
export function currentAuditorUid20(auditorValues,email,{required=false}={}){
 if(!required)return '';
 if(!Array.isArray(auditorValues)||!auditorValues.length||!Array.isArray(auditorValues[0]))throw Error('ACTOR_UID_SOURCE_NOT_READY');
 const h=auditorValues[0];
 if(h.some((v,i)=>!key(v)||h.findIndex(x=>key(x)===key(v))!==i))throw Error('ACTOR_UID_SCHEMA_AMBIGUOUS');
 const e=idx(h,['E-mail','Email']),u=idx(h,['Auditor_UID','Auditor UID']),active=idx(h,['Active']),role=idx(h,['Role']);
 if([e,u,active,role].some(i=>i<0))throw Error('ACTOR_UID_SCHEMA_INCOMPLETE');
 const matches=auditorValues.slice(1).filter(row=>key(row[e])===key(email));
 if(matches.length!==1||!str(matches[0][u]))throw Error('ACTOR_UID_AMBIGUOUS_OR_MISSING');
 const actor=matches[0];
 if(!['yes','true','1','x'].includes(key(actor[active])))throw Error('ACTOR_UID_INACTIVE');
 if(key(actor[role])!=='auditor')throw Error('ACTOR_UID_ROLE_INVALID');
 const uid=str(actor[u]);
 if(auditorValues.slice(1).some(row=>row!==actor&&str(row[u])===uid))throw Error('ACTOR_UID_DUPLICATE');
 if(auditorValues.slice(1).some(row=>row!==actor&&key(row[e])===key(email)))throw Error('ACTOR_EMAIL_DUPLICATE');
 return uid;
}
export function assignedUid20(auditHeader,auditRow,{required=false,assignedEmail=''}={}){
 if(!required)return '';
 if(!Array.isArray(auditHeader)||!Array.isArray(auditRow))throw Error('ASSIGNMENT_UID_SOURCE_MISSING');
 const u=idx(auditHeader,['Auditor_UID','Assigned_Auditor_UID']);
 if(u<0)throw Error('ASSIGNMENT_UID_SCHEMA_MISSING');
 const uid=str(auditRow[u]);
 if(str(assignedEmail)&&!uid)throw Error('ASSIGNMENT_UID_MISSING');
 return uid;
}
