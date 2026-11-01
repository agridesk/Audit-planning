import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const guards=['EXTENSION_ALREADY_APPLIED','EXTENSION_NOT_APPLIED','EXTENSION_UNDO_PROVENANCE_MISSING','EXTENSION_BASE_EXPIRY_MODEL_C_MISMATCH','EXTENSION_UNDO_PROVENANCE_UNTRUSTED','EXTENSION_UNDO_EFFECTIVE_EXPIRY_CONFLICT'];
for(const guard of guards)assert.ok(source.includes(guard),guard);
const grid=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
assert.ok(grid.includes('extensionAppliedState(r)?r.expiryZ:r.expiryY'));
assert.ok(grid.includes('applied=extensionAppliedState(r)'));
console.log('Extension provenance guards present');
