import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const grid=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
assert.ok(grid.includes('if(!swap20PairDisplayNumbers.has(k))swap20PairDisplayNumbers.set(k,swap20PairDisplayNumbers.size+1)'));
assert.ok(!grid.includes('swap20PairDisplayNumbers=new Map(keys.map'));
assert.ok(grid.includes('function swap20PairKey(p)'));
console.log('SWAP pair display numbering stability contract OK');
