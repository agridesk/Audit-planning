// Issue #87: validate canonical read evidence, not client assertions.
// Pure only; the caller must read these complete tables under the held global gate.
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const column=(h,...names)=>h.findIndex(x=>names.includes(str(x).toUpperCase().replace(/[\s-]/g,'_')));
const normalized=x=>str(x).toUpperCase().replace(/[\s-]/g,'_');
const requiredTable=(value,name)=>{
 if(!Array.isArray(value)||value.length<2||!Array.isArray(value[0])||value.some(x=>!Array.isArray(x)))fail(name+'_SOURCE_MISSING');
 return value;
};
/**
 * All inputs are server-read snapshots, not request-provided data.
 * readAuditRows: complete Audit planning table, including header.
 * readObligationRows: complete Audit_Obligations table.
 * readLinkRows: complete Audit_Visit_Obligations table.
 * emptyAppendRows: separately read and verified by same owner under gate.
 */
export function verifyVisitCompositionSource20({command,readAuditRows,readObligationRows,readLinkRows,emptyAppendRows}={}){
 if(command?.type!=='MODEL_C_COMPOSITION_PREFLIGHT'||command.canCommit!==false||
    !str(command.auditId)||!str(command.companyUid)||!Array.isArray(command.obligationIds))
  fail('COMPOSITION_SOURCE_COMMAND_INVALID');
 const audits=requiredTable(readAuditRows,'AUDIT_PLANNING');
 const obligations=requiredTable(readObligationRows,'AUDIT_OBLIGATIONS');
 const links=requiredTable(readLinkRows,'AUDIT_LINKS');
 const ah=audits[0],oh=obligations[0],lh=links[0];
 const ai=column(ah,'AUDIT_ID'),au=column(ah,'COMPANY_UID'),as=column(ah,'STATUS');
 const oi=column(oh,'OBLIGATION_ID'),ou=column(oh,'COMPANY_UID'),oc=column(oh,'SCOPECODE','SCOPE_CODE'),of=column(oh,'FORMAL_HOURS'),os=column(oh,'OBLIGATION_STATE');
 const la=column(lh,'AUDIT_ID'),lo=column(lh,'OBLIGATION_ID'),ls=column(lh,'LINK_STATE');
 if([ai,au,as,oi,ou,oc,of,os,la,lo,ls].some(n=>n<0))
  fail('COMPOSITION_SOURCE_SCHEMA_INCOMPLETE');
 const source=audits.slice(1).filter(row=>str(row[ai])===command.auditId);
 if(source.length!==1)fail('COMPOSITION_SOURCE_AUDIT_NOT_UNIQUE');
 if(str(source[0][au])!==command.companyUid)fail('COMPOSITION_SOURCE_COMPANY_MISMATCH');
 if(normalized(source[0][as])!=='PENDING_PLANNING')
  fail('COMPOSITION_SOURCE_NOT_PENDING_PLANNING');
 const allIds=audits.slice(1).map(row=>str(row[ai])).filter(Boolean);
 if(new Set(allIds).size!==allIds.length)fail('COMPOSITION_SOURCE_AUDIT_IDS_NOT_UNIQUE');
 const allObs=new Map();
 for(const row of obligations.slice(1)){
  const id=str(row[oi]);if(!id)continue;
  if(allObs.has(id))fail('COMPOSITION_SOURCE_DUPLICATE_OBLIGATION');
  allObs.set(id,row);
 }
 const expected=new Set(command.obligationIds);
 if(expected.size!==command.obligationIds.length||expected.size<2)
  fail('COMPOSITION_SOURCE_OBLIGATION_SET_INVALID');
 const active=new Map(),sourceLinks=new Set();
 for(const row of links.slice(1)){
  if(normalized(row[ls])!=='ACTIVE')continue;
  const oid=str(row[lo]),aid=str(row[la]);
  if(!oid||!aid||active.has(oid))fail('COMPOSITION_SOURCE_ACTIVE_LINK_CONFLICT');
  active.set(oid,aid);
  if(aid===command.auditId)sourceLinks.add(oid);
 }
 if(sourceLinks.size!==expected.size||[...sourceLinks].some(id=>!expected.has(id)))
  fail('COMPOSITION_SOURCE_ACTIVE_LINK_DRIFT');
 const evidence=[];
 for(const obligationId of command.obligationIds){
  const row=allObs.get(obligationId);
  if(!row||str(row[ou])!==command.companyUid||active.get(obligationId)!==command.auditId||
     ['COMPLETED','CANCELLED','REJECTED'].includes(normalized(row[os])))
   fail('COMPOSITION_SOURCE_OBLIGATION_PARITY');
  const scopeCode=str(row[oc]),raw=str(row[of]).replace(',','.'),formalHours=Number(raw);
  if(!scopeCode||!raw||!Number.isFinite(formalHours)||formalHours<=0)
   fail('COMPOSITION_SOURCE_SCOPE_HOURS_INVALID');
  const requiredMinutes=Math.round(formalHours*60);
  if(Math.abs(formalHours*60-requiredMinutes)>1e-8)
   fail('COMPOSITION_SOURCE_SCOPE_NOT_MINUTE_ALIGNED');
  evidence.push({obligationId,scopeCode,requiredMinutes});
 }
 if(evidence.reduce((sum,x)=>sum+x.requiredMinutes,0)!==command.totalMinutes)
  fail('COMPOSITION_SOURCE_TOTAL_HOURS_DRIFT');
 if(command.mode==='SEPARATELY'){
  if(!Array.isArray(command.visits)||command.visits.length!==expected.size)
   fail('COMPOSITION_SOURCE_VISITS_INVALID');
  const expectedIds=new Set(command.visits.map(v=>v.auditId));
  if(expectedIds.size!==expected.size||!expectedIds.has(command.auditId))
   fail('COMPOSITION_SOURCE_VISIT_IDS_CONFLICT');
  for(const visit of command.visits){
   if(visit.auditId!==command.auditId&&allIds.includes(visit.auditId))
    fail('COMPOSITION_SOURCE_NEW_VISIT_ID_COLLISION');
  }
  if(!Array.isArray(emptyAppendRows)||emptyAppendRows.length!==command.visits.length-1||
     emptyAppendRows.some(x=>!Number.isSafeInteger(x?.row)||x.row<2||
       !Array.isArray(x.before)||x.before.some(cell=>str(cell))))
    fail('COMPOSITION_SOURCE_APPEND_ROW_NOT_EMPTY');
  if(new Set(emptyAppendRows.map(x=>x.row)).size!==emptyAppendRows.length)
    fail('COMPOSITION_SOURCE_APPEND_ROW_DUPLICATE');
 }else if(command.mode!=='TOGETHER')fail('COMPOSITION_SOURCE_MODE_INVALID');
 return Object.freeze({
  verified:true,sourceAuditId:command.auditId,companyUid:command.companyUid,
  obligationCount:evidence.length,sourceLinkCount:sourceLinks.size,
  obligations:evidence,allAuditIdsChecked:allIds.length,
  reservedAppendRows:command.mode==='SEPARATELY'?emptyAppendRows.map(x=>x.row):[],
  doesNotAuthorizeWrite:true
 });
}
