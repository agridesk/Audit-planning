/** DEV-only, retryable projection of a committed Firestore obligation to legacy Sheets.
 * Sheets are a READ PROJECTION, never the canonical EXT writer after cutover.
 * The caller must supply a verified globally fenced cutover, a Sheets adapter,
 * and immutable Firestore transaction/outbox authority.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(str(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export function createScopeExtensionSheetsProjector20({store,sheets,cutoverVerified=false}={}){
 if(cutoverVerified!==true||typeof store?.readOutbox!=='function'||typeof store?.readAuditContext!=='function'||typeof store?.markProjected!=='function'||typeof sheets?.readRows!=='function'||typeof sheets?.writeCells!=='function')throw Error('EXT_PROJECTOR_CUTOVER_UNVERIFIED');
 return async function project(operationId){
  if(!str(operationId)||str(operationId).length>180)throw Error('EXT_PROJECTOR_OPERATION_INVALID');
  const out=await store.readOutbox(operationId);
  if(!out||out.type!=='SCOPE_EXTENSION_PROJECTION'||out.operationId!==operationId||!str(out.companyUid)||!str(out.auditId)||!str(out.obligationId)||!Number.isSafeInteger(out.revision))throw Error('EXT_PROJECTOR_OUTBOX_INVALID');
  if(out.state==='PROJECTED')return{operationId,state:'PROJECTED',replayed:true};
  if(out.state!=='PENDING')throw Error('EXT_PROJECTOR_OUTBOX_NOT_PENDING');
  const ctx=await store.readAuditContext({auditId:out.auditId,companyUid:out.companyUid});
  if(ctx.lifecycleStatus!=='PENDING_PLANNING')throw Error('EXT_PROJECTOR_LIFECYCLE_CONFLICT');
  const own=ctx.obligations.filter(o=>o.obligationId===out.obligationId);
  if(own.length!==1||own[0].revision!==out.revision||own[0].pendingProjectionId!==operationId||own[0].companyUid!==out.companyUid)throw Error('EXT_PROJECTOR_REVISION_CONFLICT');
  const obligation=own[0];
  if(!validDate(obligation.effectiveExpiry)||!validDate(obligation.windowFrom)||!validDate(obligation.windowTo)||obligation.windowFrom>obligation.windowTo)throw Error('EXT_PROJECTOR_CANONICAL_DATES_INVALID');
  const active=ctx.obligations.filter(x=>x.linkState==='ACTIVE'&&x.triggerSource!=='ECAS');
  if(!active.length||active.some(x=>!validDate(x.effectiveExpiry)))throw Error('EXT_PROJECTOR_AGGREGATE_INVALID');
  const earliestExpiry=active.map(x=>x.effectiveExpiry).sort()[0],anyApplied=active.some(x=>x.extensionApplied===true);
  if(out.aggregate?.earliestExpiry!==earliestExpiry)throw Error('EXT_PROJECTOR_AGGREGATE_STALE');
  const live=await sheets.readRows({auditId:out.auditId,companyUid:out.companyUid,obligationId:out.obligationId});
  if(!live||live.companyUid!==out.companyUid||live.auditId!==out.auditId||live.obligationId!==out.obligationId||live.linkState!=='ACTIVE'||live.auditStatus!=='PENDING_PLANNING'||live.obligationRowCount!==1||live.auditRowCount!==1)throw Error('EXT_PROJECTOR_SHEETS_LINEAGE_CONFLICT');
  const expected={obligationId:out.obligationId,auditId:out.auditId,companyUid:out.companyUid,revision:out.revision,extensionApplied:obligation.extensionApplied===true,extensionMetadata:str(obligation.extensionMetadata),effectiveExpiry:obligation.effectiveExpiry,windowFrom:obligation.windowFrom,windowTo:obligation.windowTo,aggregateExpiry:earliestExpiry,aggregateApplied:anyApplied};
  await sheets.writeCells({rows:live,expected,operationId});
  const after=await sheets.readRows({auditId:out.auditId,companyUid:out.companyUid,obligationId:out.obligationId});
  if(!after||after.companyUid!==expected.companyUid||after.auditId!==expected.auditId||after.obligationId!==expected.obligationId||after.linkState!=='ACTIVE'||after.auditStatus!=='PENDING_PLANNING'||after.obligationRowCount!==1||after.auditRowCount!==1||after.extensionApplied!==expected.extensionApplied||after.extensionMetadata!==expected.extensionMetadata||after.effectiveExpiry!==expected.effectiveExpiry||after.windowFrom!==expected.windowFrom||after.windowTo!==expected.windowTo||after.aggregateExpiry!==expected.aggregateExpiry||after.aggregateApplied!==expected.aggregateApplied)throw Error('EXT_PROJECTOR_READBACK_MISMATCH');
  const proof={verified:true,obligationId:out.obligationId,operationId,rowHash:sha(expected)};
  const result=await store.markProjected({obligationId:out.obligationId,operationId,proof});
  return{operationId,state:result.state,revision:out.revision,proofHash:proof.rowHash,replayed:result.replayed===true};
 }
}
