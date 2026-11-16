import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { devCutoverFreezeDecision20 } from './dev-cutover-freeze-20.mjs';

const server = readFileSync(new URL('./server-r15.js', import.meta.url), 'utf8');
const routeStart = server.indexOf("  if(req.method==='POST'&&u.pathname==='/api/v1/planning/batch-commit'");
const routeEnd = server.indexOf("  if(req.method==='POST'&&u.pathname==='/api/v1/planning/commit-handoff'", routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart);
const route = server.slice(routeStart, routeEnd);
const origin = 'https://ams-dev.example';
const items = ['A', 'B', 'C'].map(auditId => ({
  auditId, sourceRevision: 'abcdef0123456789abcdef01', auditorEmail: 'auditor@example.test',
  blocks: [{ date: '2027-02-10', start: '09:00', end: '13:00' }]
}));

async function execute({ input = items, role = 'manager', requestOrigin = origin, failOn, isDev = true } = {}) {
  const calls = [];
  let result, status;
  const req = {
    method: 'POST', headers: { origin: requestOrigin },
    async *[Symbol.asyncIterator]() { yield JSON.stringify({ items: input }); }
  };
  await runInNewContext('(async () => {' + route + '})()', {
    req, u: { pathname: '/api/v1/planning/batch-commit' },
    runtime: { isDev, origin }, session: async () => ({ role }),
    planningAtomicCommands: { async commit({ body }) {
      calls.push(JSON.parse(JSON.stringify(body)));
      if (body.auditId === failOn) throw new Error('PLANNING_ATOMIC_SOURCE_REVISION_CONFLICT');
      return { projection: 'PROJECTED', operationId: body.auditId + '-operation' };
    } },
    planningCache: { invalidate() {} }, console: { error() {} },
    res: { writeHead(code) { status = code; }, end(body) { result = JSON.parse(body); } }
  });
  return { calls, result, status };
}

const complete = await execute();
assert.deepEqual(complete.calls, items);
assert.deepEqual(complete.result.outcomes.map(item => item.state), ['PROJECTED', 'PROJECTED', 'PROJECTED']);

const stale = await execute({ failOn: 'B' });
assert.deepEqual(stale.calls.map(item => item.auditId), ['A', 'B']);
assert.deepEqual(stale.result.outcomes.map(item => item.state), ['PROJECTED', 'STOPPED', 'NOT_ATTEMPTED']);

await assert.rejects(execute({ input: [items[0], { ...items[1], sourceRevision: 'PRT1-old' }] }), /PLANNING_BATCH_ITEMS_INVALID/);
await assert.rejects(execute({ input: [items[0], items[0]] }), /PLANNING_BATCH_ITEMS_INVALID/);
assert.equal((await execute({ role: 'auditor' })).status, 403);
assert.equal((await execute({ requestOrigin: 'https://elsewhere.example' })).status, 403);
assert.equal((await execute({ isDev: false })).calls.length, 0);
const freeze = { isDev: true, freezeEnabled: true, method: 'POST', path: '/api/v1/planning/batch-commit' };
assert.equal(devCutoverFreezeDecision20({ ...freeze, atomicPlanningEnabled: true }).allow, true);
assert.equal(devCutoverFreezeDecision20({ ...freeze, atomicPlanningEnabled: false }).allow, false);
console.log('DEV Multiple route contract PASS');
