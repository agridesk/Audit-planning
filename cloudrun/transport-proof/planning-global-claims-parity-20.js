/** DEV-only read-only global occupancy audit.
 * Local per-audit indexes alone cannot find orphaned Firestore claims from an
 * interrupted backfill. Compare the entire claims collection with the
 * canonical live future slots derived from the unchanged Sheets source.
 */
import {createHash} from 'node:crypto';
import {preparePlanningBackfill} from './planning-atomic-backfill-20.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function createPlanningGlobalClaimsParity({store,readPlanningRows,getRoster}={}){
 if(typeof store?.listClaims!=='function'||typeof readPlanningRows!=='function'||typeof getRoster!=='function')throw Error('CLAIMS_PARITY_CONFIG_INVALID');
 async function verify({asOfDate=new Date().toISOString().slice(0,10),maxPages=50}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('CLAIMS_PARITY_PAGE_LIMIT_INVALID');
  const source=preparePlanningBackfill({rows:await readPlanningRows(),roster:await getRoster(),asOfDate});
  const sourceManifest=sha(JSON.stringify([asOfDate,source.items.map(x=>[x.auditId,x.snapshot.sourceRow,x.snapshot.headers,x.snapshot.row,x.auditorId,x.blocks])]));
  const expected=new Map();
  for(const item of source.items)for(const block of item.blocks){
   const [startHour,startMinute]=block.start.split(':').map(Number),[endHour,endMinute]=block.end.split(':').map(Number);
   for(let minute=startHour*60+startMinute;minute<endHour*60+endMinute;minute+=15){
    const claimId=sha(item.auditorId+'|'+block.date+'|'+minute);
    if(expected.has(claimId))throw Error('CLAIMS_PARITY_SOURCE_DUPLICATE');
    expected.set(claimId,{auditId:item.auditId,auditorId:item.auditorId,date:block.date,minute});
   }
  }
  const seen=new Set(),observed=[],problems=[],pageTokens=new Set();let token='',pages=0,checked=0,truncated=false;
  do{
   if(pages>=maxPages){truncated=true;break;}
   if(pageTokens.has(token))throw Error('CLAIMS_PARITY_PAGINATION_LOOP');
   pageTokens.add(token);
   const response=await store.listClaims({pageSize:200,pageToken:token});
   pages++;
   if(!Array.isArray(response?.claims)||response.claims.length>200)throw Error('CLAIMS_PARITY_INVALID_PAGE');
   for(const claim of response.claims){
    checked++;
    const id=claim?.claimId;
    if(typeof id!=='string'||!id){problems.push({reason:'INVALID_CLAIM_ID'});continue;}
    if(seen.has(id)){problems.push({reason:'DUPLICATE_FIRESTORE_CLAIM',claimId:id});continue;}
    seen.add(id);
    observed.push([id,claim.auditId,claim.auditorId,claim.date,claim.minute]);
    const target=expected.get(id);
    if(!target){problems.push({reason:'ORPHAN_OR_UNEXPECTED_CLAIM',claimId:id});continue;}
    if(target.auditId!==claim.auditId||target.auditorId!==claim.auditorId||target.date!==claim.date||target.minute!==claim.minute)problems.push({reason:'CLAIM_IDENTITY_MISMATCH',claimId:id});
   }
   const next=response.nextPageToken||'';
   if(next&&(!response.claims.length||next===token))throw Error('CLAIMS_PARITY_PAGINATION_STALLED');
   token=next;
  }while(token);
  if(!truncated)for(const id of expected.keys())if(!seen.has(id))problems.push({reason:'MISSING_FIRESTORE_CLAIM',claimId:id});
  observed.sort((a,b)=>a[0].localeCompare(b[0]));
  const claimsFingerprint=sha(JSON.stringify(observed));
  return {ready:!truncated&&!problems.length,claimsFingerprint,sourceManifest,asOfDate,expected:expected.size,checked,pages,truncated,problems:problems.slice(0,100),totalProblems:problems.length};
 }
 return Object.freeze({verify});
}
