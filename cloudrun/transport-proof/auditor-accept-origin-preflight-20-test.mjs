import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const preflights=[...r15.matchAll(/actor\.role==='auditor'\?\{origin:runtime\.origin,host:new URL\(runtime\.origin\)\.host\}/g)];
assert.equal(preflights.length,2,'Both atomic lifecycle preflight paths must supply matching Origin and Host');
assert.match(r4,/origin\.host===String\(req\.headers\.host\|\|''\)/,'Canonical auditor action must compare Origin to Host');
assert.match(r15,/actor\.role==='auditor'&&action==='ACCEPT'/,'Auditor ACCEPT must route through auditor canonical action');
console.log('Auditor atomic origin/host preflight source contract OK');
