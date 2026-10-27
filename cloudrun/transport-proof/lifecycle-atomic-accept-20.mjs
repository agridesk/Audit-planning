// Issue #45. Inactive DEV-only Firestore atomic ACCEPT + durable outbox writer.
// Not a Sheets cutover: callers must prove all lifecycle writers are fenced.
import {assertAuditorAcceptCutover20} from './lifecycle-accept-cutover-20.mjs';
const field=v=>({stringValue:String(v)});
const validName=s=>/^[A-Za-z0-9_-]{1,256}$/.test(s||'');
export function buildAtomicAcceptCommit20({cutover,project,database='(default)',auditId,updateTime,operationId,actorEmail,expectedRevision,now}={}){
  assertAuditorAcceptCutover20({...cutover,auditId,expectedRevision,auditorUid:cutover?.auditorUid});
  if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||''))throw Error('ACCEPT_FIRESTORE_DEV_PROJECT_REQUIRED');
  if(database!=='(default)'||!validName(auditId)||!validName(operationId))throw Error('ACCEPT_FIRESTORE_IDENTIFIER_INVALID');
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(updateTime||''))throw Error('ACCEPT_SOURCE_UPDATE_TIME_REQUIRED');
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(now||'')||!actorEmail||!actorEmail.includes('@'))throw Error('ACCEPT_ACTOR_OR_TIME_INVALID');
  const base='projects/'+project+'/databases/'+database+'/documents';
  const doc=base+'/ams_lifecycle_audits_20_dev/'+auditId;
  const event=base+'/ams_lifecycle_outbox_20_dev/'+operationId;
  return {endpoint:'https://firestore.googleapis.com/v1/'+base+':commit',writes:[
    {update:{name:doc,fields:{status:field('ACCEPTED'),lastAuditorDecision:field('ACCEPT'),lastDecisionAt:field(now),acceptedBy:field(actorEmail.toLowerCase()),lastOperationId:field(operationId)}},updateMask:{fieldPaths:['status','lastAuditorDecision','lastDecisionAt','acceptedBy','lastOperationId']},currentDocument:{updateTime}},
    {update:{name:event,fields:{eventType:field('AUDIT_ACCEPTED'),auditId:field(auditId),operationId:field(operationId),actorEmail:field(actorEmail.toLowerCase()),sourceRevision:field(expectedRevision),status:field('PENDING'),createdAt:field(now)}},currentDocument:{exists:false}}
  ]};
}
export async function atomicAcceptCommit20({fetchImpl=fetch,getToken,...params}={}){
  if(typeof getToken!=='function')throw Error('ACCEPT_FIRESTORE_TOKEN_PROVIDER_REQUIRED');
  const commit=buildAtomicAcceptCommit20(params),token=await getToken();
  if(!token)throw Error('ACCEPT_FIRESTORE_TOKEN_REQUIRED');
  let response;
  try{response=await fetchImpl(commit.endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({writes:commit.writes}),redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw Error('ACCEPT_COMMIT_OUTCOME_UNKNOWN_RECONCILE_DO_NOT_RETRY');}
  if(!response.ok){if([409,412].includes(response.status))throw Error('ACCEPT_CONFLICT_READ_CANONICAL_STATE');throw Error('ACCEPT_COMMIT_OUTCOME_UNKNOWN_RECONCILE_DO_NOT_RETRY');}
  const body=await response.json().catch(()=>null);
  if(!Array.isArray(body?.writeResults)||body.writeResults.length!==2||!body.commitTime)throw Error('ACCEPT_COMMIT_OUTCOME_UNKNOWN_RECONCILE_DO_NOT_RETRY');
  return {success:true,operationId:params.operationId,auditId:params.auditId,commitTime:body.commitTime,atomicOutbox:true};
}
