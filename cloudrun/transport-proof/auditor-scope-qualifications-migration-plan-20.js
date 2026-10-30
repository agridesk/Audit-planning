// DEV-only migration planner. No writes, credentials, timestamps or hidden cutover.
// Builds deterministic append-only rows from the legacy qualification preview.
// Refuses to overwrite, duplicate, or silently reconcile existing relation rows.
import {previewAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-20.js';
import {compareAuditorQualificationParity20} from './auditor-scope-qualifications-parity-20.js';
const str=x=>String(x??'').trim();
const norm=x=>str(x).toLowerCase();
const check=(error,detail={})=>({ok:false,readOnly:true,writesPerformed:false,error,...detail});
export function planAuditorQualificationMigration20({auditors,catalog,relations}={}){
 let preview;
 try{preview=previewAuditorQualificationMigration20({auditors,catalog});}
 catch(e){return check('MIGRATION_PREVIEW_FAILED',{detail:str(e.message)});}
 if(!preview.ok)return check('MIGRATION_PRECHECK_BLOCKED',{errors:preview.errors,missingLegacyScopes:preview.missingLegacyScopes});
 if(!Array.isArray(relations)||relations.length<1)return check('RELATION_SCHEMA_MISSING');
 const headers=relations[0]||[],idx=n=>headers.findIndex(h=>norm(h)===norm(n));
 const u=idx('Auditor_UID'),s=idx('ScopeCode'),q=idx('Qualified');
 if(u<0||s<0||q<0)return check('RELATION_SCHEMA_INCOMPLETE');
 const wanted=new Set(preview.rows.map(x=>x.Auditor_UID+'|'+norm(x.ScopeCode)));
 const known=new Set(),knownUids=new Set(auditors.slice(1).map(r=>str(r[(auditors[0]||[]).findIndex(h=>norm(h)==='auditor_uid')])).filter(Boolean));
 const knownCodes=new Set(catalog.slice(1).map(r=>norm(r[(catalog[0]||[]).findIndex(h=>norm(h)==='scopecode')])).filter(Boolean));
 for(let i=1;i<relations.length;i++){
  const r=relations[i]||[];
  if(r.every(v=>!str(v)))continue;
  const uid=str(r[u]),code=norm(r[s]),state=norm(r[q]),pair=uid+'|'+code;
  if(!uid||!code||!knownUids.has(uid)||!knownCodes.has(code)||!['x','yes','true','1','no','false','0',''].includes(state))return check('INVALID_EXISTING_RELATION',{row:i+1});
  if(known.has(pair))return check('DUPLICATE_EXISTING_RELATION',{row:i+1});
  if(wanted.has(pair)&&!['x','yes','true','1'].includes(state))return check('EXISTING_RELATION_CONFLICT',{row:i+1});
  known.add(pair);
 }
 const append=preview.rows.filter(r=>!known.has(r.Auditor_UID+'|'+norm(r.ScopeCode)));
 const proposed=relations.concat(append.map(r=>{const row=Array(headers.length).fill('');row[u]=r.Auditor_UID;row[s]=r.ScopeCode;row[q]=r.Qualified;return row;}));
 const parity=compareAuditorQualificationParity20({auditors,catalog,relations:proposed});
 if(!parity.ok)return check('MIGRATION_PARITY_BLOCKED',{parity});
 return {ok:true,readOnly:true,writesPerformed:false,appendCount:append.length,alreadyPresentCount:preview.rows.length-append.length,rowsToAppend:append,parity,requiresSeparateAuthorizedWrite:true};
}
