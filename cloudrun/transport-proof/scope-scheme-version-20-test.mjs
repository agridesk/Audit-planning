import assert from 'node:assert/strict';
import {scopeSchemeVersion20} from './scope-scheme-version-20.js';
const rows=[[...Array(21).fill(''), 'Official_Scheme_Version'],[...Array(21).fill(''),'']];rows[0][1]='ScopeCode';rows[1][1]='MPS-GAP';
const result=await scopeSchemeVersion20({method:'GET',body:{scopeCode:'MPS-GAP'},clean:x=>String(x??'').trim(),sheetsBatchGet:async()=>[{values:rows}]});
assert.equal(result.version,'');
console.log('scope-scheme-version-20: read contract passed');
