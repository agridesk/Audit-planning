/**
 * Model C EXT stage-1: pure, no-write backfill manifest builder.
 * Source is the DEV canonical Sheets snapshot; no Firestore or Sheets mutations.
 * Historical extension metadata is preserved; Apply and Undo stay quarantined
 * unless a separately verified transaction lineage exists.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const int=x=>{const s=str(x);return /^-?\d+$/.test(s)?Number(s):NaN};
const yes=x=>/^(yes|true|1|x)$/i.test(str(x));
const iso=x=>{
 const s=str(x);if(!s)return '';
 let y,m,d;if(/^\d{4}-\d{2}-\d{2}$/.test(s))[y,m,d]=s.split('-').map(Number);
 else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s))[d,m,y]=s.split('/').map(Number);
 else throw Error('EXT_BACKFILL_DATE_UNRECOGNIZED');
 if(y<1||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())throw Error('EXT_BACKFILL_DATE_INVALID');
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
};
const input=(rows,names)=>{
 if(!Array.isArray(rows)||rows.length<1||rows.length>2501||!Array.isArray(rows[0]))throw Error('EXT_BACKFILL_INPUT_INVALID_'+names.join('_'));
 const head=rows[0].map(str);
 const col=k=>{const i=head.indexOf(k);if(i<0)throw Error('EXT_BACKFILL_HEADER_MISSING_'+k);return i};
 return{head,rows:rows.slice(1),col};
};
const id=x=>{const s=str(x);return !!s&&s.length<=180&&!/[\\/]/.test(s)&&s!=='.'&&s!=='..'};
export function prepareScopeExtensionBackfill20({obligationRows,linkRows,planningRows,scopeRows}={}){
 const O=input(obligationRows,['obligations']),L=input(linkRows,['links']),P=input(planningRows,['planning']),S=input(scopeRows,['scopes']);
 const oc=Object.fromEntries(['Obligation_ID','Company_UID','ScopeCode','Trigger_Source','Obligation_State','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Extension_Applied','Extension_Metadata_JSON','Source_Audit_ID'].map(k=>[k,O.col(k)]));
 const lc=Object.fromEntries(['Audit_ID','Obligation_ID','Link_State'].map(k=>[k,L.col(k)]));
 const pc={audit:P.col('Audit ID'),status:P.col('Status')};
 const sc=Object.fromEntries(['ScopeCode','Extension','Planning from','Planning to','Trigger source'].map(k=>[k,S.col(k)]));
 const get=(row,i)=>str(row[i]);
 const scopePolicies=new Map();
 for(const row of S.rows){
  const code=get(row,sc.ScopeCode);if(!code)continue;
  if(scopePolicies.has(code))throw Error('EXT_BACKFILL_SCOPE_POLICY_DUPLICATE');
  const months=int(row[sc.Extension]),from=int(row[sc['Planning from']]),to=int(row[sc['Planning to']]);
  const eligible=Number.isSafeInteger(months)&&months>0&&Number.isSafeInteger(from)&&Number.isSafeInteger(to);
  scopePolicies.set(code,eligible?{extensionMonths:months,planningFromMonths:from,planningToMonths:to}:null);
 }
 const audits=new Map();
 for(const row of P.rows){const auditId=get(row,pc.audit);if(!auditId)continue;if(!id(auditId)||audits.has(auditId))throw Error('EXT_BACKFILL_AUDIT_DUPLICATE_OR_INVALID');const state=norm(get(row,pc.status));if(!state)throw Error('EXT_BACKFILL_AUDIT_STATUS_MISSING');audits.set(auditId,state)}
 const originals=new Map();
 for(const row of O.rows){const obligationId=get(row,oc.Obligation_ID);if(!obligationId)continue;const companyUid=get(row,oc.Company_UID),scopeCode=get(row,oc.ScopeCode);if(!id(obligationId)||!id(companyUid)||!id(scopeCode)||originals.has(obligationId))throw Error('EXT_BACKFILL_OBLIGATION_DUPLICATE_OR_INVALID');if(!scopePolicies.has(scopeCode))throw Error('EXT_BACKFILL_SCOPE_UNKNOWN');originals.set(obligationId,row)}
 const activeByOb=new Map(),byAudit=new Map();
 for(const row of L.rows){
  if(norm(get(row,lc.Link_State))!=='ACTIVE')continue;
  const auditId=get(row,lc.Audit_ID),obligationId=get(row,lc.Obligation_ID);
  if(!id(auditId)||!id(obligationId)||!audits.has(auditId)||!originals.has(obligationId))throw Error('EXT_BACKFILL_ACTIVE_LINK_ORPHAN');
  if(activeByOb.has(obligationId))throw Error('EXT_BACKFILL_OBLIGATION_MULTI_AUDIT_LINK');
  activeByOb.set(obligationId,auditId);
  const group=byAudit.get(auditId)||[];
  if(group.includes(obligationId))throw Error('EXT_BACKFILL_DUPLICATE_ACTIVE_LINK');
  group.push(obligationId);byAudit.set(auditId,group);
 }
 const manifestObligations=[],manifestContexts=[];
 let blockedLegacyApply=0,blockedLegacyUndo=0,missingHistoricalDates=0,pendingEligibleUntouched=0,isoNormalized=0;
 for(const [obligationId,row] of originals){
  const auditId=activeByOb.get(obligationId)||get(row,oc.Source_Audit_ID);
  const active=activeByOb.has(obligationId),scopeCode=get(row,oc.ScopeCode),triggerSource=get(row,oc.Trigger_Source),companyUid=get(row,oc.Company_UID);
  const date=(key)=>{const raw=get(row,oc[key]);const value=iso(raw);if(raw&&value!==raw)isoNormalized++;if(!value)missingHistoricalDates++;return value};
  const baseExpiry=date('Base_Expiry_Date'),effectiveExpiry=date('Effective_Expiry_Date'),windowFrom=date('Planning_Window_From'),windowTo=date('Planning_Window_To');
  const datesIncomplete=!baseExpiry||!effectiveExpiry||!windowFrom||!windowTo||windowFrom>windowTo;
  const isPending=audits.get(auditId)==='PENDING_PLANNING';
  const isEcas=triggerSource==='ECAS';
  // ECAS has no scope-managed extension expiry. Historical non-pending rows can
  // remain staged with incomplete dates, but never become extension eligible.
  if(active&&datesIncomplete&&isPending&&!isEcas)throw Error('EXT_BACKFILL_ACTIVE_DATES_INCOMPLETE');
  const extensionApplied=yes(get(row,oc.Extension_Applied)),legacyExtensionMetadata=get(row,oc.Extension_Metadata_JSON);
  if(legacyExtensionMetadata){try{JSON.parse(legacyExtensionMetadata)}catch{throw Error('EXT_BACKFILL_LEGACY_METADATA_INVALID')}}
  const legacyApplyQuarantined=!extensionApplied&&(!!legacyExtensionMetadata||datesIncomplete);
  const legacyUndoQuarantined=extensionApplied;
  if(legacyApplyQuarantined&&active&&audits.get(auditId)==='PENDING_PLANNING')blockedLegacyApply++;
  if(legacyUndoQuarantined&&active&&audits.get(auditId)==='PENDING_PLANNING')blockedLegacyUndo++;
  if(active&&audits.get(auditId)==='PENDING_PLANNING'&&!extensionApplied&&!legacyExtensionMetadata&&triggerSource!=='ECAS'&&scopePolicies.get(scopeCode))pendingEligibleUntouched++;
  manifestObligations.push({obligationId,auditId,companyUid,scopeCode,linkState:active?'ACTIVE':'UNLINKED',triggerSource,expiryManaged:triggerSource!=='ECAS',revision:0,pendingProjectionId:'',
   baseExpiry,effectiveExpiry,windowFrom,windowTo,extensionApplied,extensionMetadata:legacyExtensionMetadata,legacyExtensionMetadata,
   legacyApplyQuarantined,legacyUndoQuarantined,legacyDateQuarantined:datesIncomplete,stagingWriterFenceVerified:false});
 }
 const canonicalById=new Map(manifestObligations.map(o=>[o.obligationId,o]));
 for(const [auditId,obligationIds] of byAudit){
  const entries=obligationIds.map(x=>canonicalById.get(x));
  const companyUids=new Set(entries.map(x=>x.companyUid));
  if(companyUids.size!==1)throw Error('EXT_BACKFILL_AUDIT_CROSS_COMPANY');
  const companyUid=entries[0].companyUid,status=audits.get(auditId),policyByScope={};
  for(const e of entries)if(e.triggerSource!=='ECAS'&&scopePolicies.get(e.scopeCode))policyByScope[e.scopeCode]=scopePolicies.get(e.scopeCode);
  manifestContexts.push({auditId,companyUid,lifecycleStatus:status,obligationIds,writerFenceVerified:false,policyByScope,migrationState:'STAGED_UNVERIFIED'});
 }
 manifestObligations.sort((a,b)=>a.obligationId.localeCompare(b.obligationId));
 manifestContexts.sort((a,b)=>a.auditId.localeCompare(b.auditId));
 const stats={sourceObligations:originals.size,sourceAudits:audits.size,activeLinks:activeByOb.size,activeAudits:byAudit.size,
   pendingPlanningAudits:manifestContexts.filter(x=>x.lifecycleStatus==='PENDING_PLANNING').length,
   pendingEligibleUntouched,blockedLegacyApply,blockedLegacyUndo,missingHistoricalDates,isoNormalized,
   historicalUnlinked:manifestObligations.filter(x=>x.linkState!=='ACTIVE').length,multiScopeAudits:manifestContexts.filter(x=>x.obligationIds.length>1).length,
   activeDateQuarantined:manifestObligations.filter(x=>x.linkState==='ACTIVE'&&x.legacyDateQuarantined).length};
 const sourceManifest=hash({obligations:manifestObligations,contexts:manifestContexts});
 return Object.freeze({readOnly:true,writeAuthorized:false,sourceManifest,stats,obligations:manifestObligations,contexts:manifestContexts});
}
