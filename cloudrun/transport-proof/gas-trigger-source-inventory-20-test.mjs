import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const source=readFileSync(new URL('./gas-trigger-source-inventory-20.mjs',import.meta.url),'utf8');
assert.match(source,/readdirSync\(root\)/);
assert.match(source,/name\.endsWith\('\.js'\)/);
assert.match(source,/installed:'NOT_VERIFIED'/);
assert.match(source,/liveTriggerState:'NOT_VERIFIED'/);
const files=readdirSync(root).filter(name=>name.endsWith('.js'));
// Guard a currently tracked installer, not historical files absent from this checkout.
assert.ok(files.includes('NotificationQueueAutoTrigger20.js'));
assert.ok(readFileSync(resolve(root,'NotificationQueueAutoTrigger20.js'),'utf8').includes('ScriptApp.newTrigger('));
let installers=0;
for(const name of files){
 const body=readFileSync(resolve(root,name),'utf8');
 if(body.includes('ScriptApp.newTrigger('))installers++;
}
assert.ok(installers>0,'GAS trigger installers must be discoverable');
console.log('GAS source inventory: full root scan and live-status boundary PASS');
