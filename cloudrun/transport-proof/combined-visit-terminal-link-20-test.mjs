import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
assert.match(source,/if\(\['COMPLETED','CANCELLED','REJECTED'\]\.includes\(state\)\)throw new Error\('VISIT_COMPOSITION_TERMINAL_OBLIGATION_HAS_ACTIVE_LINK'\)/);
assert.doesNotMatch(source,/if\(\['COMPLETED','CANCELLED','REJECTED'\]\.includes\(state\)\)continue/);
assert.ok(source.indexOf('VISIT_COMPOSITION_TERMINAL_OBLIGATION_HAS_ACTIVE_LINK')<source.indexOf('await sheetsValuesBatchUpdate(writes)'));
console.log('COMBINED_VISIT_TERMINAL_LINK_FAIL_CLOSED: PASS');
