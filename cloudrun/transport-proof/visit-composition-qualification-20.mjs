/** Issue #87: canonical auditor scope qualification eligibility.
 * Read-only strict validation. This is not an Availability claim or booking.
 */
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const ix=(row,...names)=>row.findIndex(x=>names.includes(norm(x)));
const yes=x=>['YES','TRUE','1','X','ACTIVE'].includes(norm(x));
export function verifyCompositionAuditorQualifications20({auditorUid,scopeCodes,auditorRows,qualificationRows}={}){
 const uid=str(auditorUid);
 if(!uid||!Array.isArray(scopeCodes)||!scopeCodes.length||
    new Set(scopeCodes).size!==scopeCodes.length||
    !Array.isArray(auditorRows)||auditorRows.length<2||
    !Array.isArray(qualificationRows)||qualificationRows.length<2)
  fail('COMPOSITION_QUALIFICATIONS_EVIDENCE_REQUIRED');
 const ah=auditorRows[0],qh=qualificationRows[0];
 if(!Array.isArray(ah)||!Array.isArray(qh))
  fail('COMPOSITION_QUALIFICATIONS_SCHEMA_INVALID');
 const au=ix(ah,'AUDITOR_UID'),ar=ix(ah,'ROLE'),aa=ix(ah,'ACTIVE'),ae=ix(ah,'E_MAIL','EMAIL'),
  qu=ix(qh,'AUDITOR_UID'),qs=ix(qh,'SCOPECODE','SCOPE_CODE'),qq=ix(qh,'QUALIFIED');
 if([au,ar,aa,ae,qu,qs,qq].some(x=>x<0))
  fail('COMPOSITION_QUALIFICATIONS_SCHEMA_INVALID');
 const records=auditorRows.slice(1).filter(x=>str(x[au])===uid);
 if(records.length!==1||!yes(records[0][aa])||norm(records[0][ar])!=='AUDITOR'||
    !str(records[0][ae]).includes('@'))
  fail('COMPOSITION_QUALIFICATIONS_AUDITOR_NOT_ACTIVE');
 const qualifiers=new Map();
 for(const row of qualificationRows.slice(1)){
  if(str(row[qu])!==uid)continue;
  const scope=str(row[qs]);
  if(!scope||qualifiers.has(scope))fail('COMPOSITION_QUALIFICATIONS_RELATION_CONFLICT');
  qualifiers.set(scope,yes(row[qq]));
 }
 for(const scope of scopeCodes){
  if(!qualifiers.has(scope)||qualifiers.get(scope)!==true)
   fail('COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED');
 }
 return Object.freeze({qualified:true,auditorUid:uid,auditorEmail:str(records[0][ae]).toLowerCase(),
  checkedScopes:[...scopeCodes],writeEnabled:false,availabilityVerified:false});
}
