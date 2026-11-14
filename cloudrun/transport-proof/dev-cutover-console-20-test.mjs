import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {devCutoverConsole20} from './dev-cutover-console-20.mjs';
const html=devCutoverConsole20();
assert.match(html,/<button id="commit" disabled>/);
assert.match(html,/confirm\('Firestore backfill DEV starten/);
assert.match(html,/dryRun:false,startRow,limit:25,sourceManifest/);
assert.match(html,/if\(data\.nextRow===null\)/);
assert.match(html,/BACKFILL_COUNT_MISMATCH/);
assert.match(html,/atomic-cutover-evidence-readonly/);
assert.match(html,/proof\.ready!==true/);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const a=r15.indexOf("if(req.method==='GET'&&u.pathname==='/manager/dev-cutover-backfill')");
const b=r15.indexOf("  // Post-backfill verification",a);
assert.ok(a>0&&b>a,'Authenticated operator console route required');
const guard=r15.slice(a,b);
for(const required of ['actor?.role!==\'manager\'','AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED',
 'AMS_DEV_ATOMIC_PREFLIGHT_ENABLED','AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED',
 'AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED','planningAtomicEnabled','canonicalHost']){
 assert.ok(guard.includes(required),'Operator guard missing '+required);
}
assert.match(guard,/res\.end\(devCutoverConsole20\(\)\)/);
console.log('DEV operator console: manager-only, explicit commit, paginated backfill, verified freeze and parity PASS');
