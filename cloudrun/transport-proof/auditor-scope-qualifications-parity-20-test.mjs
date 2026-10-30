import assert from 'node:assert/strict';
import {compareAuditorQualificationParity20 as compare} from './auditor-scope-qualifications-parity-20.js';
const catalog=[['SlotKey','ScopeCode','DisplayName'],['SCOPE_01','ABC','ABC'],['SCOPE_09','NEW','New Scope']];
const auditors=[['Auditor_UID','E-mail','ABC'],['U1','one@example.com','x'],['U2','two@example.com','']];
const relations=[['Auditor_UID','ScopeCode','Qualified'],['U1','ABC','YES'],['U1','NEW','YES']];
const good=compare({auditors,catalog,relations});
assert.equal(good.ok,true);
assert.deepEqual(good.unrepresentedScopes,['SCOPE_09']);
assert.equal(good.legacyCount,1);
assert.deepEqual(compare({auditors,catalog,relations:[relations[0],['U1','NEW','YES']]}).missing,['U1|abc']);
assert.deepEqual(compare({auditors,catalog,relations:[relations[0],...relations.slice(1),['U2','ABC','YES']]}).unexpected,['U2|abc']);
assert.equal(compare({auditors,catalog,relations:[...relations,relations[1]]}).ok,false);
assert.equal(compare({auditors,catalog,relations:[relations[0],['U1','ABC','MAYBE']]}).ok,false);
assert.equal(compare({auditors,catalog,relations:[]}).ok,false);
assert.equal(compare({auditors:[...auditors,['U1','duplicate@example.com','']],catalog,relations}).ok,false,'Duplicated UID blocks parity');

assert.equal(compare({auditors,catalog,relations:[...relations,['UNKNOWN','ABC','YES']]}).ok,false,'Unknown auditor UID must block parity');
assert.equal(compare({auditors,catalog,relations:[...relations,['U1','UNREGISTERED','YES']]}).ok,false,'Unknown scope identity must block parity');
console.log('auditor-scope-qualifications parity: legacy vs canonical read-only');
