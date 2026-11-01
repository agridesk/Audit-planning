const str=x=>String(x??'').trim();
const iso=x=>{const v=str(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return'';const [y,m,d]=v.split('-').map(Number);if(y<1||m<1||m>12||d<1)return'';const last=new Date(Date.UTC(y,m,0)).getUTCDate();return d<=last?v:'';};
function addMonths(date,n){const s=iso(date);if(!s||!Number.isInteger(n))throw Error('EXT_DATE_OR_MONTHS_INVALID');const [y,m,d]=s.split('-').map(Number);const z=new Date(Date.UTC(y,m-1+n,1));const end=new Date(Date.UTC(z.getUTCFullYear(),z.getUTCMonth()+1,0)).getUTCDate();z.setUTCDate(Math.min(d,end));return z.toISOString().slice(0,10)}
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function planScopeExtension20({auditId,command,targets,obligations,policyByScope,priorTransaction,actorUid,transactionId,lifecycleStatus='Pending Planning'}){
 if(!str(auditId)||!str(actorUid)||!str(transactionId))throw Error('EXT_IDENTITY_REQUIRED');
 if(!['apply','undo'].includes(command))throw Error('EXT_COMMAND_INVALID');
 if(str(lifecycleStatus).toUpperCase().replace(/[_\s]+/g,' ')!=='PENDING PLANNING')throw Error('EXTENSION_ALLOWED_ONLY_PENDING_PLANNING');
 if(!Array.isArray(obligations)||!obligations.length)throw Error('EXT_OBLIGATIONS_REQUIRED');
 if(!Array.isArray(targets)||!targets.length||targets.some(x=>!str(x)||typeof x!=='string'))throw Error('EXT_TARGETS_INVALID');
 const ids=new Set(targets);if(ids.size!==targets.length)throw Error('EXT_TARGETS_INVALID');
 const byId=new Map();for(const o of obligations){if(!str(o.obligationId)||byId.has(str(o.obligationId)))throw Error('EXT_DUPLICATE_OBLIGATION');byId.set(str(o.obligationId),o)}
 const changes=[];
 for(const id of ids){const o=byId.get(id);if(!o||str(o.auditId)!==str(auditId)||str(o.linkState).toUpperCase()!=='ACTIVE'||str(o.triggerSource).toUpperCase()==='ECAS')throw Error('EXT_TARGET_NOT_ELIGIBLE');
  const scope=str(o.scopeCode),policy=policyByScope?.[scope];if(command==='apply'&&(!policy||!Number.isInteger(policy.extensionMonths)||policy.extensionMonths<=0||!Number.isInteger(policy.planningFromMonths)||!Number.isInteger(policy.planningToMonths)))throw Error('EXT_SCOPE_POLICY_MISSING');
  const fields=['baseExpiry','effectiveExpiry','windowFrom','windowTo','extensionApplied','extensionMetadata'];
  if(fields.some(f=>!own(o,f)))throw Error('EXT_SNAPSHOT_INCOMPLETE');
  const before=Object.fromEntries(fields.map(f=>[f,o[f]]));let after;
  if(!iso(before.baseExpiry)||!iso(before.effectiveExpiry)||!iso(before.windowFrom)||!iso(before.windowTo)||before.windowFrom>before.windowTo)throw Error('EXT_SNAPSHOT_DATE_INVALID');
  if(command==='apply'){
   if(o.extensionApplied===true||str(o.extensionMetadata))throw Error('EXT_ALREADY_APPLIED');
   const expiry=iso(o.effectiveExpiry);if(!expiry)throw Error('EXT_EXPIRY_INVALID');
   const next=addMonths(expiry,policy.extensionMonths);
   const from=addMonths(next,policy.planningFromMonths),to=addMonths(next,policy.planningToMonths);
   if(from>to)throw Error('EXT_SCOPE_WINDOW_INVALID');
   after={...before,effectiveExpiry:next,windowFrom:from,windowTo:to,extensionApplied:true,extensionMetadata:JSON.stringify({transactionId,actorUid,months:policy.extensionMonths,prior:before})};
  }else{
   const saved=priorTransaction?.changes?.find(x=>x.obligationId===id);
   let savedMeta;try{savedMeta=JSON.parse(str(saved?.after?.extensionMetadata));}catch{throw Error('EXT_UNDO_PROVENANCE_INVALID');}
   if(!saved||str(priorTransaction.transactionId)!==str(savedMeta?.transactionId)||str(savedMeta?.actorUid)!==str(priorTransaction.actorUid)||str(priorTransaction.auditId)!==str(auditId)||str(saved.scopeCode)!==scope||!saved.before||fields.some(f=>!own(saved.before,f)))throw Error('EXT_UNDO_PROVENANCE_INVALID');
   if(fields.some(f=>o[f]!==saved.after[f]))throw Error('EXT_UNDO_CONCURRENT_MODIFICATION');
   after={...saved.before};
  }
  changes.push({obligationId:id,scopeCode:scope,before,after});
 }
 const all=obligations.map(o=>{const change=changes.find(c=>c.obligationId===o.obligationId);return change?{...o,...change.after}:o});
 const active=all.filter(o=>str(o.auditId)===str(auditId)&&str(o.linkState).toUpperCase()==='ACTIVE'&&str(o.triggerSource).toUpperCase()!=='ECAS');
 const expiries=active.map(o=>iso(o.effectiveExpiry)||iso(o.baseExpiry)).filter(Boolean);
 const starts=active.map(o=>iso(o.windowFrom)).filter(Boolean),ends=active.map(o=>iso(o.windowTo)).filter(Boolean);
 const intersection=starts.length===active.length&&ends.length===active.length?{from:starts.sort().at(-1),to:ends.sort()[0]}:null;
 return{auditId,command,transactionId,actorUid,changes,aggregate:{earliestExpiry:expiries.sort()[0]||'',jointWindow:intersection&&intersection.from<=intersection.to?intersection:null,requiresSeparatePlanning:!intersection||intersection.from>intersection.to},readOnly:true,requiresAtomicCommit:true};
}
