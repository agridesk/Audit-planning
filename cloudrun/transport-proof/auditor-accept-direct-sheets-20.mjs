// DEV issue #45: direct canonical Auditor Accept, unactivated until all competing writers are retired.
// Google Sheets batchUpdate updates ONLY the five affected cells and appends the durable
// lifecycle event in the SAME spreadsheet transaction. Never write back a full audit row.
import {createHash} from 'node:crypto';
const clean=v=>String(v??'').trim();
const lower=v=>clean(v).toLowerCase();
const col=(h,n)=>h.indexOf(n);
const names=(h,a)=>a.map(n=>col(h,n)).find(x=>x>=0)??-1;
const cell=(r,i)=>i>=0?clean(r[i]):'';
const setCell=(index,v)=>({userEnteredValue:{stringValue:clean(v)}});
const norm=v=>clean(v).toUpperCase().replace(/[\\s-]+/g,'_');
const revision=(h,r)=>createHash('sha256').update([
 cell(r,names(h,['Audit ID','Audit_ID','AuditId','Audit Id'])),
 cell(r,names(h,['Status'])),cell(r,names(h,['Assigned to','Assigned auditor','Auditor'])),
 cell(r,names(h,['Planning JSON','Planning_JSON'])),cell(r,names(h,['Last decision timestamp'])),
 cell(r,names(h,['Status since']))
].join('|')).digest('hex').slice(0,24);
const fail=s=>{throw Error(s)};
export function buildDirectAuditorAcceptSheets20({actor,auditId,expectedRevision,values,sheetIds,stamp}={}){
 if(actor?.role!=='AUDITOR'||!clean(actor?.uid)||!lower(actor?.email))fail('DIRECT_ACCEPT_ACTOR_REQUIRED');
 if(!clean(auditId)||!/^[a-f0-9]{24}$/.test(clean(expectedRevision)))fail('DIRECT_ACCEPT_REVISION_REQUIRED');
 const ap=values?.audit,au=values?.auditors;
 if(!Array.isArray(ap)||ap.length<2||!Array.isArray(au)||au.length<2)fail('DIRECT_ACCEPT_READS_REQUIRED');
 if(!Number.isInteger(sheetIds?.audit)||!Number.isInteger(sheetIds?.queue))fail('DIRECT_ACCEPT_SHEET_IDS_REQUIRED');
 const h=ap[0], ah=au[0], idIndex=names(h,['Audit ID','Audit_ID','AuditId','Audit Id']), uidIndex=names(h,['Auditor_UID','Auditor UID']),statusIndex=names(h,['Status']);
 if([idIndex,uidIndex,statusIndex].some(i=>i<0))fail('DIRECT_ACCEPT_HEADERS_MISSING');
 const matches=ap.slice(1).map((r,i)=>({r,at:i+2})).filter(x=>cell(x.r,idIndex)===auditId);
 if(matches.length!==1)fail('DIRECT_ACCEPT_AUDIT_NOT_UNIQUE');
 const {r,at}=matches[0];
 const uid=clean(actor.uid),email=lower(actor.email),ui=names(ah,['Auditor_UID','Auditor UID']),ei=names(ah,['E-mail','Email']),ri=names(ah,['Role']),ai=names(ah,['Active']);
 if([ui,ei,ri,ai].some(i=>i<0))fail('DIRECT_ACCEPT_ROSTER_HEADERS_MISSING');
 const actors=au.slice(1).filter(ar=>cell(ar,ui)===uid);
 if(actors.length!==1||lower(cell(actors[0],ei))!==email||norm(cell(actors[0],ri))!=='AUDITOR'||norm(cell(actors[0],ai))!=='YES')fail('DIRECT_ACCEPT_IDENTITY_NOT_CURRENT');
 if(cell(r,uidIndex)!==uid)fail('DIRECT_ACCEPT_ASSIGNED_UID_MISMATCH');
 const assigned=lower(cell(r,names(h,['Assigned to','Assigned auditor','Auditor'])));
 const roster=actors[0],possible=[email,lower(uid),lower(cell(roster,names(ah,['Name']))),lower(cell(roster,names(ah,['Abbreviation'])))];
 if(!assigned||!possible.includes(assigned))fail('DIRECT_ACCEPT_ASSIGNMENT_MISMATCH');
 if(norm(cell(r,statusIndex))!=='APPROVED')fail('DIRECT_ACCEPT_STATUS_CONFLICT');
 if(revision(h,r)!==expectedRevision)fail('DIRECT_ACCEPT_REVISION_CONFLICT');
 if(!/^\\d{4}-\\d{2}-\\d{2}T/.test(clean(stamp)))fail('DIRECT_ACCEPT_TIMESTAMP_REQUIRED');
 const changes=[['Status','Accepted'],['Status since',stamp],['Last auditor decision','ACCEPT'],['Last auditor decision timestamp',stamp],['Auditor comment (last)','']];
 const updates=changes.map(([name,value])=>{const i=names(h,[name]);if(i<0)fail('DIRECT_ACCEPT_LIFECYCLE_HEADER_MISSING_'+name);return {updateCells:{range:{sheetId:sheetIds.audit,startRowIndex:at-1,endRowIndex:at,startColumnIndex:i,endColumnIndex:i+1},rows:[{values:[setCell(i,value)]}],fields:'userEnteredValue'}}});
 const trail={type:'LIFECYCLE_STATUS_CHANGED',auditId,action:'ACCEPT',actorRole:'AUDITOR',actorEmail:email,beforeStatus:'Approved',afterStatus:'Accepted',timestamp:stamp,source:'CLOUD_RUN_DIRECT_AUDITOR_ACCEPT'};
 const minute=stamp.slice(0,16),hash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+stamp+'|Accepted').digest('hex');
 const queue=[minute,'PENDING','LIFECYCLE_STATUS_CHANGED','',auditId,cell(r,names(h,['Company'])),'Auditor accepted – '+auditId,JSON.stringify(trail),0,'',hash,'',JSON.stringify({payload:trail})];
 updates.push({appendCells:{sheetId:sheetIds.queue,rows:[{values:queue.map(v=>setCell(0,v))}],fields:'userEnteredValue'}});
 return {requests:updates,auditId,operation:'ACCEPT',sourceRow:at,expectedRevision,previousStatus:'Approved',newStatus:'Accepted'};
}
