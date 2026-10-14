'use strict';
// Historical aliases are canonical records, not inferred display-name matches.
function makeHistoricalAuditorUidResolver(identityVersions){
 if(!Array.isArray(identityVersions))throw Error('ROTATION_IDENTITY_VERSIONS_MISSING');
 const versions=identityVersions.map(v=>{
  if(!v||typeof v.alias!=='string'||!v.alias.trim()||typeof v.auditorUid!=='string'||!v.auditorUid.trim())throw Error('ROTATION_IDENTITY_VERSION_INVALID');
  const start=v.validFrom==null?-Infinity:Date.parse(v.validFrom);
  const end=v.validUntil==null?Infinity:Date.parse(v.validUntil);
  if(Number.isNaN(start)||Number.isNaN(end)||start>=end)throw Error('ROTATION_IDENTITY_PERIOD_INVALID');
  return {alias:v.alias.trim(),auditorUid:v.auditorUid.trim(),start,end};
 });
 return (alias,completedAt)=>{
  const date=Date.parse(completedAt);
  if(typeof alias!=='string'||!alias.trim()||!Number.isFinite(date))throw Error('ROTATION_IDENTITY_LOOKUP_INVALID');
  const matches=versions.filter(v=>v.alias===alias.trim()&&date>=v.start&&date<v.end);
  if(matches.length!==1)throw Error(matches.length?'ROTATION_AUDITOR_IDENTITY_AMBIGUOUS':'ROTATION_AUDITOR_IDENTITY_UNRESOLVED');
  return matches[0].auditorUid;
 };
}
module.exports={makeHistoricalAuditorUidResolver};
