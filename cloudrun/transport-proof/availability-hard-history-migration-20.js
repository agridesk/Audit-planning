/** Controlled DEV-only legacy manual HARD migration. No legacy sheet writes. */
import {createHash} from 'node:crypto';
const expectedRows=[14,16,34,54,72,75,99,109,111,118,119,120,147,149,150,196,197];
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const stableId=c=>'legacy-hard-'+createHash('sha256').update([c.auditorId,c.date,c.start,c.end,c.sourceRow].join('|')).digest('hex').slice(0,24);
export async function migrateLegacyHardHistory({plan,adapter,now=new Date().toISOString(),dryRun=true}={}){
 if(!plan?.readOnly||plan.writeApplied!==false||plan.sourceRows!==969||plan.counts?.manualHard!==17||plan.quarantined?.length||!Array.isArray(plan.candidates)||plan.candidates.length!==17)throw Error('MIGRATION_SOURCE_CHANGED');
 if(plan.candidates.some((c,i)=>c.sourceRow!==expectedRows[i]||c.targetState!=='HARD'||!c.auditorId||!dateValid(c.date)||c.date>='2026-10-15'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.end)||c.start>=c.end))throw Error('MIGRATION_CANDIDATE_MISMATCH');
 const ids=new Set(plan.candidates.map(c=>c.auditorId));if(ids.size!==1)throw Error('MIGRATION_MULTIPLE_AUDITORS');
 const auditorId=[...ids][0],doc=await adapter.read(auditorId);
 if(doc&&(!Array.isArray(doc.baselineExceptions)||!Number.isSafeInteger(doc.version)||!Array.isArray(doc.metadata?.changes)))throw Error('MIGRATION_TARGET_SCHEMA_INVALID');
 const exceptions=plan.candidates.map(c=>({id:stableId(c),fromDate:c.date,toDate:c.date,wholeDay:false,start:c.start,end:c.end}));
 const present=new Set((doc?.baselineExceptions||[]).map(x=>x.id)),existing=exceptions.filter(x=>present.has(x.id)),pending=exceptions.filter(x=>!present.has(x.id));
 for(const e of existing){const saved=doc.baselineExceptions.find(x=>x.id===e.id);if(JSON.stringify(saved)!==JSON.stringify(e))throw Error('MIGRATION_EXISTING_RECORD_CONFLICT');}
 const summary={success:true,dryRun,auditorId,total:17,alreadyMigrated:existing.length,toCreate:pending.length,sourceRows:expectedRows,version:doc?.version??0};
 if(dryRun||!pending.length)return summary;
 if(!doc)throw Error('MIGRATION_TARGET_NOT_INITIALIZED');
 const next=structuredClone(doc);next.version++;next.baselineExceptions.push(...pending);
 next.metadata.changes.push({at:now,actorId:'system:legacy-hard-migration',actorRole:'manager',targetAuditorId:auditorId,action:'MIGRATE_LEGACY_HARD_HISTORY',count:pending.length,source:'Auditor Availability',sourceRows:expectedRows,substantive:true});
 next.metadata.lastAvailabilityChangeAt=now;next.metadata.lastAvailabilityChangeBy='system:legacy-hard-migration';
 if(await adapter.compareAndSwap(auditorId,doc.version,next)!==true)throw Error('VERSION_CONFLICT');
 return {...summary,dryRun:false,toCreate:0,created:pending.length,version:next.version};
}
