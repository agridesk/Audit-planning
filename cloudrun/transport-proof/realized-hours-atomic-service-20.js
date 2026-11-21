import {createHash,createHmac} from 'node:crypto';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=value=>String(value??'').trim();
function column(index){
 let label='';
 for(let value=index+1;value;value=Math.floor((value-1)/26))label=String.fromCharCode(65+(value-1)%26)+label;
 return label;
}

export function createRealizedHoursAtomicService20({store,gate,project,readLog,roster,signingKey}){
 async function commit({actor,body,onCommitted}){
  const auditId=text(body?.auditId),actorId=text(actor?.auditorId),requestId=text(body?.requestId);
  const oldHours=body?.expectedHoursDedicated,newHours=body?.hoursDedicated;
  const operationId=digest({auditId,actorId,requestId,oldHours,newHours});
  let lock,attempted=false,committed=false,projected=false;
  try{
   if(actor?.role!=='manager'||!actorId||!text(actor.email)||!auditId||!(/^[a-f0-9-]{36}$/i.test(requestId))||
      !Number.isFinite(oldHours)||!Number.isFinite(newHours)||newHours<=0||!Number.isInteger(newHours*4))
    throw Error('REALIZED_HOURS_INVALID_INPUT');
   const prior=await store.readOutbox(operationId);
   if(prior){
    if(prior.action!=='REALIZED_HOURS'||prior.auditId!==auditId||prior.actorId!==actorId)throw Error('REALIZED_HOURS_REPLAY_CONFLICT');
    if(prior.state!=='PROJECTED'){attempted=true;throw Error('REALIZED_HOURS_RECOVERY_REQUIRED');}
    return {success:true,auditId,operationId,newHoursDedicated:newHours,projection:'PROJECTED',replayed:true};
   }
   lock=await gate.acquire({operationId,actorId,kind:'ATOMIC_REALIZED_HOURS'});
   if(!signingKey)throw Error('REALIZED_HOURS_SIGNING_KEY_NOT_CONFIGURED');
   const [audit,rows,actors]=await Promise.all([store.readAudit(auditId),readLog(),roster()]);
   if(!actors.some(record=>record.role==='manager'&&record.active&&record.email===text(actor.email).toLowerCase()))
    throw Error('REALIZED_HOURS_ACTIVE_MANAGER_REQUIRED');
   if(audit&&(audit.removed!==true||audit.snapshot?.status!=='Completed'||audit.pendingOperationId))throw Error('REALIZED_HOURS_COMPLETED_CANONICAL_REQUIRED');
   if(!Array.isArray(rows)||rows.length>=10000)throw Error('REALIZED_HOURS_LOG_INCOMPLETE');
   const headers=(rows[0]||[]).map(value=>text(value).toLowerCase());
   const [id,status,hours]=['audit id','status','hours dedicated'].map(label=>headers.indexOf(label));
   if([id,status,hours].includes(-1))throw Error('REALIZED_HOURS_LOG_SCHEMA_INVALID');
   const matches=rows.map((row,index)=>({row,index})).slice(1).filter(({row})=>text(row[id])===auditId);
   if(matches.length!==1||text(matches[0].row[status]).toLowerCase()!=='completed')throw Error('REALIZED_HOURS_LOG_IDENTITY_CONFLICT');
   const {row,index}=matches[0];
   if(text(row[hours])===''||Number(row[hours])!==oldHours||
      (audit?.snapshot.hoursDedicated!==undefined&&audit.snapshot.hoursDedicated!==oldHours))throw Error('STALE_REALIZED_HOURS');
   if(oldHours===newHours)return {success:true,auditId,newHoursDedicated:newHours,changed:false};
   // Fence on the full archived row so a shifted row cannot receive the correction.
   const range='Log realized audits!A'+(index+1)+':'+column(headers.length-1)+(index+1);
   const next=row.slice();next[hours]=newHours;
   const timestamp=new Date().toISOString(),type='COMPLETED_HOURS_OVERRIDE';
   const payload={type,auditId,auditNumber:'',company:'',actorEmail:actor.email,actorRole:'MANAGER',beforeStatus:'Completed',afterStatus:'Completed',reason:'Manager realized-hours correction',hours:newHours,oldHoursDedicated:oldHours,newHoursDedicated:newHours,timestamp,source:'CloudRun.RealizedHoursAtomic',action:''};
   const signature=createHmac('sha256',signingKey).update(type+'|'+auditId+'|'+timestamp+'|').digest('base64url');
   const trail=[timestamp.slice(0,16).replace('T',' '),'AUDIT_TRAIL',type,'',auditId,'','[TRAIL] '+type+' :: '+auditId,JSON.stringify(payload),0,'',signature,'',JSON.stringify({payload})];
   const plan={auditId,realizedHoursCorrection:true,projectionWrites:[{range,values:[next]}],projectionPreconditions:[{range,before:row}],appendIntents:[{range:'Notification Queue!A:M',values:[trail]}]};
   attempted=true;
   const saved=await store.commitRealizedHours({auditId,operationId,actorId,expectedRevision:audit?.revision??null,oldHours,newHours,projectionPlan:plan});
   committed=true;
   if(saved.replayed)throw Error('REALIZED_HOURS_UNEXPECTED_REPLAY');
   const receipt={auditId,operationId,action:'REALIZED_HOURS',newHoursDedicated:newHours};
   try{onCommitted?.(receipt);}catch{console.warn('[AMS_REALIZED_HOURS_RECEIPT_FAILED]');}
   const [archive,queue]=await project({operationId,gateToken:lock.token,plan});
   if(archive.state!=='MATCH'||queue.state!=='MATCH')throw Error('REALIZED_HOURS_PROJECTION_UNVERIFIED');
   await store.markProjected({auditId,operationId,proof:{verified:true,auditId,rowHash:digest({archive:archive.detail,queue:queue.count})}});
   projected=true;
   return {success:true,...receipt,projection:'PROJECTED'};
  }catch(error){
   error.operationId=operationId;
   error.writeOutcome=projected?'PROJECTED':committed?'COMMITTED':attempted?'UNKNOWN':'NOT_COMMITTED';
   throw error;
  }finally{
   if(lock){
    if(projected||!attempted)await gate.release({token:lock.token,verified:true,proof:projected?'REALIZED_HOURS_PROJECTED':'REALIZED_HOURS_NO_WRITE'});
    else{
     if(committed)await store.markUncertain({auditId,operationId,reason:'REALIZED_HOURS_PROJECTION_UNVERIFIED'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'REALIZED_HOURS_WRITE_UNCONFIRMED'});
    }
   }
  }
 }
 return {commit};
}

