// Explicitly approved DEV backfill. No document values or identifiers are logged.
import {planRealizedAuditsBackfill20,createRealizedAuditsFirestoreStore20,realizedAuditorIndex20,realizedDocumentFromLogRow20} from '../../../cloudrun/transport-proof/realized-audits-firestore-20.js';
const clean=v=>String(v==null?'':v).trim();
const key=v=>clean(v).toLowerCase().replace(/\s+/g,'_');
const col=(h,names)=>{const m={};h.forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;};
const val=(r,i)=>i>=0?clean(r[i]):'';
function identityVersions(values){
 if(!values?.length)throw Error('IDENTITY_VERSIONS_MISSING');
 const h=values[0],u=col(h,['Auditor_UID','Auditor UID']),e=col(h,['Email_Normalized','Email','E-mail']),f=col(h,['Valid_From_UTC','Valid from UTC']),t=col(h,['Valid_To_UTC','Valid to UTC']),st=col(h,['State','Status']);
 if([u,e,f,t,st].some(x=>x<0))throw Error('IDENTITY_VERSIONS_SCHEMA_INVALID');
 return values.slice(1).filter(r=>val(r,u)||val(r,e)).map(r=>({uid:val(r,u),email:val(r,e),validFrom:val(r,f),validTo:val(r,t),state:val(r,st)}));
}
const out={readOnly:false,writeAuthorized:true,excludedSheetRow:344};
try{
 const sid=clean(process.env.SID),sheetsToken=clean(process.env.SHEETS_TOKEN),firestoreToken=clean(process.env.FIRESTORE_TOKEN);
 if(!sid||!sheetsToken||!firestoreToken)throw Error('CREDENTIAL_OR_SPREADSHEET_MISSING');
 const u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sid)+'/values:batchGet');
 for(const r of ['Log realized audits!A1:AZ10000','Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000'])u.searchParams.append('ranges',r);
 u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
 const sr=await fetch(u,{headers:{authorization:'Bearer '+sheetsToken}});out.sheetsStatus=sr.status;
 if(!sr.ok)throw Error('SHEETS_READ_FAILED');
 const vr=(await sr.json()).valueRanges||[], log=vr[0]?.values||[], auditors=vr[1]?.values||[];
 if(log.length<344||!log[0])throw Error('EXCLUDED_ROW_NOT_FOUND');
 const versions=identityVersions(vr[2]?.values||[]),index=realizedAuditorIndex20(auditors,versions);
 const excluded=realizedDocumentFromLogRow20(log[0],log[343],index);
 if(excluded.issue!=='AUDIT_ID_INVALID')throw Error('EXCLUDED_ROW_NO_LONGER_MATCHES_APPROVAL');
 const filtered=[log[0],...log.slice(1).filter((_,i)=>i!==342)];
 const store=createRealizedAuditsFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>firestoreToken});
 const existing=await store.listAll();out.firestoreDocumentsBefore=existing.length;
 if(existing.length!==0)throw Error('COLLECTION_NOT_EMPTY');
 const plan=planRealizedAuditsBackfill20({logValues:filtered,auditorValues:auditors,identityVersions:versions,existingIds:[]});
 if(plan.identityVersions!=='USED')throw Error('AUDITOR_UID_IDENTITY_VERSIONS_NOT_USED');
 if(!plan.ready||plan.blockingIssues!==0||plan.documents.length!==377||plan.toCreate!==377||plan.rowsRead!==377)throw Error('PLAN_SCOPE_OR_VALIDATION_CHANGED');
 if(plan.documents.some(d=>!d.auditorUid||encodeURIComponent(d.auditId)!==d.auditId))throw Error('DOCUMENT_ID_OR_UID_NOT_SAFE_FOR_CREATE');
 out.rowsRead=plan.rowsRead;out.documentsAuthorized=plan.documents.length;out.planDigest=plan.digest;out.issueCodes=plan.issues;
 const result=await store.createMany(plan.documents);out.created=result.created;
 const after=await store.listAll();out.firestoreDocumentsAfter=after.length;
 if(result.created!==377||after.length!==377)throw Error('POST_WRITE_COUNT_MISMATCH');
 out.ok=true;
}catch(e){
 out.ok=false;const m=clean(e?.message);out.error=/^[A-Z0-9_]+$/.test(m)?m:'BACKFILL_FAILED';
}
console.log(JSON.stringify(out));
if(!out.ok)process.exitCode=1;
