/** Read-only, non-authorizing backup evidence. A matching backup is NEVER an Undo journal. */
const str=x=>String(x??'').trim();
const date=x=>{const s=str(x);let y,m,d;if(/^\d{4}-\d{2}-\d{2}$/.test(s))[y,m,d]=s.split('-').map(Number);else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s))[d,m,y]=s.split('/').map(Number);else return'';return y>0&&m>0&&m<=12&&d>0&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()?String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';};
const get=(r,...keys)=>{for(const k of keys)if(Object.hasOwn(r,k))return r[k];return undefined;};
const yes=v=>/^(yes|1|true|x)$/i.test(str(v));
function select(r){return {obligationId:str(get(r,'Obligation_ID','obligationId')),scopeCode:str(get(r,'ScopeCode','scopeCode')),companyUid:str(get(r,'Company_UID','companyUid')),applied:yes(get(r,'Extension_Applied','extensionApplied')),base:date(get(r,'Base_Expiry_Date','baseExpiry')),effective:date(get(r,'Effective_Expiry_Date','effectiveExpiry')),from:date(get(r,'Planning_Window_From','windowFrom')),to:date(get(r,'Planning_Window_To','windowTo'))};}
export function compareScopeExtensionBackupEvidence20({current,backup,backupLabel}={}){
 if(!Array.isArray(current)||!Array.isArray(backup)||!str(backupLabel))throw Error('EXT_BACKUP_EVIDENCE_INPUT_INVALID');
 const historic=new Map();
 for(const raw of backup){const o=select(raw);if(!o.obligationId||historic.has(o.obligationId))throw Error('EXT_BACKUP_EVIDENCE_DUPLICATE_ID');historic.set(o.obligationId,o)}
 const seen=new Set(),records=[];
 for(const raw of current){const o=select(raw);if(!o.obligationId||seen.has(o.obligationId))throw Error('EXT_BACKUP_EVIDENCE_CURRENT_ID_INVALID');seen.add(o.obligationId);if(!o.applied)continue;
  const before=historic.get(o.obligationId);
  let classification='NO_MATCHING_BACKUP',evidence=null;
  if(before){
   if(before.companyUid!==o.companyUid||before.scopeCode!==o.scopeCode)classification='LINEAGE_CONFLICT';
   else if(before.applied)classification='PREEXISTING_EXTENSION_NO_ORIGINAL';
   else if(!before.base||!before.effective||!before.from||!before.to||!o.effective||!o.from||!o.to)classification='INCOMPLETE_SNAPSHOT';
   else {classification='BACKUP_COMPARISON_AVAILABLE_NOT_AUTHORIZED';evidence={backupEffectiveExpiry:before.effective,currentEffectiveExpiry:o.effective,backupWindowFrom:before.from,backupWindowTo:before.to,currentWindowFrom:o.from,currentWindowTo:o.to};}
  }
  records.push({obligationId:o.obligationId,scopeCode:o.scopeCode,classification,evidence,automaticUndoAllowed:false});
 }
 return {readOnly:true,backupLabel,automaticUndoAllowed:false,records,counts:records.reduce((a,x)=>(a[x.classification]=(a[x.classification]||0)+1,a),{})};
}
