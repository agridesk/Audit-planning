import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runtimeBundleProof20} from './runtime-bundle-proof-20.mjs';
const root=new URL('./',import.meta.url),proof=await runtimeBundleProof20(root);
for(const [file,item] of Object.entries(proof)){
 const bytes=await readFile(new URL(file,root));
 assert.equal(item.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(item.bytes,bytes.length);
 assert.deepEqual(Object.keys(item).sort(),['bytes','sha256']);
}
assert.equal(Object.keys(proof).length,5);
await assert.rejects(()=>runtimeBundleProof20(root,{read:async()=>Buffer.from('')}),/RUNTIME_BUNDLE_EMPTY/);
await assert.rejects(()=>runtimeBundleProof20(root,{read:async()=>{throw Error('missing');}}),/missing/);
const server=await readFile(new URL('./server-r15.js',root),'utf8');
const a=server.indexOf("u.pathname==='/api/v1/manager/runtime-readiness'"),b=server.indexOf("u.pathname==='/rotation'",a);
const route=server.slice(a,b);
assert(route.includes("identity.role!=='manager'"),'Bundle proof must remain manager-only');
assert(route.includes("bundleProof:await runtimeBundleProof20(new URL('./',import.meta.url))"));
console.log('PASS runtime bundle proof: actual bytes, hashes, complete files, manager-only access');
