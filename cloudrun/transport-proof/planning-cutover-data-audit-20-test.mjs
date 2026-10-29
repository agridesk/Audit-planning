import assert from 'node:assert/strict';
import {createPlanningCutoverDataAudit} from './planning-cutover-data-audit-20.js';
let auditOK=true,claimOK=true,outbox=[{operationId:'already',state:'PROJECTED'}];
const source={
 auditParity:{async verify(args){assert.equal(args.startRow,2);return {ready:auditOK,sourceAudits:115,batch:115,remaining:false,verified:auditOK?115:114,problems:auditOK?[]:[{reason:'ROW_DRIFT'}]};}},
 claimsParity:{async verify(){return {ready:claimOK,expected:1048,checked:claimOK?1048:1047,totalProblems:claimOK?0:1,problems:claimOK?[]:[{reason:'MISSING_FIRESTORE_CLAIM'}]};}},
 store:{async listOutbox({pageToken}){return pageToken?{entries:outbox.slice(1),nextPageToken:null}:{entries:outbox.slice(0,1),nextPageToken:outbox.length>1?'page2':null};}}
};
const auditor=createPlanningCutoverDataAudit(source);
assert.equal((await auditor.verify({asOfDate:'2026-10-29'})).ready,true);
auditOK=false;assert.equal((await auditor.verify({asOfDate:'2026-10-29'})).ready,false);auditOK=true;
claimOK=false;assert.equal((await auditor.verify({asOfDate:'2026-10-29'})).ready,false);claimOK=true;
outbox=[{operationId:'done',state:'PROJECTED'},{operationId:'uncertain',state:'UNCERTAIN'}];
const blocked=await auditor.verify({asOfDate:'2026-10-29'});
assert.equal(blocked.ready,false);
assert.equal(blocked.outbox.unresolved,1);
assert.equal(blocked.outbox.problems[0].operationId,'uncertain');
assert.equal((await auditor.verify({asOfDate:'2026-10-29',maxPages:1})).outbox.truncated,true);
await assert.rejects(()=>auditor.verify({maxPages:101}),/CUTOVER_DATA_AUDIT_PAGE_LIMIT_INVALID/);
console.log('Cutover readiness: full row/claim parity and no unresolved outbox needed before switch');
