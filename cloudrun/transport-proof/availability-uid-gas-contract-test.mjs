import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const toolkit=readFileSync(new URL('../../Toolkit_AvailabilityMonth.js',import.meta.url),'utf8');
const availability=readFileSync(new URL('../../AvailabilityService.js',import.meta.url),'utf8');
assert.match(toolkit,/return 'TOOLKIT_DIRECT_MONTH_UID\\|' \\+ _mp_tdm_auditorUid_\\(/,'Toolkit month cache must be keyed by Auditor UID');
assert.match(toolkit,/function _mp_tdm_auditorUid_\\(/,'Toolkit must resolve Auditor UID');
assert.match(availability,/function auditorUidForEmail_\\(/,'Legacy interface must fail closed while resolving UID');
assert.match(availability,/var key = auditorUidForEmail_\\(auditorEmail\\) \\+ '\\|'/,'Sheet row identities must use UID');
console.log('GAS UID contract PASS');
