/**
 * DEV issue #87: isolated multi-visit composition service.
 * NOT registered as an HTTP route. Invocation requires canonical preflight
 * and existing global Firestore gate. No PROD authorization.
 *
 * The preflight owner must independently re-read and verify every SSoT input
 * under the shared fence. The command itself is NOT proof of CAS or identity.
 */
import {createHash} from 'node:crypto';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareModelCVisitLinkSplit20} from './visit-model-c-link-split-plan-20.mjs';
import {prepareModelCPlanningVisitSplitRows20} from './visit-model-c-planning-split-rows-20.mjs';
import {verifyVisitCompositionSource20} from './visit-composition-source-evidence-20.mjs';
import {deriveVisitSplitIdentity20} from './visit-composition-identity-20.mjs';

const str = x => String(x ?? '').trim();
const fail = code => {const error=new Error(code);error.code=code;throw error;};
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const jsonEq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const normalizedId=x=>str(x);

export function createPlanningVisitCompositionService20({store,gate,projector,appendProjector,preflight,canonicalReader,enabled=false}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.readOutbox!=='function'||typeof store?.commitMulti!=='function'||
    typeof store?.markProjected!=='function'||typeof store?.markUncertain!=='function'||
    typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||typeof gate?.uncertain!=='function'||
    typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||
    typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function'||
    typeof preflight!=='function'||typeof canonicalReader?.read!=='function')fail('COMPOSITION_SERVICE_DEPENDENCY_INVALID');
 async function commit({actor,body}={}){
  if(!enabled)fail('COMPOSITION_SERVICE_NOT_ENABLED');
  if(actor?.role!=='manager'||!normalizedId(actor?.auditorId))fail('COMPOSITION_SERVICE_MANAGER_ONLY');
  if(!body||!normalizedId(body.auditId)||!normalizedId(body.companyUid))fail('COMPOSITION_SERVICE_REQUEST_INVALID');
  const operationId=hash({action:'COMPOSE_VISIT',actorId:actor.auditorId,body});
  const previousOutbox=await store.readOutbox(operationId);
  if(previousOutbox){
   if(previousOutbox.auditId!==body.auditId||previousOutbox.actorId!==actor.auditorId||previousOutbox.action!=='COMPOSE_VISIT')
    fail('COMPOSITION_SERVICE_REPLAY_IDENTITY_CONFLICT');
   if(previousOutbox.state==='PROJECTED')return {success:true,replayed:true,operationId,auditId:body.auditId};
   fail('COMPOSITION_SERVICE_RECOVERY_REQUIRED');
  }
  let lock=null,attempted=false,committed=false,verified=false;
  try{
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'ATOMIC_COMPOSE_VISIT'});
   // The canonical owner returns a complete fresh SSoT snapshot. It may
   // not trust client-supplied obligations, revisions, IDs or row numbers.
   const proof=await preflight({actor,body,gateToken:lock.token,operationId});
   if(proof?.authorityPreflight!==true||proof?.success!==true||
      proof?.gateOperationId!==operationId||
      proof?.auditId!==body.auditId||proof?.companyUid!==body.companyUid||
      !Array.isArray(proof.obligations)||!Array.isArray(proof.projectionWrites)||
      !Array.isArray(proof.projectionPreconditions)||!Array.isArray(proof.appendIntents)||
      !Array.isArray(proof.entities)||!proof.entities.length||
      !Array.isArray(proof.requiredProofs)||!proof.writerVerified)
    fail('COMPOSITION_SERVICE_CANONICAL_PREFLIGHT_REQUIRED');
   const requiredProofs=['SOURCE_REVISION_CAS','CANONICAL_MODEL_C_LINKS','CANONICAL_VISIT_IDENTITIES',
    'AVAILABILITY_CLAIM_PARITY','SHEETS_PREIMAGE_PARITY','NOTIFICATION_OUTBOX_INTENTS'];
   if(requiredProofs.some(p=>!proof.requiredProofs.includes(p)))fail('COMPOSITION_SERVICE_PROOF_INCOMPLETE');
   if(proof.sourceRevision!==body.sourceRevision||
      proof.sourceRevision!==proof.expectedSourceRevision||
      !/^[a-f0-9]{24}$/.test(str(proof.sourceRevision)))
    fail('COMPOSITION_SERVICE_REVISION_MISMATCH');
   const command=prepareVisitCompositionCommand20({
    auditId:body.auditId,companyUid:body.companyUid,sourceRevision:proof.sourceRevision,
    obligations:proof.obligations,mode:body.mode,
    blocks:body.blocks,allocations:body.allocations,visits:proof.visits
   });
   if(command.mode==='SEPARATELY'){
    // No client or preflight-provided identity is accepted without computing
    // the deterministic canonical value again inside the fenced service.
    for(const visit of command.visits.filter(x=>x.auditId!==command.auditId)){
      const expected=deriveVisitSplitIdentity20({
        sourceAuditId:command.auditId,obligationId:visit.obligationId,sourceRevision:proof.sourceRevision
      });
      const claimed=proof.visits?.find(x=>x.obligationId===visit.obligationId);
      if(visit.auditId!==expected.auditId||claimed?.identityIssuedBy!=='CANONICAL'||
         claimed.identityIssueRevision!==expected.identityIssueRevision)
        fail('COMPOSITION_SERVICE_VISIT_IDENTITY_NOT_CANONICAL');
    }
   }
   // Canonical SSoT rows are revalidated; boolean proof flags alone are never enough.
   const canonicalRows=await canonicalReader.read({
     appendRowNumbers:proof.mode==='SEPARATELY'?proof.appendRowNumbers:[],
     planningAppendRowNumbers:proof.mode==='SEPARATELY'?proof.planningAppendRowNumbers:[]
   });
   const sourceEvidence=verifyVisitCompositionSource20({
     command,
     readAuditRows:canonicalRows.readAuditRows,
     readObligationRows:canonicalRows.readObligationRows,
     readLinkRows:canonicalRows.readLinkRows,
     emptyAppendRows:canonicalRows.emptyAppendRows
   });
   if(!sourceEvidence.verified||sourceEvidence.obligationCount!==command.obligationIds.length||
      !jsonEq(sourceEvidence.obligations.map(x=>x.obligationId),command.obligationIds)||
      !jsonEq(sourceEvidence.obligations,command.obligationIds.map(id=>{
        const current=command.obligationIds.indexOf(id);
        const obligation=proof.obligations[current];
        return {obligationId:String(obligation.obligationId),scopeCode:String(obligation.scopeCode),
          requiredMinutes:Math.round(Number(obligation.formalHours)*60)};
      })))
     fail('COMPOSITION_SERVICE_SOURCE_EVIDENCE_MISMATCH');
   if(proof.mode==='SEPARATELY'&&
      !jsonEq(sourceEvidence.reservedAppendRows,proof.appendRowNumbers))
     fail('COMPOSITION_SERVICE_APPEND_ROW_PROOF_MISMATCH');
   if(!jsonEq(proof.obligationIds,command.obligationIds))fail('COMPOSITION_SERVICE_OBLIGATION_PARITY');
   if(proof.mode!==command.mode)fail('COMPOSITION_SERVICE_MODE_CONFLICT');
   if(!jsonEq(proof.projectionWrites.map(x=>x.range),
      proof.projectionPreconditions.map(x=>x.range))||
      !proof.projectionWrites.length||!proof.appendIntents.length)
    fail('COMPOSITION_SERVICE_PROJECTOR_PLAN_INVALID');
   // Scope the writeset to the three canonical planning targets. No legacy
   // log, company, notification template or unrelated sheet may be updated.
   const allowedSheets=new Set(['Audit planning','Audit_Visit_Obligations','Auditor Availability']);
   const writeRanges=new Set();
   for(const write of proof.projectionWrites){
    const range=str(write?.range),sheet=range.split('!')[0];
    if(!allowedSheets.has(sheet)||writeRanges.has(range)||
       !/^([^!]+)![A-Z]+[0-9]+:[A-Z]+[0-9]+$/.test(range))
      fail('COMPOSITION_SERVICE_PROJECTION_SCOPE_FORBIDDEN');
    writeRanges.add(range);
   }
   // Notification Queue is the only append side effect for this operation.
   // Its canonical 13-column schema requires a durable event, recipient and
   // audit reference; short ad hoc rows are not acceptable as commit proof.
   const queueIntents=[];
   for(const intent of proof.appendIntents){
    if(intent?.range!=='Notification Queue!A:M'||!Array.isArray(intent.values)||
       !intent.values.length||intent.values.some(row=>!Array.isArray(row)||row.length!==13))
      fail('COMPOSITION_SERVICE_NOTIFICATION_INTENT_INVALID');
    for(const row of intent.values){
      if(!str(row[0])||!str(row[1])||!str(row[2])||
         !str(row[3])||!str(row[4])||!str(row[10]))
        fail('COMPOSITION_SERVICE_NOTIFICATION_INTENT_INCOMPLETE');
      queueIntents.push(row);
    }
   }
   if(!queueIntents.length)fail('COMPOSITION_SERVICE_NOTIFICATION_REQUIRED');
   if(proof.mode==='SEPARATELY'){
    const modelC=prepareModelCVisitLinkSplit20({
      command,linkValues:canonicalRows.readLinkRows,appendRowNumbers:sourceEvidence.reservedAppendRows,now:proof.now
    });
    const required=modelC.projectionWrites.map(x=>x.range);
    if(!required.every(range=>proof.projectionWrites.some((w,i)=>
      w.range===range&&jsonEq(w.values[0],modelC.projectionWrites.find(x=>x.range===range).values[0])&&
      jsonEq(proof.projectionPreconditions[i].before,modelC.projectionPreconditions.find(x=>x.range===range).before))))
      fail('COMPOSITION_SERVICE_MODEL_C_PROJECTION_MISMATCH');
    if(proof.verifiedEmptyAppendRows!==true)fail('COMPOSITION_SERVICE_APPEND_ROWS_NOT_VERIFIED');
    if(proof.verifiedEmptyPlanningRows!==true||
       !jsonEq(canonicalRows.emptyPlanningRows?.map(x=>x.row),proof.planningAppendRowNumbers))
      fail('COMPOSITION_SERVICE_PLANNING_APPEND_ROWS_NOT_VERIFIED');
    const planningSplit=prepareModelCPlanningVisitSplitRows20({
      command,planningValues:canonicalRows.readAuditRows,
      configScopeValues:canonicalRows.readConfigScopeRows,
      newRowNumbers:canonicalRows.emptyPlanningRows.map(x=>x.row)
    });
    if(!planningSplit.projectionWrites.every((write,i)=>
       proof.projectionWrites.some((target,j)=>
         target.range===write.range&&jsonEq(target.values,write.values)&&
         jsonEq(proof.projectionPreconditions[j],planningSplit.projectionPreconditions[i]))))
      fail('COMPOSITION_SERVICE_PLANNING_PROJECTION_MISMATCH');
   }
   const audits=proof.entities;
   if(audits[0]?.auditId!==command.auditId||
      new Set(audits.map(x=>x.auditId)).size!==audits.length||
      audits.some(x=>!x?.nextSnapshot||x.nextSnapshot.auditId!==x.auditId))
     fail('COMPOSITION_SERVICE_ENTITY_SET_INVALID');
   const expectedVisitIds=command.mode==='SEPARATELY'?command.visits.map(x=>x.auditId):[command.auditId];
   if(audits.length!==expectedVisitIds.length||
      expectedVisitIds.some(id=>!audits.some(x=>x.auditId===id)))
     fail('COMPOSITION_SERVICE_VISIT_ENTITY_MISMATCH');
   if(audits.some(x=>x.remove===true))fail('COMPOSITION_SERVICE_SOURCE_TOMBSTONE_FORBIDDEN');
   if(audits.some(x=>x.auditorId===undefined||!Array.isArray(x.blocks)||x.nextSnapshot?.companyUid!==command.companyUid))
     fail('COMPOSITION_SERVICE_ENTITY_PROJECTION_INCOMPLETE');
   const source=await store.readAudit(command.auditId);
   if(!source||source.pendingOperationId||source.snapshot?.sourceRevision!==proof.sourceRevision||
      !Number.isSafeInteger(source.revision)||source.snapshot?.legacyUnverified||
      audits[0].expectedRevision!==source.revision)
     fail('COMPOSITION_SERVICE_SOURCE_CAS_CONFLICT');
   if(audits.slice(1).some(x=>x.expectedRevision!==null))fail('COMPOSITION_SERVICE_SUCCESSOR_MUST_BE_NEW');
   if(command.mode==='SEPARATELY'&&command.visits.some(visit=>{
     const entity=audits.find(e=>e.auditId===visit.auditId);
     return !entity||!jsonEq(entity.blocks,visit.blocks)||
       entity.nextSnapshot?.obligationId!==visit.obligationId;
   }))fail('COMPOSITION_SERVICE_SPLIT_ENTITY_ALLOCATION_MISMATCH');
   if(command.mode==='TOGETHER'&&(!jsonEq(audits[0].blocks,command.blocks)||
     !jsonEq(audits[0].nextSnapshot?.scopeAllocations,command.allocations)))
     fail('COMPOSITION_SERVICE_TOGETHER_ENTITY_ALLOCATION_MISMATCH');
   const plan={
    ...proof.canonicalSnapshot,auditId:command.auditId,
    projectionWrites:proof.projectionWrites,
    projectionPreconditions:proof.projectionPreconditions,
    appendIntents:proof.appendIntents,
    compositionMode:command.mode,obligationIds:command.obligationIds
   };
   if(proof.canonicalSnapshot?.auditId!==command.auditId)
    fail('COMPOSITION_SERVICE_SNAPSHOT_IDENTITY_INVALID');
   attempted=true;
   const result=await store.commitMulti({
    operationId,actorId:actor.auditorId,action:'COMPOSE_VISIT',
    entities:audits,projectionPlan:plan
   });
   committed=true;
   if(result.replayed)fail('COMPOSITION_SERVICE_UNEXPECTED_COMMIT_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:plan.appendIntents});
   const sheet=await projector.inspect(plan),notification=await appendProjector.inspect(plan.appendIntents);
   if(sheet.state!=='MATCH'||notification.state!=='MATCH')
    fail('COMPOSITION_SERVICE_PROJECTION_UNVERIFIED');
   await store.markProjected({auditId:command.auditId,operationId,
    proof:{verified:true,auditId:command.auditId,rowHash:hash({sheet:sheet.detail,appendCount:notification.count})}});
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'MODEL_C_VISIT_COMPOSITION_PROJECTED'});
   lock=null;
   return {success:true,operationId,auditId:command.auditId,mode:command.mode,
    authority:'FIRESTORE',projection:'PROJECTED',visitAuditIds:expectedVisitIds};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'COMPOSITION_PREFLIGHT_REJECTED'});
    else if(verified)await gate.release({token:lock.token,verified:true,proof:'COMPOSITION_PROJECTED_RELEASE_FAILED'});
    else{
     if(committed)await store.markUncertain({auditId:body.auditId,operationId,reason:'COMPOSITION_PROJECTION_UNKNOWN'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'COMPOSITION_COMMIT_OR_PROJECTOR_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
