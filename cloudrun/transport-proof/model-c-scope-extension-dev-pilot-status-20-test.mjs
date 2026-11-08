import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const gate=readFileSync(new URL('./dev-ext-readonly-preview-20.mjs',import.meta.url),'utf8');
const a=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-pilot-status'&&req.method==='GET')");
const b=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-pilot-promote'&&req.method==='POST')",a);
assert(a>0&&b>a,'read-only pilot status must precede write route');
const route=server.slice(a,b);
for(const mark of [
 "process.env.K_SERVICE!=='ams-fase12-dev'","process.env.AMS_RUNTIME_ENV!=='DEV'",
 "sessionFromRequestValidated(req)","clean(actor.role).toLowerCase()!=='manager'",
 "verifiedAuditorLockDevProject()","EXT_WRITER_PROMOTION_",
 "writerFenceVerified?.booleanValue===true","migrationState?.stringValue==='WRITER_VERIFIED'",
 "evidence?.kind?.stringValue==='MODEL_C_WRITER_PROMOTION'",
 "sourceSnapshotSha256?.stringValue===ctx?.sourceSnapshotHash?.stringValue",
 "writerEnabledForPilot:promoted&&isolatedExtPilot20()"
])assert(route.includes(mark),'missing readback proof '+mark);
assert(!route.includes("req.method==='POST'")&&!route.includes(":commit")&&!route.includes('promoteAudit('),'recovery status must never mutate');
assert(gate.includes("'/api/v1/manager/ext-model-c-pilot-status'"),'status must be allowlisted');
assert(ui.includes("verify.textContent='Verify promotion status'"),'user must have readback recovery button');
assert(ui.includes("get('ext-pilot-audit')"),'audit ID must survive uncertain promotion response');
assert(ui.includes("'/api/v1/manager/ext-model-c-pilot-status?auditId='"),'status button must call read-only API');
console.log('PASS DEV pilot promotion recovery: Manager-only readback of immutable event and auditcontext, no retry');
