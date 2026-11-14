import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const marker="if(!match)throw Error('PLANNING_PREFLIGHT_RANGE_INVALID')";
const offset=source.indexOf(marker);
assert.ok(offset>0,'canonical preflight range gate must exist');
const before=source.slice(offset-110,offset);
const expected='const match=/^(.+)!A('+String.raw`d+`+'):/.exec(w.range);';
assert.ok(before.includes(expected),'business preflight must use regex digit escape exactly once');
assert.ok(!before.includes('A('+String.raw`\d+`+')'),'double-escaped preflight digit regex is invalid');
const rx=/^(.+)!A(\d+):/;
for(const [range,tab,row] of [['Audit planning!A5:AI5','Audit planning','5'],['Auditor Availability!A20:AN20','Auditor Availability','20'],['Concept Reservations!A104:Z104','Concept Reservations','104']]){
 const match=rx.exec(range);assert.ok(match,range);assert.equal(match[1],tab);assert.equal(match[2],row);
}
for(const wrong of ['Audit planning!Afoo:AIfoo','Audit planning!B5:AI5','Other Sheet!A:AI'])assert.equal(rx.exec(wrong),null);
console.log('PLANNING_AUTHORITY_PREFLIGHT_RANGE_PASS');
