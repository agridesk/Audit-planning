/** Issue #87: canonical, read-only DEV composition preflight.
 * Derives all obligations, scopes and source revision from live SSoT reads.
 * No identity issuance, state mutations, Availability writes or commit routes.
 */
import {createHash} from 'node:crypto';
import {previewVisitComposition20} from './visit-composition-preview-20.mjs';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {verifyVisitCompositionSource20} from './visit-composition-source-evidence-20.mjs';
import {verifyCompositionAuditorQualifications20} from './visit-composition-qualification-20.mjs';
import {verifyVisitCompositionWindows20} from './visit-composition-window-20.mjs';
import {deriveVisitSplitIdentity20} from './visit-composition-identity-20.mjs';
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const key=x=>str(x).toLowerCase().replace(/\s+/g,'_');
const idx=(headers,...aliases)=>aliases.map(a=>headers.findIndex(h=>key(h)===key(a))).find(i=>i>=0)??-1;
const val=(row,i)=>i>=0?str(row[i]):'';
export function createVisitCompositionCanonicalPreflight20({reader}={}){
 if(typeof reader?.read!=='function')fail('COMPOSITION_PREFLIGHT_READER_MISSING');
 async function preview({auditId,mode,sourceRevision,blocks,allocations,auditorUid,visits}={}){
  auditId=str(auditId);if(!auditId)fail('COMPOSITION_PREFLIGHT_AUDIT_ID_REQUIRED');
  if(mode!=='TOGETHER'&&mode!=='SEPARATELY')fail('COMPOSITION_PREFLIGHT_MODE_REQUIRED');
  const evidence=await reader.read();
  const {readAuditRows:ap,readObligationRows:obs,readLinkRows:links}=evidence;
  const ah=ap[0],oh=obs[0],lh=links[0];
  const id=idx(ah,'Audit ID'),uid=idx(ah,'Company_UID'),status=idx(ah,'Status');
  const aid=idx(lh,'Audit_ID'),oid=idx(lh,'Obligation_ID'),state=idx(lh,'Link_State');
  const obid=idx(oh,'Obligation_ID'),ouid=idx(oh,'Company_UID'),scope=idx(oh,'ScopeCode'),hours=idx(oh,'Formal_Hours'),ostate=idx(oh,'Obligation_State');
  if([id,uid,status,aid,oid,state,obid,ouid,scope,hours,ostate].some(i=>i<0))
   fail('COMPOSITION_PREFLIGHT_SCHEMA_INCOMPLETE');
  const matches=ap.slice(1).filter(row=>val(row,id)===auditId);
  if(matches.length!==1)fail('COMPOSITION_PREFLIGHT_SOURCE_NOT_UNIQUE');
  const row=matches[0],companyUid=val(row,uid);
  if(!companyUid)fail('COMPOSITION_PREFLIGHT_COMPANY_UID_REQUIRED');
  const revisionFields=[
   val(row,idx(ah,'Audit ID')),val(row,idx(ah,'Status')),
   val(row,idx(ah,'Assigned to')),val(row,idx(ah,'Planning JSON')),
   val(row,idx(ah,'Last decision timestamp')),val(row,idx(ah,'Status since'))
  ];
  const storedAuditorUid=val(row,idx(ah,'Auditor_UID','Assigned_Auditor_UID'));
  const actualRevision=createHash('sha256').update(revisionFields.join('|')+(storedAuditorUid?'|'+storedAuditorUid:'')).digest('hex').slice(0,24);
  if(sourceRevision!==undefined&&str(sourceRevision)!==actualRevision)
   fail('COMPOSITION_PREFLIGHT_SOURCE_REVISION_CONFLICT');
  const globalActive=new Set();
  for(const link of links.slice(1)){
   if(val(link,state).toUpperCase()!=='ACTIVE')continue;
   const obligationId=val(link,oid);
   if(!obligationId||globalActive.has(obligationId))
    fail('COMPOSITION_SOURCE_ACTIVE_LINK_CONFLICT');
   globalActive.add(obligationId);
  }
  const activeIds=links.slice(1).filter(r=>val(r,aid)===auditId&&val(r,state).toUpperCase()==='ACTIVE').map(r=>val(r,oid));
  if(activeIds.length<2||new Set(activeIds).size!==activeIds.length)
   fail('COMPOSITION_PREFLIGHT_MULTISCOPE_ACTIVE_LINKS_REQUIRED');
  const obligations=activeIds.map(obligationId=>{
   const found=obs.slice(1).filter(r=>val(r,obid)===obligationId);
   if(found.length!==1)fail('COMPOSITION_PREFLIGHT_OBLIGATION_NOT_UNIQUE');
   const r=found[0],formalHours=Number(val(r,hours).replace(',','.'));
   return {obligationId,auditId,companyUid:val(r,ouid),scopeCode:val(r,scope),
    formalHours,linkState:'ACTIVE',obligationState:val(r,ostate)};
  });
  let qualifications=null;
  if(auditorUid!==undefined){
   if(!str(auditorUid)||typeof reader.readQualifications!=='function')
    fail('COMPOSITION_PREFLIGHT_QUALIFICATIONS_READER_REQUIRED');
   const directory=await reader.readQualifications();
   qualifications=verifyCompositionAuditorQualifications20({
    auditorUid,scopeCodes:[...new Set(obligations.map(o=>o.scopeCode))],
    auditorRows:directory.auditorRows,qualificationRows:directory.qualificationRows
   });
  }
  const base={auditId,companyUid,obligations,mode};
  if(mode==='SEPARATELY'){
   if(str(row[status]).toUpperCase().replace(/[\s_-]+/g,'_')!=='PENDING_PLANNING')
    fail('COMPOSITION_SOURCE_NOT_PENDING_PLANNING');
   const result=previewVisitComposition20(base);
   if(visits===undefined){
    return {success:true,readOnly:true,writeEnabled:false,auditId,companyUid,
     sourceRevision:actualRevision,mode:'SEPARATELY',qualifications,obligations:result.obligations,
     totalRequiredMinutes:result.totalRequiredMinutes,requiredVisitCount:obligations.length,
     canCommit:false,reason:'SPLIT_VISIT_BLOCKS_REQUIRED'};
   }
   if(!Array.isArray(visits)||visits.length!==obligations.length)
    fail('COMPOSITION_PREFLIGHT_SEPARATE_VISITS_INVALID');
   const expected=new Set(activeIds),sourceObligation=str(visits[0]?.obligationId);
   if(!expected.has(sourceObligation))fail('COMPOSITION_PREFLIGHT_SOURCE_OBLIGATION_INVALID');
   const prepared=visits.map((v,i)=>{
    const obligationId=str(v?.obligationId);
    if(!expected.has(obligationId)||v?.auditId!==undefined||v?.identityIssuedBy!==undefined||
       v?.identityIssueRevision!==undefined||!Array.isArray(v.blocks))
     fail('COMPOSITION_PREFLIGHT_SEPARATE_VISIT_UNTRUSTED_IDENTITY');
    const derived=i===0
     ?{auditId}
     :deriveVisitSplitIdentity20({sourceAuditId:auditId,obligationId,sourceRevision:actualRevision});
    return {...derived,obligationId,blocks:v.blocks};
   });
   const command=prepareVisitCompositionCommand20({
    ...base,sourceRevision:actualRevision,visits:prepared
   });
   const windows=verifyVisitCompositionWindows20({command,obligationRows:obs});
   const source=verifyVisitCompositionSource20({
    command,readAuditRows:ap,readObligationRows:obs,readLinkRows:links,
    emptyAppendRows:prepared.slice(1).map((_,i)=>({row:ap.length+i+1,before:[]}))
   });
   if(source.obligationCount!==obligations.length||!windows.verified)
    fail('COMPOSITION_PREFLIGHT_SEPARATE_CANONICAL_PROOF_INVALID');
   return {success:true,readOnly:true,writeEnabled:false,auditId,companyUid,
    sourceRevision:actualRevision,mode:'SEPARATELY',qualifications,
    obligations:source.obligations,totalRequiredMinutes:command.totalMinutes,
    proposedVisits:command.visits,windows:windows.obligations,
    requiredVisitCount:command.visits.length,canCommit:false,
    newIdsAreOnlyProposals:true,
    reason:'FIRESTORE_IDENTITY_CAS_CAPACITY_AND_PROJECTION_REQUIRED'};
  }
  const command=prepareVisitCompositionCommand20({
   ...base,sourceRevision:actualRevision,blocks,allocations
  });
  const windowEvidence=verifyVisitCompositionWindows20({
   command,obligationRows:obs
  });
  const source=verifyVisitCompositionSource20({
   command,readAuditRows:ap,readObligationRows:obs,readLinkRows:links,emptyAppendRows:[]
  });
  return {success:true,readOnly:true,writeEnabled:false,auditId,companyUid,
   sourceRevision:actualRevision,mode:'TOGETHER',qualifications,obligations:source.obligations,
   totalRequiredMinutes:command.totalMinutes,totalHours:command.totalHours,
   allocations:command.allocations,blocks:command.blocks,windows:windowEvidence.obligations,canCommit:false,
   reason:'CANONICAL_COMPOSITION_WRITER_AND_AVAILABILITY_PARITY_REQUIRED'};
 }
 return Object.freeze({preview});
}
