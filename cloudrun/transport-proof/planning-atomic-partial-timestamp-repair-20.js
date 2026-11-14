/** One-operation DEV repair of user-entered Last_Updated date normalization.
 * Only the two previously projected Availability L cells may be rewritten.
 * Runs under a new CAS recovery token, never changes an audit or slot claim.
 */
const OPERATION='b7e8afcd18ca5c98fdd8c494924c1b79db28daffcfb4afc7daffaf4d6977416e';
const ALLOWED=new Set(['Auditor Availability!A1067:M1067','Auditor Availability!A1068:M1068']);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(x);
const sanitize=x=>String(x||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,100);
export function createPartialTimestampRepair20({store,gate,projector,appendProjector,recovery,readHeader,writeRaw,availabilityService}={}){
 if([store?.readOutbox,store?.readAudit,gate?.resumeRecovery,gate?.read,gate?.finishRecovery,
  projector?.inspect,projector?.inspectDiff,appendProjector?.inspect,appendProjector?.apply,
  recovery?.recoverOne,readHeader,writeRaw].some(fn=>typeof fn!=='function'))throw Error('PARTIAL_REPAIR_CONFIG_INVALID');
 async function commit({operationId}={}){
  if(operationId!==OPERATION)throw Error('PARTIAL_REPAIR_OPERATION_NOT_ALLOWLISTED');
  const entry=await store.readOutbox(operationId),snapshot=entry?.snapshot;
  if(entry?.state!=='UNCERTAIN'||entry.action!=='PLAN'||entry.multi===true||
     !snapshot||!Array.isArray(snapshot.projectionWrites)||
     snapshot.projectionWrites.length!==3||!Array.isArray(snapshot.projectionPreconditions)||
     snapshot.projectionPreconditions.length!==3||!Array.isArray(snapshot.appendIntents)||
     snapshot.appendIntents.length!==1||snapshot.appendIntents[0]?.range!=='Notification Queue!A:M'||
     snapshot.appendIntents[0]?.values?.length!==2)
   throw Error('PARTIAL_REPAIR_OUTBOX_CONTRACT_MISMATCH');
  const audit=await store.readAudit(entry.auditId);
  if(!audit||audit.pendingOperationId!==operationId||audit.revision!==entry.revision)
   throw Error('PARTIAL_REPAIR_FIRESTORE_CAS_MISMATCH');
  const gateBefore=await gate.read();
  if(gateBefore.holder?.state!=='RECOVERING'||gateBefore.holder.operationId!==operationId)
   throw Error('PARTIAL_REPAIR_GATE_STATE_INVALID');
  if((await readHeader())!=='Last_Updated')throw Error('PARTIAL_REPAIR_COLUMN_L_SCHEMA_MISMATCH');
  const writes=snapshot.projectionWrites;
  const first=writes.filter(w=>w.range.startsWith('Audit planning!'));
  const targeted=writes.filter(w=>ALLOWED.has(w.range));
  if(first.length!==1||targeted.length!==2||new Set(targeted.map(w=>w.range)).size!==2||
     writes.some(w=>!w.range.startsWith('Audit planning!')&&!ALLOWED.has(w.range)))
   throw Error('PARTIAL_REPAIR_WRITESET_INVALID');
  const replacement=[];
  for(const item of targeted){
   const row=item?.values?.[0];
   if(!Array.isArray(row)||row.length!==13||!stamp(row[11]))
    throw Error('PARTIAL_REPAIR_TIMESTAMP_SHAPE_INVALID');
   replacement.push({range:item.range.replace(/^Auditor Availability!A(\d+):M\d+$/,'Auditor Availability!L$1'),value:row[11]});
  }
  const before=await projector.inspect(snapshot);
  const diff=await projector.inspectDiff(snapshot);
  const alerts=await appendProjector.inspect(snapshot.appendIntents);
  if(!['MISSING','MATCH'].includes(alerts.state)||diff.length!==3)
   throw Error('PARTIAL_REPAIR_APPEND_OR_DIFF_INVALID');
  const byRange=new Map(diff.map(x=>[x.range,x]));
  if(!first.every(x=>byRange.get(x.range)?.differingCount===0)||
     !targeted.every(x=>{const d=byRange.get(x.range);return d?.differingCount===1&&d.differing?.[0]?.column===12&&d.matchedTarget===12;}))
   throw Error('PARTIAL_REPAIR_NOT_TIMESTAMP_ONLY');
  if(before.state!=='CONFLICT')throw Error('PARTIAL_REPAIR_STATE_CHANGED');
  // Validate all evidence again under exclusive rotated recovery token.
  const holder=await gate.resumeRecovery({operationId});
  let stage='RECHECK',mutation=false;
  try{
   const newOutbox=await store.readOutbox(operationId),newAudit=await store.readAudit(entry.auditId);
   if(newOutbox?.state!==entry.state||newAudit?.pendingOperationId!==operationId||
      newAudit.revision!==entry.revision)throw Error('PARTIAL_REPAIR_CANONICAL_CHANGED');
   const fresh=await projector.inspectDiff(snapshot);
   if(fresh.length!==diff.length||fresh.some((x,i)=>x.range!==diff[i].range||
      x.differingCount!==diff[i].differingCount||
      JSON.stringify(x.differing.map(v=>v.column))!==JSON.stringify(diff[i].differing.map(v=>v.column))))
    throw Error('PARTIAL_REPAIR_SOURCE_CHANGED');
   stage='REPAIR_LAST_UPDATED';
   mutation=true;
   await writeRaw({operationId,token:holder.token,replacement});
   stage='VERIFY_ALL_ROWS';
   const checked=await projector.inspect(snapshot);
   if(checked.state!=='MATCH')throw Error('PARTIAL_REPAIR_FULL_ROW_UNVERIFIED');
   stage='APPEND_NOTIFICATIONS';
   await appendProjector.apply({operationId,gateToken:holder.token,intents:snapshot.appendIntents});
   stage='VERIFY_NOTIFICATIONS';
   const notif=await appendProjector.inspect(snapshot.appendIntents);
   if(notif.state!=='MATCH')throw Error('PARTIAL_REPAIR_NOTIFICATIONS_UNVERIFIED');
  }catch(error){
   if(typeof gate.recordRecoveryFailure==='function')
    await gate.recordRecoveryFailure({operationId,token:holder.token,stage,code:sanitize(error?.message)}).catch(()=>{});
   console.error('[AMS_PARTIAL_TIMESTAMP_REPAIR_FAILED]',JSON.stringify({operationId,stage,errorCode:sanitize(error?.message),mutation}));
   // Even before a write, preserve the fence. A separate read-only inspection
   // must prove state before any subsequent takeover.
   throw Error('PARTIAL_REPAIR_BLOCKED_'+stage+'_'+sanitize(error?.message));
  }
  await gate.finishRecovery({operationId,token:holder.token});
  const result=await recovery.recoverOne(entry);
  if(result.state!=='PROJECTED')throw Error('PARTIAL_REPAIR_SETTLEMENT_UNVERIFIED');
  return {success:true,operationId,projected:true,recovered:true};
 }
 return Object.freeze({commit});
}
