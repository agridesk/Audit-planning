// DEV-only Sheets adapter for the guarded qualification migration executor.
// This module is inert until invoked with injected IO and a distributed lock.
import {applyAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-apply-20.js';
const DEV_SID='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const clean=v=>String(v??'').trim();
const key=v=>clean(v).toLowerCase();
export async function migrateAuditorQualificationsSheets20({
 runtimeEnv,spreadsheetId,verifiedProject,enabled=false,confirmation,
 withExclusiveLock,batchGet,append
}={}){
 if(runtimeEnv!=='DEV'||spreadsheetId!==DEV_SID||verifiedProject!=='audit-management-system-dev')throw Error('QUALIFICATION_MIGRATION_DEV_BOUNDARY_REQUIRED');
 if(typeof batchGet!=='function'||typeof append!=='function')throw Error('QUALIFICATION_MIGRATION_SHEETS_IO_MISSING');
 const readSnapshot=async()=>{
  const ranges=['Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Auditor_Scope_Qualifications!A1:Z5000'];
  const data=await batchGet(ranges,true);
  if(!Array.isArray(data)||data.length!==3)throw Error('QUALIFICATION_MIGRATION_SNAPSHOT_INCOMPLETE');
  return {auditors:data[0]?.values||[],catalog:data[1]?.values||[],relations:data[2]?.values||[]};
 };
 const appendRows=async(rows,verifiedSnapshot)=>{
  const snapshot=await readSnapshot();
  if(JSON.stringify(snapshot)!==JSON.stringify(verifiedSnapshot))throw Error('QUALIFICATION_MIGRATION_STALE_BEFORE_APPEND');
  const h=snapshot.relations[0]||[];
  if(!Array.isArray(h)||h.length<3)throw Error('QUALIFICATION_MIGRATION_RELATION_HEADERS_MISSING');
  const find=n=>h.findIndex(v=>key(v)===key(n));
  const u=find('Auditor_UID'),s=find('ScopeCode'),q=find('Qualified');
  if(u<0||s<0||q<0||new Set([u,s,q]).size!==3)throw Error('QUALIFICATION_MIGRATION_RELATION_HEADERS_INVALID');
  if(h.some((v,i)=>clean(v)&&![u,s,q].includes(i)))throw Error('QUALIFICATION_MIGRATION_EXTRA_COLUMNS_UNSUPPORTED');
  if(new Set(h.map(key).filter(Boolean)).size!==h.map(key).filter(Boolean).length)throw Error('QUALIFICATION_MIGRATION_DUPLICATE_HEADERS');
  const values=rows.map(r=>{const cells=Array(h.length).fill('');cells[u]=r.Auditor_UID;cells[s]=r.ScopeCode;cells[q]=r.Qualified;return cells;});
  if(!values.length)throw Error('QUALIFICATION_MIGRATION_EMPTY_APPEND');
  if(values.some(r=>r.some(v=>/^[=+\-@]/.test(clean(v)))))throw Error('QUALIFICATION_MIGRATION_FORMULA_LIKE_CELL_BLOCKED');
  return append('Auditor_Scope_Qualifications!A:Z',values);
 };
 return applyAuditorQualificationMigration20({enabled,confirmation,withExclusiveLock,readSnapshot,appendRows});
}
