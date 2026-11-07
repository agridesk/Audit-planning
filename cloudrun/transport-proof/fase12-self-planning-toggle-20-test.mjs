import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const backend=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const grid=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
for(const marker of ['directManagerSelfPlanning20','/api/v1/manager/self-planning-direct','SELF_PLANNING_ONLY_PENDING_PLANNING','STALE_AUDIT_REVISION','SELF_PLANNING_COLUMN_MISSING','withDirectManagerActionLock(auditId'])assert.ok(backend.includes(marker),marker);
assert.ok(backend.includes("typeof value!=='boolean'"));
assert.ok(backend.includes('STALE_SELF_PLANNING_VALUE'));
assert.ok(backend.includes("process.env.AMS_DEV_SELF_PLANNING_PROXY_ORIGIN"));
assert.ok(backend.includes("process.env.AMS_RUNTIME_ENV==='DEV'&&/^http:\\/\\/127\\.0\\.0\\.1:[0-9]{2,5}$/.test(trustedProxyOrigin)"));
assert.ok(backend.includes("origin.host!==clean(req.headers.host)&&!devProxyAllowed"));

assert.ok(grid.includes('expectedAllowSelfPlanning:'));
assert.ok(grid.includes('self-planning-toggle20'));
assert.ok(grid.includes('toggleSelfPlanning20(button)'));
assert.ok(grid.includes('sourceRevision:result.sourceRevision'));
const proxy=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.ok(proxy.includes("writerPath==='/api/v1/manager/self-planning-direct'"));
assert.ok(proxy.includes("headers.host=String(req.headers.host||'')"));
console.log('Manager self planning source contracts OK');