export function createRealizedHoursBatchProjector20({readArchive,readTrail,readTabs,writeBatch,verifyFence}){
 return async function project({operationId,gateToken,plan}){
  const [write]=plan.projectionWrites,[precondition]=plan.projectionPreconditions,[intent]=plan.appendIntents;
  const row=/^Log realized audits!A([2-9]\d*|1\d+):[A-Z]+\1$/.exec(write.range);
  const before=precondition.before,after=write.values[0];
  const changed=after.map((value,index)=>value!==before[index]?index:-1).filter(index=>index>=0);
  if(!row||write.range!==precondition.range||before.length!==after.length||changed.length!==1||
     !Number.isFinite(after[changed[0]])||intent.range!=='Notification Queue!A:M'||intent.values.length!==1)
   throw Error('REALIZED_HOURS_BATCH_PLAN_INVALID');
  const fence={operationId,gateToken},started=Date.now();
  await verifyFence(fence);
  const [archive,trail,tabs]=await Promise.all([readArchive(plan),readTrail(plan.appendIntents),readTabs()]);
  const readyMs=Date.now()-started;
  if(!['READY','MATCH'].includes(archive.state)||!['MISSING','MATCH'].includes(trail.state))
   throw Error('REALIZED_HOURS_BATCH_PRECONDITION_CONFLICT');
  const requests=[];
  const cell=value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}});
  const sheetId=title=>{
   const id=tabs.find(tab=>tab.properties?.title===title)?.properties?.sheetId;
   if(!Number.isInteger(id))throw Error('REALIZED_HOURS_BATCH_SHEET_MISSING');
   return id;
  };
  if(archive.state==='READY')requests.push({updateCells:{
   start:{sheetId:sheetId('Log realized audits'),rowIndex:Number(row[1])-1,columnIndex:changed[0]},
   rows:[{values:[cell(after[changed[0]])]}],fields:'userEnteredValue'
  }});
  if(trail.state==='MISSING')requests.push({appendCells:{sheetId:sheetId('Notification Queue'),
   rows:[{values:intent.values[0].map(cell)}],fields:'userEnteredValue'}});
  const writeStarted=Date.now();
  if(requests.length){
   await verifyFence(fence);
   await writeBatch(requests);
  }
  const verifyStarted=Date.now();
  const verified=await Promise.all([readArchive(plan),readTrail(plan.appendIntents)]);
  await verifyFence(fence);
  console.info('[AMS_REALIZED_HOURS_BATCH_TIMING]',JSON.stringify({operationId,readyMs,writeMs:verifyStarted-writeStarted,verifyMs:Date.now()-verifyStarted}));
  return verified;
 };
}
