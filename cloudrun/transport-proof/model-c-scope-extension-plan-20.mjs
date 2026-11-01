const str=x=>String(x??'').trim();
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(str(x))?str(x):'';
function addMonths(date,n){const s=iso(date);if(!s||!Number.isInteger(n))throw Error('EXT_DATE_OR_MONTHS_INVALID');const [y,m,d]=s.split('-').map(Number);const z=new Date(Date.UTC(y,m-1+n,1));const end=new Date(Date.UTC(z.getUTCFullYear(),z.getUTCMonth()+1,0)).getUTCDate();z.setUTCDate(Math.min(d,end));return z.toISOString().slice(0,10)}
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function planScopeExtension20({auditId,command,targets,obligations,policyByScope,priorTransaction,actorUid,transactionId}){
 if(!str(auditId)||!str(actorUid)||!str(transactionId))throw Error('EXT_IDENTITY_REQUIRED');
 if(!['apply','undo'].includes(command))throw Error('EXT_COMMAND_INVALID');
 if(!Array.isArray(obligations)||!obligations.length)throw Error('EXT_OBLIGATIONS_REQUIRED');
 const ids=new Set(targets||[]);if(!ids.size||ids.size!==(targets||[]).length)throw Error('EXT_TARGETS_INVALID');
 const byId=new Map();for(const o of obligations){if(!str(o.obligationId)||byId.has(str(o.obligationId)))throw Error('EXT_DUPLICATE_OBLIGATION');byId.set(str(o.obligationId),o)}
 const changes=[];
 for(const id of ids){const o=byId.get(id);if(!o||str(o.auditId)!==str(auditId)||str(o.linkState).toUpperCase()!=='ACTIVE'||str(o.triggerSource).toUpperCase()==='ECAS')throw Error('EXT_TARGET_NOT_ELIGIBLE');
  const scope=str(o.scopeCode),policy=policyByScope?.[scope];if(!policy||!Number.isInteger(policy.extensionMonths)||policy.extensionMonths<=0)throw Error('EXT_SCOPE_POLICY_MISSING');
  const fields=['baseExpiry','effectiveExpiry','windowFrom','windowTo','extensionApplied','extensionMetadata'];
  if(fields.some(f=>!own(o,f)))throw Error('EXT_SNAPSHOT_INCOMPLETE');
  const before=Object.fromEntries(fields.map(f=>[f,o[f]]));let after;
  if(command==='apply'){
   if(o.extensionApplied===true||str(o.extensionMetadata))throw Error('EXT_ALREADY_APPLIED');
   const expiry=iso(o.effectiveExpiry)||iso(o.baseExpiry);if(!expiry)throw Error('EXT_EXPIRY_INVALID');
   const next=addMonths(expiry,policy.extensionMonths);
   const from=addMonths(next,policy.planningFromMonths),to=addMonths(next,policy.planningToMonths);
   if(from>to)throw Error('EXT_SCOPE_WINDOW_INVALID');
   after={...before,effectiveExpiry:next,windowFrom:from,windowTo:to,extensionApplied:true,extensionMetadata:JSON.stringify({transactionId,actorUid,months:policy.extensionMonths,prior:before})};
  }else{
   const saved=priorTransaction?.changes?.find(x=>x.obligationId===id);
   if(!saved||str(priorTransaction.transactionId)!==str(saved.after?.extensionMetadata&&JSON.parse(saved.after.extensionMetadata).transactionId))throw Error('EXT_UNDO_PROVENANCE_INVALID');
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
