/** DEV-only recovery of one quarantined Reject with a coerced contact phone. */
import {isDeepStrictEqual} from 'node:util';
const OPERATION='45b4763f8c3300eac8f6b82dad15efd41438ae119df815bb8e05d8d30e5048cb';
const RANGES=[
 'Audit planning!A95:BS95','Audit_Obligations!A173:AA173',
 'Audit_Visit_Obligations!A173:F173','Auditor Availability!A237:M237',
 'Auditor Availability!A240:M240','Companies!A84:Y84','Company_Scopes!A173:M173'
];
const safe=x=>String(x||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,100);

export function createRejectPhoneRecovery20({store,gate,projector,appendProjector,recovery,readPhone,writePhone}={}){
 if([store?.readOutbox,store?.readAudit,gate?.read,gate?.beginRecovery,gate?.finishRecovery,
  gate?.recordRecoveryFailure,projector?.inspect,projector?.inspectDiff,appendProjector?.inspect,
  appendProjector?.apply,recovery?.recoverOne,readPhone,writePhone].some(x=>typeof x!=='function'))
  throw Error('REJECT_PHONE_RECOVERY_CONFIG_INVALID');

 async function inspect({operationId}={}){
  if(operationId!==OPERATION)throw Error('REJECT_PHONE_OPERATION_NOT_ALLOWLISTED');
  const entry=await store.readOutbox(operationId),s=entry?.snapshot;
  if(entry?.operationId!==operationId||entry.state!=='UNCERTAIN'||entry.action!=='REJECT'||
     entry.multi!==true||!entry.auditId||!Array.isArray(entry.entities)||entry.entities.length!==1||
     entry.entities[0].auditId!==entry.auditId||!s||
     !Array.isArray(s.projectionWrites)||!Array.isArray(s.projectionPreconditions)||
     s.projectionWrites.length!==RANGES.length||s.projectionPreconditions.length!==RANGES.length||
     !RANGES.every((r,i)=>s.projectionWrites[i]?.range===r&&s.projectionPreconditions[i]?.range===r)||
     !Array.isArray(s.successorSnapshots)||s.successorSnapshots.length!==0||
     !Array.isArray(s.appendIntents)||s.appendIntents.length!==2||
     s.appendIntents[0]?.range!=='Rejected audits!A:M'||s.appendIntents[0]?.values?.length!==1||
     s.appendIntents[1]?.range!=='Notification Queue!A:M'||s.appendIntents[1]?.values?.length!==2)
   throw Error('REJECT_PHONE_OUTBOX_CONTRACT_MISMATCH');
  const audit=await store.readAudit(entry.auditId);
  if(audit?.pendingOperationId!==operationId||audit.revision!==entry.entities[0].revision||
     String(audit.snapshot?.status||'').toUpperCase()!=='REJECTED')
   throw Error('REJECT_PHONE_CANONICAL_MISMATCH');
  const holder=(await gate.read()).holder;
  if(holder?.operationId!==operationId||!['UNCERTAIN','RECOVERING'].includes(holder.state))
   throw Error('REJECT_PHONE_GATE_MISMATCH');
  const company=s.projectionWrites[5]?.values?.[0],before=s.projectionPreconditions[5]?.before;
  if(!Array.isArray(company)||!Array.isArray(before)||company.length!==25||before.length!==25||
     typeof company[4]!=='string'||company[4]!==before[4]||
     !/^\+\d{1,3}-\d{3,15}$/.test(company[4]))
   throw Error('REJECT_PHONE_FROZEN_VALUE_INVALID');
  const parts=/^\+(\d+)-(\d+)$/.exec(company[4]);
  const a=Number(parts[1]),b=Number(parts[2]);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(a-b))
   throw Error('REJECT_PHONE_FROZEN_VALUE_INVALID');
  const observed=await readPhone();
  if(observed?.header!=='Contactperson phone'||![company[4],'='+company[4]].includes(observed.formula)||
     ![company[4],'='+company[4]].includes(observed.entered?.formulaValue)||
     typeof observed.value!=='number'||observed.value!==a-b)
   throw Error('REJECT_PHONE_FORMULA_MISMATCH');
  const rows=await projector.inspect(s),diff=await projector.inspectDiff(s);
  const appends=await appendProjector.inspect(s.appendIntents);
  if(rows.state!=='CONFLICT'||diff.length!==RANGES.length||
     diff.some((d,i)=>d.range!==RANGES[i]||d.differingCount!==(i===5?1:0)||
       i===5&&(d.differing?.length!==1||d.differing[0].column!==5))||
     !['MISSING','MATCH'].includes(appends.state)||appends.count!==3)
   throw Error('REJECT_PHONE_PROJECTION_CONFLICT');
  return {entry,phone:company[4],appendState:appends.state};
 }

 async function preview({operationId}={}){
  const result=await inspect({operationId});
  return {success:true,readonly:true,operationId,phoneFormulaVerified:true,appendState:result.appendState};
 }
 async function diagnose({operationId}={}){
  if(operationId!==OPERATION)throw Error('REJECT_PHONE_OPERATION_NOT_ALLOWLISTED');
  const entry=await store.readOutbox(operationId);
  const item=entry?.snapshot?.projectionWrites?.find(x=>x.range==='Companies!A84:Y84');
  const phone=item?.values?.[0]?.[4];
  if(typeof phone!=='string'||!/^\+\d{1,3}-\d{3,15}$/.test(phone))
   throw Error('REJECT_PHONE_FROZEN_VALUE_INVALID');
  const parts=/^\+(\d+)-(\d+)$/.exec(phone),observed=await readPhone();
  return {success:true,readonly:true,header:observed.header,
   formulaType:typeof observed.formula,valueType:typeof observed.value,
   formulaMatchesWithPlus:observed.formula==='='+phone,
   formulaMatchesWithoutPlus:observed.formula==='='+phone.slice(1),
   formulaMatchesOriginal:observed.formula===phone,
   enteredType:observed.entered&&Object.keys(observed.entered)[0]||'missing',
   enteredFormulaMatches:!!observed.entered&&[phone,'='+phone].includes(observed.entered.formulaValue),
   numericMatches:observed.value===Number(parts[1])-Number(parts[2])};
 }
 async function commit({operationId}={}){
  const first=await inspect({operationId});
  const holder=await gate.beginRecovery({operationId});
  let mutation=false,stage='RECHECK';
  try{
   const current=await inspect({operationId});
   if(!isDeepStrictEqual(current.entry,first.entry)||current.phone!==first.phone)
    throw Error('REJECT_PHONE_OUTBOX_CHANGED');
   stage='RESTORE_PHONE';mutation=true;
   await writePhone({operationId,token:holder.token,value:current.phone});
   stage='VERIFY_ROWS';
   if((await projector.inspect(current.entry.snapshot)).state!=='MATCH')
    throw Error('REJECT_PHONE_ROWS_UNVERIFIED');
   stage='APPEND';
   await appendProjector.apply({operationId,gateToken:holder.token,intents:current.entry.snapshot.appendIntents});
   stage='VERIFY_APPEND';
   if((await appendProjector.inspect(current.entry.snapshot.appendIntents)).state!=='MATCH'||
      (await projector.inspect(current.entry.snapshot)).state!=='MATCH')
    throw Error('REJECT_PHONE_FINAL_PROOF_FAILED');
  }catch(error){
   if(!mutation){await gate.finishRecovery({operationId,token:holder.token});throw error;}
   await gate.recordRecoveryFailure({operationId,token:holder.token,stage,code:safe(error?.message)});
   throw Error('REJECT_PHONE_RECOVERY_UNCERTAIN_'+stage+'_'+safe(error?.message));
  }
  await gate.finishRecovery({operationId,token:holder.token});
  const settled=await recovery.recoverOne(first.entry);
  if(settled.state!=='PROJECTED')throw Error('REJECT_PHONE_SETTLEMENT_UNVERIFIED');
  return {success:true,operationId,state:'PROJECTED'};
 }
 return Object.freeze({preview,diagnose,commit});
}
