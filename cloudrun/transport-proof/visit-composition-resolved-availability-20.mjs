/** Issue #87: fresh resolved Availability conflicts for new planning.
 * Pure and read-only. COMMITTED occupancy stays owned by canonical
 * Planning JSON, not an Availability row. Interval semantics: [start,end).
 */
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const minute=(value,allow24=false)=>{
 const s=str(value);
 if(allow24&&s==='24:00')return 1440;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
  fail('COMPOSITION_RESOLVED_INTERVAL_INVALID');
 return Number(s.slice(0,2))*60+Number(s.slice(3));
};
const states=new Set(['FREE','SOFT','HARD','COMMITTED','PROVISIONAL']);
export function verifyFreshResolvedCompositionAvailability20({
 resolved,auditorId,date,blocks
}={}){
 if(!str(auditorId)||!str(date)||!Array.isArray(blocks)||!blocks.length||
    !resolved||resolved.canonicalFresh!==true||
    str(resolved.auditorId)!==str(auditorId)||
    !Number.isSafeInteger(resolved.version)||resolved.version<0||
    !Array.isArray(resolved.days)||resolved.days.length!==1||
    str(resolved.days[0]?.date)!==str(date)||
    !Array.isArray(resolved.days[0].segments)||
    !resolved.days[0].segments.length)
  fail('COMPOSITION_RESOLVED_FRESH_EVIDENCE_REQUIRED');
 if(resolved.unknownReservationOwner===true||
    Array.isArray(resolved.uncertainAuditorIds)&&resolved.uncertainAuditorIds.includes(str(auditorId))||
    !Array.isArray(resolved.incompleteAuditDiagnostics)||
    resolved.incompleteAuditDiagnostics.length>0)
  fail('COMPOSITION_RESOLVED_CANONICAL_DIAGNOSTIC_UNCERTAIN');
 const segments=resolved.days[0].segments;
 let previous=0;
 for(const segment of segments){
  const a=minute(segment?.start),b=minute(segment?.end,true);
  if(!states.has(segment?.state)||a!==previous||b<=a)
   fail('COMPOSITION_RESOLVED_SEGMENT_COVERAGE_INVALID');
  previous=b;
 }
 if(previous!==1440)fail('COMPOSITION_RESOLVED_SEGMENT_COVERAGE_INVALID');
 let softWarnings=0;
 for(const block of blocks){
  if(str(block?.date)!==str(date))
   fail('COMPOSITION_RESOLVED_BLOCK_DATE_MISMATCH');
  const a=minute(block.start),b=minute(block.end,true);
  if(a>=b)fail('COMPOSITION_RESOLVED_INTERVAL_INVALID');
  for(const segment of segments){
   const start=minute(segment.start),end=minute(segment.end,true);
   if(start>=b||end<=a)continue; // half-open adjacency is permitted.
   if(segment.state==='COMMITTED')fail('COMPOSITION_RESOLVED_COMMITTED_CONFLICT');
   if(segment.state==='HARD')fail('COMPOSITION_RESOLVED_HARD_CONFLICT');
   if(segment.state==='PROVISIONAL')fail('COMPOSITION_RESOLVED_PROVISIONAL_CONFLICT');
   if(segment.state==='SOFT')softWarnings++;
  }
 }
 return Object.freeze({verified:true,auditorId:str(auditorId),date:str(date),
  availabilityVersion:resolved.version,softWarnings,
  source:'FRESH_CANONICAL_RESOLVED_AVAILABILITY',writeEnabled:false});
}
