// Read-only comparison of a validated legacy migration preview against canonical relations.
// No permission changes, writes, deployments or implicit cutover.
import {previewAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-20.js';
const clean=v=>String(v??'').trim();
const lower=v=>clean(v).toLowerCase();
const qualified=v=>['x','yes','true','1'].includes(lower(v));
export function compareAuditorQualificationParity20({auditors,catalog,relations}={}){
 const preview=previewAuditorQualificationMigration20({auditors,catalog});
 if(!preview.ok)return {ok:false,readOnly:true,errors:preview.errors,missingLegacyScopes:preview.missingLegacyScopes,unrepresentedScopes:preview.unrepresentedScopes};
 if(!Array.isArray(relations)||!relations.length)return {ok:false,readOnly:true,errors:['CANONICAL_RELATIONS_MISSING']};
 const header=relations[0],idx=name=>header.findIndex(x=>lower(x)===lower(name));
 const uc=idx('Auditor_UID'),sc=idx('ScopeCode'),qc=idx('Qualified');
 if([uc,sc,qc].some(x=>x<0))return {ok:false,readOnly:true,errors:['CANONICAL_RELATIONS_SCHEMA_MISSING']};
 const known=new Set(),duplicates=[],bad=[];
 const canonical=new Set();
 for(let i=1;i<relations.length;i++){
  const row=relations[i]||[];
  if(row.every(x=>!clean(x)))continue;
  const uid=clean(row[uc]),code=lower(row[sc]),state=lower(row[qc]),pair=uid+'|'+code;
  if(!uid||!code||!['x','yes','true','1','no','false','0',''].includes(state)){bad.push(i+1);continue;}
  if(known.has(pair))duplicates.push(pair);
  known.add(pair);
  if(qualified(state))canonical.add(pair);
 }
 if(bad.length||duplicates.length)return {ok:false,readOnly:true,errors:['CANONICAL_RELATIONS_INVALID'],invalidRows:bad,duplicates};
 const legacy=new Set(preview.rows.map(x=>x.Auditor_UID+'|'+lower(x.ScopeCode)));
 // Newly introduced scopes have no legacy source column and are excluded from comparison.
 const ci=(catalog[0]||[]).findIndex(x=>lower(x)==='scopecode');
 const si=(catalog[0]||[]).findIndex(x=>lower(x)==='slotkey');
 if(ci<0||si<0)return {ok:false,readOnly:true,errors:['SCOPE_CATALOG_SCHEMA_MISSING']};
 const comparableCodes=new Set(catalog.slice(1).filter(x=>!preview.unrepresentedScopes.includes(clean(x[si]))).map(x=>lower(x[ci])));
 const missing=[...legacy].filter(x=>!canonical.has(x));
 const unexpected=[...canonical].filter(x=>comparableCodes.has(x.slice(x.indexOf('|')+1))&&!legacy.has(x));
 return {ok:missing.length===0&&unexpected.length===0,readOnly:true,legacyCount:legacy.size,canonicalComparableCount:[...canonical].filter(x=>comparableCodes.has(x.slice(x.indexOf('|')+1))).length,missing,unexpected,unrepresentedScopes:preview.unrepresentedScopes};
}
