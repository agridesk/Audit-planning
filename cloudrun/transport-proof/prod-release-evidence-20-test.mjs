import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const x=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./prod-release-evidence-20.mjs',import.meta.url))],{encoding:'utf8'}));
assert.equal(x.sourceOnly,true);
assert.equal(x.status,'NOT_READY');
assert.equal(x.knownGuards.combinedProdGuard,'NOT_VERIFIED');
assert.equal(x.knownGuards.managerProdGuard,'NOT_VERIFIED');

assert.equal(x.scope,'AMS_CLOUD_20_PROD_CUTOVER');
assert.ok(Array.isArray(x.checks));
assert.equal(x.checks.length,new Set(x.checks.map(c=>c.id)).size,'IDs unique');
const allowed=new Set(['SOURCE_CONFIRMED','PROVEN_DEVIATION','NOT_VERIFIED']);
for(const c of x.checks){assert.ok(allowed.has(c.status),c.id);assert.ok(/^[A-Z0-9_]+$/.test(c.id));}
for(const id of ['PROD_FIRESTORE_COLLECTION','PROD_REALIZED_HOURS_WRITER','LEGACY_COMBINED_VISIT_WRITER','LEGACY_MANAGER_LIFECYCLE_WRITERS'])assert.ok(x.checks.some(c=>c.id===id),'Missing source risk '+id);
for(const id of ['GAS_DEV_DEPLOYED_VERSION','GAS_PROD_DEPLOYED_VERSION','GAS_INSTALLABLE_TRIGGERS','IAM_SERVICE_ACCOUNTS','LEGAL_OWNERSHIP_LICENSE'])assert.equal(x.checks.find(c=>c.id===id)?.status,'NOT_VERIFIED','No invented runtime evidence '+id);
assert.equal(x.checks.reduce((n,c)=>n+(c.status==='SOURCE_CONFIRMED'),0),x.counts.SOURCE_CONFIRMED||0);
assert.equal(x.checks.reduce((n,c)=>n+(c.status==='PROVEN_DEVIATION'),0),x.counts.PROVEN_DEVIATION||0);
assert.equal(x.checks.reduce((n,c)=>n+(c.status==='NOT_VERIFIED'),0),x.counts.NOT_VERIFIED||0);
console.log('PROD_RELEASE_EVIDENCE_SOURCE_CONTRACT_PASS',x.checks.length);
