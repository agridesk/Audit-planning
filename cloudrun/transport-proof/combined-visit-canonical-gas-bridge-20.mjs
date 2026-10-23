import {createHash} from 'node:crypto';
const clean=v=>String(v==null?'':v).trim();
const norm=v=>clean(v).toLowerCase().replace(/[ _\-–—]/g,'');
function findCol(h,names){const a=(h||[]).map(norm);for(const name of names){const n=a.indexOf(norm(name));if(n>=0)return n;}return-1}
const field=(h,r,names)=>{const i=findCol(h,names);return i<0?'':clean((r||[])[i])};
const normJson=v=>{const s=clean(v);if(!s)return '';try{return JSON.stringify(JSON.parse(s))}catch{return s}};
export function canonicalPlanningRevision20(headers,row){
 const auditId=field(headers,row,['Audit ID','Audit_ID','AuditId','Audit Id']);
 if(!auditId)throw Error('COMBINED_CANONICAL_AUDIT_ID_MISSING');
 const status=field(headers,row,['Status']),assigned=field(headers,row,['Assigned to','Assigned To','Assigned auditor','Auditor']).toLowerCase();
 const date=field(headers,row,['Date - Planned','Date planned','Date Planned','Planned date']);
 const json=normJson(field(headers,row,['Planning JSON','PlanningJson','Planning_JSON']));
 const serialized=['auditId='+auditId,'status='+status,'assignedTo='+assigned,'datePlanned='+date,'planningJson='+json].join('\n');
 return 'PRT1-'+createHash('sha1').update(serialized).digest('hex');
}
export async function canonicalCombinedGasBridge20({enabled=false,mode='',gasWriteUrl='',bridgeKey='',targetAuditId='',sourceAuditIds=[],actorEmail='',auditorEmail='',auditorName='',blocks=[],expectedRevisionsByAudit={},fetchImpl=fetch}={}){
 if(!enabled)return null;
 if(mode!=='DEV')throw Error('COMBINED_CANONICAL_BRIDGE_DEV_ONLY');
 if(!gasWriteUrl||!bridgeKey)throw Error('COMBINED_CANONICAL_BRIDGE_NOT_CONFIGURED');
 if(!targetAuditId||!actorEmail||!auditorEmail||!Array.isArray(sourceAuditIds)||!sourceAuditIds.length||!Array.isArray(blocks)||!blocks.length)throw Error('COMBINED_CANONICAL_BRIDGE_REQUIRED_FIELDS');
 const all=[targetAuditId,...sourceAuditIds];if(new Set(all).size!==all.length)throw Error('COMBINED_CANONICAL_BRIDGE_DUPLICATE_MEMBER');
 for(const id of all)if(!/^PRT1-[0-9a-f]{40}$/i.test(clean(expectedRevisionsByAudit[id])))throw Error('COMBINED_CANONICAL_BRIDGE_REVISION_REQUIRED');
 const url=new URL(gasWriteUrl);if(url.protocol!=='https:')throw Error('COMBINED_CANONICAL_BRIDGE_HTTPS_REQUIRED');
 url.searchParams.set('action','externalcanonicalcombinedvisit20');
 const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},redirect:'follow',body:JSON.stringify({bridgeKey,runtimeEnv:'DEV',actorRole:'MANAGER',actorEmail,targetAuditId,sourceAuditIds,auditorEmail,auditorName,blocks,expectedRevisionsByAudit})});
 const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{throw Error('COMBINED_CANONICAL_BRIDGE_NON_JSON_'+response.status)}
 if(!response.ok||result?.success!==true||result?.committed!==true)throw Error('COMBINED_CANONICAL_BRIDGE_REJECTED_'+clean(result?.error||result?.message||response.status));
 return {...result,canonicalBridge:true,owner:'GAS_MODEL_C_COMBINED_VISIT',requiresReconciliation:result.postCommitRepairRequired===true||result.sourceAuditTrailRepairRequired===true};
}
