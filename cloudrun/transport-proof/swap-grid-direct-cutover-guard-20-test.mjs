import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const transport=readFileSync(new URL('./swap-firestore-dev-transport-20.mjs',import.meta.url),'utf8');
assert.match(server,/notificationGasCall\(actor,operation,data,'externalswap20'\)/);
assert.match(transport,/canonicalCutoverVerified=false/);
assert.match(transport,/enabled:enabled===true&&canonicalCutoverVerified===true/);
console.log('DEV SWAP mixed-store commit protection: PASS');
