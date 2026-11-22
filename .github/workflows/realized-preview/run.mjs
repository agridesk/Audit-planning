// Read-only realized-audits backfill preview. Prints counts, issue codes and a digest only.
import {planRealizedAuditsBackfill20,createRealizedAuditsFirestoreStore20} from '../../../cloudrun/transport-proof/realized-audits-firestore-20.js';

const clean=v=>String(v==null?'':v).trim();
const key=v=>clean(v).toLowerCase().replace(/\s+/g,'_');
const col=(h,names)=>{const m={};h.forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;};
const val=(r,i)=>i>=0?clean(r[i]):'';
const code=e=>clean(e?.message).replace(/[^A-Z0-9_]/g,'').slice(0,60);
function identityVersions(values){
  if(!values?.length)throw Error('ROTATION_IDENTITY_VERSIONS_MISSING');
  const h=values[0],u=col(h,['Auditor_UID','Auditor UID']),e=col(h,['Email_Normalized','Email','E-mail']),f=col(h,['Valid_From_UTC','Valid from UTC']),t=col(h,['Valid_To_UTC','Valid to UTC']),st=col(h,['State','Status']);
  if([u,e,f,t,st].some(x=>x<0))throw Error('ROTATION_IDENTITY_VERSIONS_SCHEMA_INVALID');
  return values.slice(1).filter(r=>val(r,u)||val(r,e)).map(r=>({uid:val(r,u),email:val(r,e),validFrom:val(r,f),validTo:val(r,t),state:val(r,st)}));
}
const sheetsToken=clean(process.env.SHEETS_TOKEN),firestoreToken=clean(process.env.FIRESTORE_TOKEN),sid=clean(process.env.SID);
const out={readOnly:true,writeAuthorized:false};
try{
  if(!sid)throw Error('SPREADSHEET_ID_MISSING');
  const u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sid)+'/values:batchGet');
  for(const r of ['Log realized audits!A1:AZ10000','Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000'])u.searchParams.append('ranges',r);
  u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  const sr=await fetch(u,{headers:{authorization:'Bearer '+sheetsToken}});
  out.sheetsStatus=sr.status;
  if(!sr.ok)throw Error('SHEETS_READ_'+sr.status);
  const vr=(await sr.json()).valueRanges||[];
  const store=createRealizedAuditsFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>firestoreToken});
  let existing;
  try{existing=await store.listAll();out.firestoreStatus='OK';}catch(e){out.firestoreStatus=code(e);throw Error('FIRESTORE_LIST_FAILED');}
  let versions=null;try{versions=identityVersions(vr[2]?.values||[]);}catch{}
  const plan=planRealizedAuditsBackfill20({logValues:vr[0]?.values||[],auditorValues:vr[1]?.values||[],identityVersions:versions,existingIds:existing.map(d=>d.auditId)});
  Object.assign(out,{ok:true,collection:store.collection,rowsRead:plan.rowsRead,toCreate:plan.toCreate,alreadyPresent:plan.alreadyPresent,firestoreDocuments:existing.length,issues:plan.issues,blockingIssues:plan.blockingIssues,identityVersions:plan.identityVersions,ready:plan.ready,planDigest:plan.digest});
}catch(e){
  out.ok=false;out.error=code(e)||'PREVIEW_FAILED';
}
console.log(JSON.stringify(out,null,1));
if(!out.ok)process.exitCode=1;
