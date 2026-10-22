// Issue #45 — read-only combined visit replay check. Never commits data.
const clean=v=>String(v==null?'':v).trim();
const sorted=a=>[...new Set((Array.isArray(a)?a:[]).map(clean).filter(Boolean))].sort();
export function isCanonicalCombinedReplay20({status='',planningJson='',assignedTo='',auditorEmail='',sourceAuditIds=[],blocks=[],activeLinks=[],targetAuditId=''}={}){
  if(!['APPROVED','ACCEPTED'].includes(clean(status).toUpperCase().replace(/[\s-]+/g,'_')))return false;
  if(!clean(targetAuditId)||clean(assignedTo).toLowerCase()!==clean(auditorEmail).toLowerCase())return false;
  let prior;try{prior=typeof planningJson==='string'?JSON.parse(planningJson):planningJson;}catch{return false}
  if(!prior||!Array.isArray(prior.sourceAuditIds)||!prior.sourceAuditIds.length||!Array.isArray(prior.obligationIds)||!Array.isArray(prior.blocks))return false;
  if(JSON.stringify(sorted(prior.sourceAuditIds))!==JSON.stringify(sorted(sourceAuditIds)))return false;
  if(JSON.stringify(prior.blocks)!==JSON.stringify(blocks))return false;
  const expected=sorted(prior.obligationIds);
  if(!expected.length)return false;
  const live=sorted((Array.isArray(activeLinks)?activeLinks:[]).filter(x=>clean(x?.auditId)===clean(targetAuditId)&&clean(x?.state).toUpperCase()==='ACTIVE').map(x=>x.obligationId));
  return JSON.stringify(live)===JSON.stringify(expected);
}
