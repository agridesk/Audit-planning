/** Read-only DEV cutover evidence.
 * A per-audit parity report alone is insufficient: verify every Firestore
 * occupancy claim and make sure no unresolved operation remains in the outbox.
 */
export function createPlanningCutoverDataAudit({auditParity,claimsParity,store}={}){
 if(typeof auditParity?.verify!=='function'||typeof claimsParity?.verify!=='function'||typeof store?.listOutbox!=='function')throw Error('CUTOVER_DATA_AUDIT_DEPENDENCIES_INVALID');
 async function verify({asOfDate=new Date().toISOString().slice(0,10),maxPages=50}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('CUTOVER_DATA_AUDIT_PAGE_LIMIT_INVALID');
  const audits=await auditParity.verify({startRow:2,limit:250,asOfDate});
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
