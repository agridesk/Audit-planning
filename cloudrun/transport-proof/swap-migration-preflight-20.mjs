/**
 * DEV migration preflight: source coverage and write isolation.
 * No remote writes. A mismatch always blocks cutover.
 */
export function verifySwapMigrationPreflight({sourceAuditIds,sourceAvailabilityIds,targetAuditIds,targetAvailabilityIds,legacyWritesDisabled=false}={}){
 const normalized=values=>{
  if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!v.trim()))throw Error('SWAP_MIGRATION_IDS_INVALID');
  const ids=new Set(values);
  if(ids.size!==values.length)throw Error('SWAP_MIGRATION_DUPLICATE_ID');
  return ids;
 };
 const sourceAudits=normalized(sourceAuditIds),sourceAvailability=normalized(sourceAvailabilityIds);
 const targetAudits=normalized(targetAuditIds),targetAvailability=normalized(targetAvailabilityIds);
 const missing=(left,right)=>[...left].filter(id=>!right.has(id));
 const issues={
  missingAudits:missing(sourceAudits,targetAudits),
  extraAudits:missing(targetAudits,sourceAudits),
  missingAvailability:missing(sourceAvailability,targetAvailability),
  extraAvailability:missing(targetAvailability,sourceAvailability),
  sourceAuditWithoutAvailability:missing(sourceAudits,sourceAvailability),
  legacyWritesStillEnabled:legacyWritesDisabled!==true,
  emptySource:sourceAudits.size===0||sourceAvailability.size===0
 };
 return {ok:Object.values(issues).every(value=>Array.isArray(value)?value.length===0:value===false),issues,cutoverAuthorized:false};
}
