// Controlled DEV migration executor. Not connected to any API route.
// An injected exclusive lock and explicit enabled gate are mandatory.
// The caller must provide fresh canonical sheet reads, append and post-write reads.
import {planAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-plan-20.js';
const norm=x=>String(x??'').trim();
const key=x=>norm(x).toLowerCase();
export async function applyAuditorQualificationMigration20({
 enabled=false,confirmation,withExclusiveLock,readSnapshot,appendRows
}={}){
 if(enabled!==true||confirmation!=='MIGRATE_DEV_AUDITOR_QUALIFICATIONS')throw Error('QUALIFICATION_MIGRATION_WRITE_DISABLED');
 if(typeof withExclusiveLock!=='function'||typeof readSnapshot!=='function'||typeof appendRows!=='function')throw Error('QUALIFICATION_MIGRATION_LOCK_OR_IO_REQUIRED');
 return await withExclusiveLock(async()=>{
  const before=await readSnapshot();
  const plan=planAuditorQualificationMigration20(before);
  if(!plan.ok)throw Error('QUALIFICATION_MIGRATION_PRECHECK_'+(plan.error||'FAILED'));
  if(!plan.appendCount){
   const checked=await readSnapshot();
   const current=planAuditorQualificationMigration20(checked);
   if(!current.ok||current.appendCount!==0||JSON.stringify(checked)!==JSON.stringify(before))throw Error('QUALIFICATION_MIGRATION_STALE_PLAN');
   return {ok:true,written:0,verified:true,unchanged:true};
  }
  const expected=plan.rowsToAppend.map(r=>r.Auditor_UID+'|'+key(r.ScopeCode));
  if(new Set(expected).size!==expected.length)throw Error('QUALIFICATION_MIGRATION_DUPLICATE_PLAN');
  // Re-read while lock is held. Changes since the first read block the write.
  const second=await readSnapshot();
  const again=planAuditorQualificationMigration20(second);
  if(!again.ok||JSON.stringify(again.rowsToAppend)!==JSON.stringify(plan.rowsToAppend)||JSON.stringify(second)!==JSON.stringify(before))throw Error('QUALIFICATION_MIGRATION_STALE_PLAN');
  await appendRows(plan.rowsToAppend);
  const after=await readSnapshot();
  const verification=planAuditorQualificationMigration20(after);
  const beforeRelations=second.relations||[],afterRelations=after.relations||[];
  const expectedAdded=plan.rowsToAppend.map(r=>[r.Auditor_UID,key(r.ScopeCode),r.Qualified]);
  const h=afterRelations[0]||[],column=name=>h.findIndex(v=>key(v)===key(name));
  const ui=column('Auditor_UID'),si=column('ScopeCode'),qi=column('Qualified');
  if(ui<0||si<0||qi<0)throw Error('QUALIFICATION_MIGRATION_UNCONFIRMED_RECONCILE');
  const actualAdded=afterRelations.slice(beforeRelations.length).map(r=>[r[ui],key(r[si]),r[qi]]);
  if(!verification.ok||verification.appendCount!==0||!verification.parity?.ok||JSON.stringify(after.auditors)!==JSON.stringify(second.auditors)||JSON.stringify(after.catalog)!==JSON.stringify(second.catalog)||JSON.stringify(afterRelations.slice(0,beforeRelations.length))!==JSON.stringify(beforeRelations)||JSON.stringify(actualAdded)!==JSON.stringify(expectedAdded))throw Error('QUALIFICATION_MIGRATION_UNCONFIRMED_RECONCILE');
  return {ok:true,written:plan.appendCount,verified:true,unchanged:false};
 });
}
