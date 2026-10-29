/** Read-only DEV cutover evidence.
 * A per-audit parity report alone is insufficient: verify every Firestore
 * occupancy claim and make sure no unresolved operation remains in the outbox.
 */
export function createPlanningCutoverDataAudit({auditParity,claimsParity,store}={}){
 if(typeof auditParity?.verify!=='function'||typeof claimsParity?.verify!=='function'||typeof store?.listOutbox!=='function')throw Error('CUTOVER_DATA_AUDIT_DEPENDENCIES_INVALID');
 async function verify({asOfDate=new Date().toISOString().slice(0,10),maxPages=50}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('CUTOVER_DATA_AUDIT_PAGE_LIMIT_INVALID');
  let row=2,pages=0,verified=0,total=null,ready=true;
  const errors=[];
  do{
   if(pages>=maxPages){ready=false;errors.push({reason:'AUDIT_PAGINATION_TRUNCATED'});break;}
   const part=await auditParity.verify({startRow:row,limit:250,asOfDate});
   pages++;
   if(total===null)total=part.sourceAudits;
   if(total!==part.sourceAudits||!Number.isSafeInteger(part.verified)||!Number.isSafeInteger(part.batch)||part.batch<0||part.batch>250)throw Error('CUTOVER_AUDIT_PAGE_INVALID');
   verified+=part.verified;
   errors.push(...(part.problems||[]));
   if(!part.remaining)break;
   if(!Number.isSafeInteger(part.nextRow)||part.nextRow<=row||part.batch===0)throw Error('CUTOVER_AUDIT_PAGINATION_STALLED');
   row=part.nextRow;
  }while(true);
  if(verified!==total||errors.length)ready=false;
  const audits={ready,sourceAudits:total??0,verified,pages,problems:errors.slice(0,100)};
  const claims=await claimsParity.verify({asOfDate,maxPages});
  let token='',pages=0,count=0,unresolved=0,truncated=false;const problems=[];
  do{
   if(pages>=maxPages){truncated=true;break;}
   const r=await store.listOutbox({pageSize:200,pageToken:token});pages++;
   if(!Array.isArray(r?.entries)||r.entries.length>200)throw Error('CUTOVER_DATA_AUDIT_OUTBOX_INVALID');
   count+=r.entries.length;
   for(const entry of r.entries){
    if(entry?.state!=='PROJECTED'){
     unresolved++;
     if(problems.length<100)problems.push({operationId:String(entry?.operationId||''),state:String(entry?.state||'MISSING')});
    }
   }
   token=r.nextPageToken||'';
  }while(token);
  return {
   ready:audits.ready===true&&claims.ready===true&&!truncated&&!unresolved,
   asOfDate,audits:{ready:audits.ready,expected:audits.sourceAudits,verified:audits.verified,problems:audits.problems},
   claims:{ready:claims.ready,expected:claims.expected,checked:claims.checked,totalProblems:claims.totalProblems,problems:claims.problems},
   outbox:{checked:count,unresolved,pages,truncated,problems}
  };
 }
 return Object.freeze({verify});
}
