/** Issue #87: read-only reconciliation of live DEV multi-scope composition.
 * Produces aggregate counters only; does not expose client/auditor identities.
 * Never updates source cells, creates visits or reserves rows.
 */
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s_-]+/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const idx=(h,...keys)=>h.findIndex(x=>keys.includes(norm(x)));
const decimal=x=>{const raw=str(x).replace(',','.');return raw?Number(raw):NaN;};
const safeMinutes=x=>{const n=decimal(x);if(!Number.isFinite(n)||n<=0||Math.abs(n*60-Math.round(n*60))>1e-8)return null;return Math.round(n*60);};
export function reconcileVisitCompositionSources20({
 planningRows,obligationRows,linkRows,configScopeRows
}={}){
 const tables=[planningRows,obligationRows,linkRows,configScopeRows];
 if(tables.some(x=>!Array.isArray(x)||x.length<2||!Array.isArray(x[0])))
  fail('COMPOSITION_RECON_CANONICAL_TABLES_REQUIRED');
 const [ah,oh,lh,ch]=tables.map(x=>x[0]);
 const ai=idx(ah,'AUDIT_ID'),ac=idx(ah,'COMPANY_UID'),as=idx(ah,'STATUS'),total=idx(ah,'TOTAL_AUDIT_TIME_IN_HOURS'),
  oi=idx(oh,'OBLIGATION_ID'),oc=idx(oh,'COMPANY_UID'),os=idx(oh,'SCOPECODE','SCOPE_CODE'),of=idx(oh,'FORMAL_HOURS'),
  la=idx(lh,'AUDIT_ID'),lo=idx(lh,'OBLIGATION_ID'),ls=idx(lh,'LINK_STATE'),
  cs=idx(ch,'SLOTKEY','SLOT_KEY'),cc=idx(ch,'SCOPECODE','SCOPE_CODE');
 if([ai,ac,as,total,oi,oc,os,of,la,lo,ls,cs,cc].some(i=>i<0))
  fail('COMPOSITION_RECON_MANDATORY_HEADER_MISSING');
 const scopes=new Map(),slotUsed=new Set();
 for(const row of configScopeRows.slice(1)){
  const code=str(row[cc]),slot=str(row[cs]);
  if(!code||!/^SCOPE_\d{2}$/.test(slot))continue;
  if(scopes.has(code)||slotUsed.has(slot))fail('COMPOSITION_RECON_SCOPE_CONFIG_AMBIGUOUS');
  scopes.set(code,slot);slotUsed.add(slot);
 }
 const audits=new Map();
 for(const row of planningRows.slice(1)){
  const id=str(row[ai]);if(!id)continue;
  if(audits.has(id))fail('COMPOSITION_RECON_DUPLICATE_AUDIT_ID');
  audits.set(id,row);
 }
 const obligations=new Map();
 for(const row of obligationRows.slice(1)){
  const id=str(row[oi]);if(!id)continue;
  if(obligations.has(id))fail('COMPOSITION_RECON_DUPLICATE_OBLIGATION_ID');
  obligations.set(id,row);
 }
 const links=new Map(),activeObligations=new Set();
 for(const row of linkRows.slice(1)){
  if(norm(row[ls])!=='ACTIVE')continue;
  const auditId=str(row[la]),obligationId=str(row[lo]);
  if(!auditId||!obligationId||activeObligations.has(obligationId))
   fail('COMPOSITION_RECON_ACTIVE_LINK_COLLISION');
  activeObligations.add(obligationId);
  if(!links.has(auditId))links.set(auditId,[]);
  links.get(auditId).push(obligationId);
 }
 const reasons={},statuses={},increase=code=>reasons[code]=(reasons[code]||0)+1;
 let multiScope=0,pending=0,eligible=0,blocked=0;
 for(const [auditId,oids] of links){
  if(oids.length<2)continue;
  multiScope++;
  const row=audits.get(auditId),status=norm(row?.[as]||'NOT_FOUND');
  statuses[status]=(statuses[status]||0)+1;
  if(status!=='PENDING_PLANNING')continue;
  pending++;
  let reason='';
  if(!row)reason='AUDIT_NOT_FOUND';
  else{
   const expected=oids.map(id=>obligations.get(id));
   if(expected.some(x=>!x||str(x[oc])!==str(row[ac])))reason='OBLIGATION_OWNER_MISMATCH';
   else{
    const mins=expected.map(x=>safeMinutes(x[of]));
    if(mins.some(x=>x===null))reason='FORMAL_HOURS_MISSING_OR_INVALID';
    else{
     const totalMin=safeMinutes(row[total]);
     if(totalMin===null||totalMin!==mins.reduce((a,b)=>a+b,0))reason='TOTAL_HOURS_MISMATCH';
     else for(let i=0;i<expected.length;i++){
      const code=str(expected[i][os]),slot=scopes.get(code);
      const marker=idx(ah,slot),duration=idx(ah,'DURATION_'+slot);
      if(!slot||marker<0||duration<0){reason='SCOPE_CONFIG_OR_SLOT_MISSING';break;}
      if(norm(row[marker])!=='X'){reason='SCOPE_MARKER_MISSING';break;}
      if(safeMinutes(row[duration])!==mins[i]){reason='SCOPE_DURATION_MISSING_OR_MISMATCH';break;}
     }
    }
   }
  }
  if(reason){blocked++;increase(reason);}
  else eligible++;
 }
 return Object.freeze({
  readOnly:true,writeEnabled:false,canonicalSource:'MODEL_C_AND_AUDIT_PLANNING',
  multiScope,pendingPlanning:pending,eligible,blocked,statuses,reasons,
  requiresManualReconciliation:blocked>0
 });
}
