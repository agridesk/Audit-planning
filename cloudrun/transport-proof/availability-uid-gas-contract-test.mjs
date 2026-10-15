import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const toolkit=readFileSync(new URL('../../Toolkit_AvailabilityMonth.js',import.meta.url),'utf8');
const availability=readFileSync(new URL('../../AvailabilityService.js',import.meta.url),'utf8');
assert.ok(toolkit.includes("return 'TOOLKIT_DIRECT_MONTH_UID|' + _mp_tdm_auditorUid_("),'Toolkit cache UID key');
assert.ok(toolkit.includes('function _mp_tdm_auditorUid_('),'Toolkit UID resolution');
assert.ok(availability.includes('function auditorUidForEmail_('),'Legacy bridge UID resolution');
assert.ok(availability.includes("var key = auditorUidForEmail_(auditorEmail) + '|'"),'Availability sheet identity UID');
console.log('GAS UID contract PASS');
