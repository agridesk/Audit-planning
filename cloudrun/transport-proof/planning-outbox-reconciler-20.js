/** Read-only discovery and conservative outbox recovery.
 * Never infers that an absent Sheets row permits a retry; recovery only
 * confirms a projection after independent evidence MATCH.
 */
export function createPlanningOutboxReconciler({adapter,authority,verify,limit=500}={}){
 if(typeof adapter?.listPage!=='function'||typeof authority?.read!=='function'||typeof authority?.transition!=='function'||typeof verify!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('OUTBOX_RECONCILER_CONFIG_INVALID');
 async function scan(){
  let pageToken='',count=0,verified=0,unresolved=0,errors=0,pages=0;
  do{
   const result=await adapter.listPage({pageSize:Math.min(100,limit-count),pageToken});
   pages++;
   if(!Array.isArray(result.documents)||pages>Math.ceil(limit/1)+1)throw Error('OUTBOX_SCAN_INVALID');
   for(const {id,document} of result.documents){
    count++;
    if(!document?.commits?.length)continue;
    for(const c of document.commits.filter(x=>['PENDING','UNCERTAIN'].includes(x.state))){
     try{
      if(!c.projectionPayload||!c.projectionDigest){unresolved++;continue;}
      const evidence=await verify(c);
      if(evidence?.state==='MATCH'){
       await authority.transition({auditId:id,commitId:c.id,from:c.state,to:'PROJECTED',detail:'RECONCILED_VERIFIED_PROJECTION'});
       verified++;
      }else unresolved++;
     }catch{errors++;unresolved++;}
    }
   }
   pageToken=result.nextPageToken||'';
   if(count>=limit)break;
  }while(pageToken);
  return {count,verified,unresolved,errors,truncated:!!pageToken};
 }
 return Object.freeze({scan});
}
