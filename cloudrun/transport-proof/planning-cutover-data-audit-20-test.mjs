import assert from 'node:assert/strict';
import {createPlanningCutoverDataAudit} from './planning-cutover-data-audit-20.js';
let auditOK=true,claimOK=true,outbox=[{operationId:'already',state:'PROJECTED'}];
const source={
 auditParity:{async verify(args){assert.equal(args.startRow,2);return {ready:auditOK,sourceManifest:'a'.repeat(64),sourceAudits:115,batch:115,remaining:false,verified:auditOK?115:114,problems:auditOK?[]:[{reason:'ROW_DRIFT'}]};}},
 claimsParity:{async verify(){return {sourceManifest:'a'.repeat(64),ready:claimOK,expected:1048,checked:claimOK?1048:1047,totalProblems:claimOK?0:1,problems:claimOK?[]:[{reason:'MISSING_FIRESTORE_CLAIM'}]};}},
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
let pageManifest='a'.repeat(64);
const paged=createPlanningCutoverDataAudit({
 auditParity:{async verify({startRow}){
  if(startRow===2)return {sourceManifest:'a'.repeat(64),sourceAudits:300,batch:250,verified:250,remaining:true,nextRow:252,problems:[]};
  return {sourceManifest:pageManifest,sourceAudits:300,batch:50,verified:50,remaining:false,problems:[]};
 }},
 claimsParity:source.claimsParity,
 store:{async listOutbox(){return {entries:[],nextPageToken:null};}}
});
outbox=[];
assert.equal((await paged.verify({asOfDate:'2026-10-29'})).ready,true);
pageManifest='b'.repeat(64);
await assert.rejects(()=>paged.verify({asOfDate:'2026-10-29'}),/CUTOVER_AUDIT_SOURCE_CHANGED_DURING_SCAN/);
const mismatch=createPlanningCutoverDataAudit({
 auditParity:{async verify(){return {sourceManifest:'a'.repeat(64),sourceAudits:1,batch:1,verified:1,remaining:false,problems:[]};}},
 claimsParity:{async verify(){return {sourceManifest:'b'.repeat(64),ready:true,expected:0,checked:0,totalProblems:0,problems:[]};}},
 store:{async listOutbox(){return {entries:[],nextPageToken:null};}}
});
await assert.rejects(()=>mismatch.verify(),/CUTOVER_SOURCE_CHANGED_BETWEEN_AUDIT_AND_CLAIMS/);
let sourceVersion='a';
const sourceDrift=createPlanningCutoverDataAudit({
 auditParity:{async verify(){return {sourceManifest:sourceVersion.repeat(64),sourceAudits:1,batch:1,verified:1,remaining:false,problems:[]};}},
 claimsParity:{async verify(){return {sourceManifest:'a'.repeat(64),ready:true,expected:0,checked:0,totalProblems:0,problems:[]};}},
 store:{async listOutbox(){sourceVersion='b';return {entries:[],nextPageToken:null};}}
});
await assert.rejects(()=>sourceDrift.verify(),/CUTOVER_SOURCE_CHANGED_AFTER_OUTBOX_SCAN/);

let sweep=0;
const unstable=createPlanningCutoverDataAudit({
 auditParity:{async verify(){return {sourceManifest:'a'.repeat(64),sourceAudits:1,batch:1,verified:1,remaining:false,problems:[]};}},
 claimsParity:{async verify(){return {sourceManifest:'a'.repeat(64),ready:true,expected:0,checked:0,totalProblems:0,problems:[]};}},
 store:{async listOutbox(){sweep++;return {entries:[{operationId:'op1',state:'PROJECTED',revision:sweep}],nextPageToken:null};}}
});
await assert.rejects(()=>unstable.verify(),/CUTOVER_OUTBOX_CHANGED_DURING_SCAN/);
const duplicated=createPlanningCutoverDataAudit({
 auditParity:{async verify(){return {sourceManifest:'a'.repeat(64),sourceAudits:1,batch:1,verified:1,remaining:false,problems:[]};}},
 claimsParity:{async verify(){return {sourceManifest:'a'.repeat(64),ready:true,expected:0,checked:0,totalProblems:0,problems:[]};}},
 store:{async listOutbox({pageToken}){return pageToken?{entries:[{operationId:'same',state:'PROJECTED'}]}:{entries:[{operationId:'same',state:'PROJECTED'}],nextPageToken:'second'};}}
});
await assert.rejects(()=>duplicated.verify(),/CUTOVER_OUTBOX_DUPLICATE_OR_INVALID_ID/);

console.log('Cutover readiness: full row/claim parity and no unresolved outbox needed before switch');
