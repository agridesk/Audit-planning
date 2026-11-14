import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {preparePlanningBackfill} from './planning-atomic-backfill-20.js';
const sha=x=>createHash('sha256').update(x).digest('hex').slice(0,24);
const headers=['Audit ID','Status','Assigned to','Planning JSON','Last decision timestamp',
 'Status since','Date - Planned','Auditor_UID'];
const uid='auditor-uid-123';
const row=['AUD-1','Pending Planning','isalia@example.test','','2026-10-28 13:00:00',
 '2026-10-28 13:00:00','',uid];
const roster=[{role:'auditor',auditorId:uid,email:'isalia@example.test'}];
const r=preparePlanningBackfill({rows:[headers,row],roster,asOfDate:'2026-11-14'});
const fields=[row[0],row[1],row[2],row[3],row[4],row[5]];
const previewRevision=sha(fields.join('|')+'|'+uid);
assert.equal(r.items[0].snapshot.sourceRevision,previewRevision,
 'Backfilled Firestore snapshot revision must match the canonical R15 Model C preview');
assert.notEqual(previewRevision,sha(fields.join('|')),
 'Auditor UID must participate in the revision when populated');
const emptyUid=preparePlanningBackfill({rows:[headers,[...row.slice(0,7),'']],roster,asOfDate:'2026-11-14'});
assert.equal(emptyUid.items[0].snapshot.sourceRevision,sha(fields.join('|')),
 'Blank legacy UID must preserve the existing six-field fingerprint');
const noUid=preparePlanningBackfill({rows:[headers.slice(0,7),row.slice(0,7)],roster,asOfDate:'2026-11-14'});
assert.equal(noUid.items[0].snapshot.sourceRevision,sha(fields.join('|')),
 'Absent legacy UID header must preserve compatibility');
const s15=await import('node:fs').then(fs=>fs.readFileSync(new URL('./server-r15.js',import.meta.url),'utf8'));
assert.match(s15,/fingerprint\+\(uid\?'\|'\+uid:''\)/);
const split=await import('node:fs').then(fs=>fs.readFileSync(new URL('./visit-composition-separate-authority-preflight-20.mjs',import.meta.url),'utf8'));
assert.match(split,/fields\.join\('\|'\)\+\(uid\?'\|'\+uid:''\)/);
console.log('Backfill source CAS: Planning 2.0 fingerprint matches UID and legacy cases PASS');
