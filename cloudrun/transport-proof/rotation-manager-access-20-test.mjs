import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
for(const route of ["['/rotation','/rotation-manager-20']","['/rotation.js','/rotation-manager-20.js']","['/api/v1/rotation','/api/v1/rotation-manager-20']"]){
 const i=source.indexOf(route);
 assert.ok(i>=0,'Rotation route absent: '+route);
 const section=source.slice(i,i+450);
 assert.match(section,/actor\.role!=='manager'/,'Rotation route must be manager-only: '+route);
 assert.doesNotMatch(section,/\['manager','auditor'\]/,'Auditor access must not be allowed: '+route);
}
assert.doesNotMatch(source,/if\(actor\.role==='auditor'\)\{\s*result\.rows=result\.rows\.filter/,'Auditor Rotation API branch must not return data');
console.log('Rotation Overview manager-only route contracts: PASS');
