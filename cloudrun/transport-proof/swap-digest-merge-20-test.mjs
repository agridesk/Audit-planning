import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const start=sender.indexOf('  // Combine only ALREADY-DUE SWAP envelopes');
const end=sender.indexOf('  var sentGroups = 0;',start);
assert(start>=0&&end>start,'Atomic SWAP coalescing code must exist');
const merge=new Function('allGroups','keys',sender.slice(start,end)+';return {allGroups,keys};');
const base=()=>({recipient:'ecas@example.invalid',
 items:[{eventCode:'ECAS_AUDIT_APPROVAL_DIGEST',auditId:'AUD1'}],rows:[100]});
const swap=()=>({recipient:'ecas@example.invalid',
 items:[{eventCode:'ECAS_AUDIT_CHANGED_DIGEST',auditId:'SWAP_SWAP20_123',
 payload:{operationId:'SWAP20_123',swapItems:[{auditId:'AUD2'},{auditId:'AUD3'}]}}],rows:[101]});
const ext=()=>({recipient:'ecas@example.invalid',
 items:[{eventCode:'CB_EXTENSION_APPLIED',
 payload:{certificationBodyId:'ECAS'}}],rows:[102]});
let g={base:base(),swap:swap(),ext:ext()},out=merge(g,['base','swap','ext']);
assert.deepEqual(out.keys,['base'],'All already-due ECAS sections use one mail');
assert.deepEqual(out.allGroups.base.rows,[100,101,102]);
assert.equal(out.allGroups.base.items.length,3);
assert.equal(out.allGroups.base.items[1].payload.swapItems.length,2,'One atomic SWAP queue item');
g={swap:swap(),ext:ext()};out=merge(g,['swap','ext']);
assert.deepEqual(out.keys,['swap'],'Already-due ECAS SWAP hosts extension when no regular audit is due');
assert.equal(out.allGroups.swap.items.length,2);
assert.equal(out.allGroups.swap.items[0].payload.swapItems.length,2,'Atomic pair remains one queue item');
g={base:base(),swap:{...swap(),recipient:'other@example.invalid'},ext:ext()};
out=merge(g,['base','swap','ext']);
assert.deepEqual(out.keys,['base','swap'],'Cross-recipient SWAP never combined');
assert.equal(out.allGroups.base.items.length,2);
g={base:base(),swap:swap(),ext:{...ext(),items:[{eventCode:'CB_EXTENSION_APPLIED',payload:{certificationBodyId:'OTHER'}}]}};
out=merge(g,['base','swap','ext']);
assert.deepEqual(out.keys,['base','ext'],'Non-ECAS extensions never combined');
assert.equal(out.allGroups.base.items.length,2);
console.log('SWAP/EXT/ECAS due-digest atomic coalescing PASS');
