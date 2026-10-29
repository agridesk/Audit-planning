/** DEV canonical Audit planning -> Firestore backfill.
 * Pure preparation validates *every* row and overlapping auditor slot before
 * a single write is permitted. Execute is restartable; each seed is idempotent.
 * Historical Completed/Rejected visits do not reserve live capacity.
 */
import {createHash} from 'node:crypto';
const trim=x=>String(x??'').trim();
const cleanStatus=x=>trim(x).toUpperCase().replace(/[\s-]+/g,'_');
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalize=x=>trim(x).toLowerCase().replace(/[^a-z0-9]+/g,'');
const dateTime=x=>{if(!/^\d{2}:\d{2}$/.test(x))throw Error('BACKFILL_TIME_INVALID');const [h,m]=x.split(':').map(Number);if(h>23||m>59||m%15)throw Error('BACKFILL_TIME_INVALID');return h*60+m;};
const activeStatuses=new Set(['PENDING_APPROVAL','APPROVED','ACCEPTED']);
export function preparePlanningBackfill({rows,roster,asOfDate=new Date().toISOString().slice(0,10)}){
 if(!Array.isArray(rows)||rows.length<1||rows.length>=2000||!Array.isArray(roster))throw Error('BACKFILL_SOURCE_INVALID');
 const headers=rows[0].map(trim),keys=headers.map(normalize);
 const ix=(...names)=>names.map(n=>keys.indexOf(normalize(n))).find(i=>i>=0)??-1;
 const idCol=ix('Audit ID'),statusCol=ix('Status'),assignedCol=ix('Assigned to'),jsonCol=ix('Planning JSON'),decisionCol=ix('Last decision timestamp'),sinceCol=ix('Status since');
 if([idCol,statusCol,assignedCol,jsonCol,decisionCol,sinceCol].some(i=>i<0))throw Error('BACKFILL_CANONICAL_HEADERS_MISSING');
 const byEmail=new Map(roster.filter(x=>x.role==='auditor'&&x.active!==false).map(x=>[trim(x.email).toLowerCase(),trim(x.auditorId)]));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate))throw Error('BACKFILL_AS_OF_DATE_INVALID');
 const plannedCol=ix('Date - Planned');
 if(plannedCol<0)throw Error('BACKFILL_PLANNED_DATE_HEADER_MISSING');
 const seenAudits=new Set(),seenClaims=new Map(),items=[];
 for(let i=1;i<rows.length;i++){
  const row=rows[i],auditId=trim(row[idCol]);if(!auditId)continue;
  if(seenAudits.has(auditId))throw Error('BACKFILL_AUDIT_ID_DUPLICATE');seenAudits.add(auditId);
  const status=cleanStatus(row[statusCol]),email=trim(row[assignedCol]).toLowerCase(),planned=trim(row[jsonCol]);
  const sourceRevision=hash([auditId,trim(row[statusCol]),trim(row[assignedCol]),planned,trim(row[decisionCol]),trim(row[sinceCol])].join('|')).slice(0,24);
  let blocks=[],legacyUnverified=false;
  // An unassigned Pending Approval is still a proposal, not a committed
  // auditor reservation. Preserve its row snapshot without claiming slots.
  const committedAssignment=activeStatuses.has(status)&&!(status==='PENDING_APPROVAL'&&!email);
  if(committedAssignment){
   if(!email||!byEmail.has(email))throw Error('BACKFILL_ACTIVE_AUDITOR_UID_UNRESOLVED');
   // Historical Accepted records without JSON cannot safely claim slots.
   // Backfill their original row, explicitly flag it non-editable, never infer
   // hours or availability from an old Date - Planned string.
   if(!planned&&status==='ACCEPTED'&&trim(row[plannedCol])<asOfDate&&/^\d{4}-\d{2}-\d{2}$/.test(trim(row[plannedCol])))legacyUnverified=true;
   else if(!planned)throw Error('BACKFILL_ACTIVE_PLANNING_MISSING');
   let parsed;try{parsed=legacyUnverified?{blocks:[]}:JSON.parse(planned);}catch{throw Error('BACKFILL_PLANNING_JSON_INVALID');}
   const raw=Array.isArray(parsed)?parsed:parsed?.blocks;
   if(!Array.isArray(raw)||!raw.length&&!legacyUnverified)throw Error('BACKFILL_ACTIVE_BLOCKS_MISSING');
   blocks=raw.map(b=>({date:trim(b.date),start:trim(b.start),end:trim(b.end)})).filter(b=>b.date>=asOfDate);
   if(blocks.length>50)throw Error('BACKFILL_TOO_MANY_BLOCKS');
   const auditorId=byEmail.get(email);
   for(const b of blocks){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date))throw Error('BACKFILL_DATE_INVALID');
    const start=dateTime(b.start),end=dateTime(b.end);if(end<=start)throw Error('BACKFILL_INTERVAL_INVALID');
    for(let minute=start;minute<end;minute+=15){
     const key=auditorId+'|'+b.date+'|'+minute,owner=seenClaims.get(key);
     if(owner&&owner!==auditId)throw Error('BACKFILL_EXISTING_AUDITOR_COLLISION');
     if(owner===auditId)throw Error('BACKFILL_DUPLICATE_BLOCK');
     seenClaims.set(key,auditId);
    }
   }
  }
  const snapshot={auditId,sourceRow:i+1,headers,row:row.slice(),status:trim(row[statusCol]),assignedTo:email,sourceRevision,...(legacyUnverified?{legacyUnverified:true}:{})};
  items.push({auditId,snapshot,auditorId:committedAssignment&&!legacyUnverified?byEmail.get(email):null,blocks});
 }
 return {items,stats:{audits:items.length,active:items.filter(x=>x.blocks.length).length,legacyUnverified:items.filter(x=>x.snapshot.legacyUnverified).length,claimedSlots:seenClaims.size}};
}
export function createPlanningBackfillRunner({atomicStore,readPlanningRows,getRoster}={}){
 if(typeof atomicStore?.seed!=='function'||typeof readPlanningRows!=='function'||typeof getRoster!=='function')throw Error('BACKFILL_RUNNER_CONFIG_INVALID');
 async function run({dryRun=true,startRow=2,limit=100,sourceManifest=null}={}){
  if(!Number.isSafeInteger(startRow)||startRow<2||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('BACKFILL_BATCH_INVALID');
  const asOfDate=new Date().toISOString().slice(0,10);
  const prepared=preparePlanningBackfill({rows:await readPlanningRows(),roster:await getRoster(),asOfDate});
  // One manifest covers every source audit and every canonical row, not only
  // the current batch. Cross-batch drift cannot be mistaken for clean backfill.
  const manifest=hash(JSON.stringify([asOfDate,prepared.items.map(x=>[x.auditId,x.snapshot.sourceRow,x.snapshot.headers,x.snapshot.row,x.auditorId,x.blocks])]));
  const targets=prepared.items.filter(x=>x.snapshot.sourceRow>=startRow).slice(0,limit);
  if(dryRun)return {dryRun:true,sourceManifest:manifest,...prepared.stats,batch:targets.length,nextRow:targets.at(-1)?.snapshot.sourceRow+1||null};
  if(!/^[0-9a-f]{64}$/.test(sourceManifest||'')||sourceManifest!==manifest)throw Error('BACKFILL_SOURCE_MANIFEST_CHANGED');
  let seeded=0,replayed=0;for(const item of targets){
   const result=await atomicStore.seed(item);
   if(result.seeded)seeded++;else replayed++;
  }
  // A long backfill can race an external edit even after the intended freeze.
  // Re-read the complete canonical source and roster. On drift, fail closed:
  // any partial seed must be repaired/reconciled, never certified by the caller.
  const verified=preparePlanningBackfill({rows:await readPlanningRows(),roster:await getRoster(),asOfDate});
  const after=hash(JSON.stringify([asOfDate,verified.items.map(x=>[x.auditId,x.snapshot.sourceRow,x.snapshot.headers,x.snapshot.row,x.auditorId,x.blocks])]));
  if(after!==manifest)throw Error('BACKFILL_SOURCE_DRIFT_DURING_WRITE');
  return {dryRun:false,sourceManifest:manifest,...prepared.stats,batch:targets.length,seeded,replayed,nextRow:targets.at(-1)?.snapshot.sourceRow+1||null};
 }
 return Object.freeze({run});
}
