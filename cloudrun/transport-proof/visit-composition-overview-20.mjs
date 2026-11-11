/** Issue #87: authenticated DEV-only read model for Model C visit composition.
 * Reads canonical source directly, never client-provided obligations.
 */
import {previewVisitComposition20} from './visit-composition-preview-20.mjs';
const txt=x=>String(x??'').trim();
const norm=x=>txt(x).toUpperCase().replace(/[\s-]/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const index=(headers,...names)=>headers.findIndex(x=>names.includes(norm(x)));
export function createVisitCompositionOverview20({reader}={}){
 if(typeof reader?.read!=='function')fail('VISIT_OVERVIEW_READER_REQUIRED');
 async function inspect({auditId}={}){
  if(!txt(auditId))fail('VISIT_OVERVIEW_AUDIT_ID_REQUIRED');
  const {readAuditRows:ap,readObligationRows:obs,readLinkRows:links}=await reader.read();
  const aid=index(ap[0],'AUDIT_ID'),company=index(ap[0],'COMPANY_UID'),status=index(ap[0],'STATUS');
  const oid=index(obs[0],'OBLIGATION_ID'),oc=index(obs[0],'SCOPECODE','SCOPE_CODE'),of=index(obs[0],'FORMAL_HOURS'),ou=index(obs[0],'COMPANY_UID'),os=index(obs[0],'OBLIGATION_STATE');
  const la=index(links[0],'AUDIT_ID'),lo=index(links[0],'OBLIGATION_ID'),ls=index(links[0],'LINK_STATE');
  if([aid,company,status,oid,oc,of,ou,os,la,lo,ls].some(x=>x<0))fail('VISIT_OVERVIEW_SCHEMA_INVALID');
  const matches=ap.slice(1).filter(r=>txt(r[aid])===txt(auditId));
  if(matches.length!==1)fail('VISIT_OVERVIEW_AUDIT_NOT_UNIQUE');
  const companyUid=txt(matches[0][company]);
  if(!companyUid)fail('VISIT_OVERVIEW_COMPANY_UID_MISSING');
  const active=new Map();
  for(const l of links.slice(1)){
   if(norm(l[ls])!=='ACTIVE')continue;
   const id=txt(l[lo]),owner=txt(l[la]);
   if(!id||!owner||active.has(id))fail('VISIT_OVERVIEW_DUPLICATE_ACTIVE_LINK');
   active.set(id,owner);
  }
  const sourceIds=[...active].filter(([,owner])=>owner===auditId).map(([id])=>id);
  if(!sourceIds.length)fail('VISIT_OVERVIEW_NO_ACTIVE_OBLIGATIONS');
  const obligations=sourceIds.map(id=>{
   const rows=obs.slice(1).filter(r=>txt(r[oid])===id);
   if(rows.length!==1)fail('VISIT_OVERVIEW_OBLIGATION_NOT_UNIQUE');
   const r=rows[0];
   if(txt(r[ou])!==companyUid)fail('VISIT_OVERVIEW_COMPANY_PARITY_CONFLICT');
   return {obligationId:id,scopeCode:txt(r[oc]),formalHours:Number(txt(r[of]).replace(',','.')),
     auditId,companyUid,linkState:'ACTIVE',obligationState:txt(r[os])};
  });
  const together=previewVisitComposition20({auditId,companyUid,obligations,mode:obligations.length>1?'TOGETHER':undefined});
  return {ok:true,auditId,companyUid,status:txt(matches[0][status]),obligations:together.obligations,
    totalRequiredMinutes:together.totalRequiredMinutes,
    compositionRequired:together.compositionRequired,
    availableModes:together.compositionRequired?['TOGETHER','SEPARATELY']:['SINGLE'],
    writeEnabled:false,authority:'CANONICAL_SHEETS_READ_ONLY'};
 }
 return Object.freeze({inspect});
}
