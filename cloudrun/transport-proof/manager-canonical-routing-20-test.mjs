import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
for(const action of ['approve','reject']){
 assert.ok(r4.includes("try{b.action='"+action+"';const out=await lifecycleAuthorityPreflight20(s,b,")&&r4.includes("canonicalManagerAction(s,b)"),'direct '+action+' must use canonical dispatcher');
}
assert.match(r4,/b\.action='cancel';\s*const out=await lifecycleAuthorityPreflight20\(s,b,'CANCEL'/);
assert.match(r4,/if\(u\.pathname==='\/api\/v1\/manager\/action'/);
assert.match(r4,/AMS_MANAGER_CANONICAL_GAS_WRITE_ENABLED==='true'/);
assert.match(r4,/if\(canonicalResult\)return canonicalResult/);
assert.match(r4,/if\(managerAction==='approve'\)return directManagerApprove\(identity,body\)/);
assert.match(r4,/if\(managerAction==='cancel'\)return directManagerCancel\(identity,body\)/);
assert.match(r4,/if\(managerAction==='reject'\)return directManagerReject\(identity,body\)/);
console.log('AMS issue45 Manager direct endpoint canonical dispatcher: PASS');
