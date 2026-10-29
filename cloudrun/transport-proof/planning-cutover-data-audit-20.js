/** Read-only DEV cutover evidence.
 * A per-audit parity report alone is insufficient: verify every Firestore
 * occupancy claim and make sure no unresolved operation remains in the outbox.
 */
import {createHash} from 'node:crypto';
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createPlanningCutoverDataAudit({auditParity,claimsParity,store}={}){
 if(typeof auditParity?.verify!=='function'||typeof claimsParity?.verify!=='function'||typeof store?.listOutbox!=='function')throw Error('CUTOVER_DATA_AUDIT_DEPENDENCIES_INVALID');
 async function verify({asOfDate=new Date().toISOString().slice(0,10),maxPages=50}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('CUTOVER_DATA_AUDIT_PAGE_LIMIT_INVALID');
  let row=2,pages=0,verified=0,total=null,ready=true,manifest=null;
  const errors=[];
  do{
   if(pages>=maxPages){ready=false;errors.push({reason:'AUDIT_PAGINATION_TRUNCATED'});break;}
   const part=await auditParity.verify({startRow:row,limit:250,asOfDate});
   pages++;
   if(manifest===null)manifest=part.sourceManifest||null;
   else if(manifest!==part.sourceManifest)throw Error('CUTOVER_AUDIT_SOURCE_CHANGED_DURING_SCAN');
   if(total===null)total=part.sourceAudits;
   if(total!==part.sourceAudits||!Number.isSafeInteger(part.verified)||!Number.isSafeInteger(part.batch)||part.batch<0||part.batch>250)throw Error('CUTOVER_AUDIT_PAGE_INVALID');
   verified+=part.verified;
   errors.push(...(part.problems||[]));
   if(!part.remaining)break;
   if(!Number.isSafeInteger(part.nextRow)||part.nextRow<=row||part.batch===0)throw Error('CUTOVER_AUDIT_PAGINATION_STALLED');
   row=part.nextRow;
  }while(true);
  if(verified!==total||errors.length)ready=false;
  const audits={ready,sourceManifest:manifest,sourceAudits:total??0,verified,pages,problems:errors.slice(0,100)};
  const claims=await claimsParity.verify({asOfDate,maxPages});
  if(typeof audits.sourceManifest!=='string'||!/^[0-9a-f]{64}$/.test(audits.sourceManifest)||typeof claims.sourceManifest!=='string'||!/^[0-9a-f]{64}$/.test(claims.sourceManifest))throw Error('CUTOVER_SOURCE_MANIFEST_MISSING');
  if(audits.sourceManifest&&claims.sourceManifest&&audits.sourceManifest!==claims.sourceManifest)throw Error('CUTOVER_SOURCE_CHANGED_BETWEEN_AUDIT_AND_CLAIMS');
  // Two complete bounded sweeps catch an outbox changing during pagination.
  // This is stability evidence, NOT an atomic Firestore/Sheets snapshot.
  async function scanOutbox(){
   let token='',pages=0,count=0,unresolved=0,truncated=false;const problems=[],seen=new Set(),items=[];
   do{
    if(pages>=maxPages){truncated=true;break;}
    const r=await store.listOutbox({pageSize:200,pageToken:token});pages++;
    if(!Array.isArray(r?.entries)||r.entries.length>200)throw Error('CUTOVER_DATA_AUDIT_OUTBOX_INVALID');
    for(const entry of r.entries){
     const id=entry?.operationId;
     if(typeof id!=='string'||!id||seen.has(id))throw Error('CUTOVER_OUTBOX_DUPLICATE_OR_INVALID_ID');
     seen.add(id);count++;
     // Compare complete records, not just state, to detect a torn/replaced operation.
     items.push([id,fingerprint(entry)]);
     if(entry.state!=='PROJECTED'){
      unresolved++;
      if(problems.length<100)problems.push({operationId:id,state:String(entry.state||'MISSING')});
     }
    }
    const next=r.nextPageToken||'';
    if(next&&next===token)throw Error('CUTOVER_OUTBOX_PAGINATION_STALLED');
    token=next;
   }while(token);
   items.sort((x,y)=>x[0].localeCompare(y[0]));
   return {checked:count,unresolved,pages,truncated,problems,signature:fingerprint(items)};
  }
  const initialOutbox=await scanOutbox();
  const claimsAgain=await claimsParity.verify({asOfDate,maxPages});
  if(claimsAgain.sourceManifest!==audits.sourceManifest)throw Error('CUTOVER_SOURCE_CHANGED_DURING_SECOND_CLAIM_SCAN');
  const finalOutbox=await scanOutbox();
  if(initialOutbox.signature!==finalOutbox.signature||initialOutbox.truncated!==finalOutbox.truncated)throw Error('CUTOVER_OUTBOX_CHANGED_DURING_SCAN');
  if(claims.ready!==claimsAgain.ready||claims.expected!==claimsAgain.expected||claims.checked!==claimsAgain.checked||claims.totalProblems!==claimsAgain.totalProblems||(claims.claimsFingerprint!==undefined||claimsAgain.claimsFingerprint!==undefined ? claims.claimsFingerprint!==claimsAgain.claimsFingerprint : false)||claimsAgain.ready!==true)throw Error('CUTOVER_CLAIMS_CHANGED_DURING_SCAN');
  const finalSource=await auditParity.verify({startRow:2,limit:1,asOfDate});
  if(finalSource.sourceManifest!==audits.sourceManifest)throw Error('CUTOVER_SOURCE_CHANGED_AFTER_OUTBOX_SCAN');
  const outbox={checked:finalOutbox.checked,unresolved:finalOutbox.unresolved,pages:finalOutbox.pages,truncated:finalOutbox.truncated,problems:finalOutbox.problems};
  return {
   ready:audits.ready===true&&claims.ready===true&&!outbox.truncated&&!outbox.unresolved,
   asOfDate,audits:{ready:audits.ready,expected:audits.sourceAudits,verified:audits.verified,problems:audits.problems},
   claims:{ready:claims.ready,expected:claims.expected,checked:claims.checked,totalProblems:claims.totalProblems,problems:claims.problems},
   outbox
  };
 }
 return Object.freeze({verify});
}
