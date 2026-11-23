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
const EXPECTED_EXISTING=377,EXPECTED_ROWS=378,EXPECTED_CREATE=1;
const out={readOnly:false,writeAuthorized:true,mode:'INCREMENTAL_CREATE_ONLY'};
try{
 const sid=clean(process.env.SID),sheetsToken=clean(process.env.SHEETS_TOKEN),firestoreToken=clean(process.env.FIRESTORE_TOKEN),expectedDigest=clean(process.env.EXPECTED_PLAN_DIGEST);
 if(!sid||!sheetsToken||!firestoreToken)throw Error('CREDENTIAL_OR_SPREADSHEET_MISSING');
 if(!/^[0-9a-f]{64}$/.test(expectedDigest))throw Error('EXPECTED_PLAN_DIGEST_MISSING');
 const u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sid)+'/values:batchGet');
 for(const r of ['Log realized audits!A1:AZ10000','Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000'])u.searchParams.append('ranges',r);
 u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
 const sr=await fetch(u,{headers:{authorization:'Bearer '+sheetsToken}});out.sheetsStatus=sr.status;
 if(!sr.ok)throw Error('SHEETS_READ_FAILED');
 const vr=(await sr.json()).valueRanges||[], log=vr[0]?.values||[], auditors=vr[1]?.values||[];
 const versions=identityVersions(vr[2]?.values||[]);
 const store=createRealizedAuditsFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>firestoreToken});
 const existing=await store.listAll();out.firestoreDocumentsBefore=existing.length;
 if(existing.length!==EXPECTED_EXISTING)throw Error('EXISTING_COUNT_CHANGED');
 const plan=planRealizedAuditsBackfill20({logValues:log,auditorValues:auditors,identityVersions:versions,existingIds:existing.map(d=>d.auditId)});
 if(plan.identityVersions!=='USED')throw Error('AUDITOR_UID_IDENTITY_VERSIONS_NOT_USED');
 if(!plan.ready||plan.blockingIssues!==0||plan.rowsRead!==EXPECTED_ROWS||plan.alreadyPresent!==EXPECTED_EXISTING||plan.toCreate!==EXPECTED_CREATE||plan.documents.length!==EXPECTED_CREATE)throw Error('PLAN_SCOPE_OR_VALIDATION_CHANGED');
 if(plan.digest!==expectedDigest)throw Error('PLAN_DIGEST_MISMATCH');
 if(plan.documents.some(d=>!d.auditorUid))throw Error('DOCUMENT_UID_MISSING');
 out.rowsRead=plan.rowsRead;out.documentsAuthorized=plan.documents.length;out.planDigest=plan.digest;out.issueCodes=plan.issues;
 const result=await store.createMany(plan.documents);out.created=result.created;
 const after=await store.listAll();out.firestoreDocumentsAfter=after.length;
 if(result.created!==EXPECTED_CREATE||after.length!==EXPECTED_EXISTING+EXPECTED_CREATE)throw Error('POST_WRITE_COUNT_MISMATCH');
 out.ok=true;}catch(e){
 out.ok=false;const m=clean(e?.message);out.error=/^[A-Z0-9_]+$/.test(m)?m:'BACKFILL_FAILED';
}
console.log(JSON.stringify(out));
if(!out.ok)process.exitCode=1;
