import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const preflight=readFileSync(new URL('../../scripts/ams-ext-model-c-readonly-preflight.mjs',import.meta.url),'utf8');
new vm.Script(ui);
const a=ui.indexOf('function showExtObligations(data){');
const b=ui.indexOf('async function loadExtObligations(){',a);
assert(a>0&&b>a);
const view=ui.slice(a,b);
assert(view.includes('max-width:1100px'),'EXT dossier should not stretch across the full screen');
assert(view.includes('table-layout:fixed'),'scope columns need controlled relative widths');
assert(view.includes('min-width:0;table-layout:fixed'),'EXT table must override the global 1900px minimum');
assert(view.includes('white-space:normal;vertical-align:middle'),'EXT cells must override global nowrap');
assert(view.includes("['Scope','17%']")&&view.includes("['Actions','12%']"),'scope and action must be visually grouped');
assert(view.includes("td.title='Obligation '"),'technical obligation ID should be a tooltip, not a broad visible column');
assert(!view.includes("['Obligation'"),'technical IDs must not consume a table column');
assert(view.includes('button.disabled=true'),'unverified writer must never look enabled');
assert(view.includes("['FIRESTORE_VERIFIED','DEV_MODEL_C_DIRECT'].includes(data.mode)"),'scope actions should depend on reconciled canonical authority');
assert(view.includes("button.onclick=function(){extAction(o,command)}"),'eligible scope actions must retain real command callback');
assert(ui.includes('runSingleScopeExtension20(button)'),'single-scope uses direct canonical action');
assert(preflight.includes('READ-ONLY')&&preflight.includes("method:'GET'"),'diagnostic must be read only');
assert(preflight.includes('print-access-token')&&preflight.includes('values:batchGet'),'diagnostic checks authoritative DEV sources');
assert(preflight.includes('ams_scope_extension_20_dev_'),'diagnostic checks the actual target namespace');
for(const forbidden of ["'deploy'","'update-traffic'","method:'POST'","method:'PATCH'","method:'DELETE'"]){
 assert(!preflight.includes(forbidden),'read-only preflight must not contain mutation: '+forbidden);
}
console.log('PASS compact EXT UI, single/multi action routing, and read-only Model C preflight contract');
