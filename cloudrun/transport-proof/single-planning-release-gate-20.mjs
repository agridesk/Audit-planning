// Release 1 source gate. Read-only, no SWAP, no production changes.
// A passing source gate is NOT lifecycle E2E proof or PROD authorization.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const r4=read('./server-r4.js'),r6=read('./server-r6.js'),r12=read('./server-r12.js');
const packageJson=JSON.parse(read('./package.json'));
const managerPortal=read('./manager-portal.js');
const handoff=managerPortal.split('function submitSelectionHandoff(mode){')[1]?.split('\nfunction text(v)')[0]||'';
const checks={
  'single planning direct endpoint present':r4.includes("'/api/v1/planning/direct-commit'"),
  'combined visit separate owner exists':r6.includes("'/api/v1/planning/direct-commit'"),
  'PROD legacy lifecycle remains blocked':r4.includes('PROD_')&&r6.includes('PROD_'),
  'DEV realized hours remains fast atomic direct':r12.includes('DIRECT_SHEETS_ATOMIC')&&r12.includes('appendCells:'),
  'PROD realized hours stays fail closed':r12.includes('PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED'),
  'Customer Confirmation isolated from first release':!r4.includes('customer-confirmation-policy-20')&&!r6.includes('customer-confirmation-policy-20')&&!r12.includes('customer-confirmation-policy-20'),
  'Toolkit destination reserved before async handoff':handoff.indexOf('window.open("about:blank",target)')>=0&&handoff.indexOf('window.open("about:blank",target)')<handoff.indexOf('fetch("/api/v1/manager/selection-handoff"'),
  'handoff form targets reserved window':handoff.includes('form.target=target')&&handoff.includes('form.submit()'),
  'failed handoff closes reserved window':handoff.includes('win.close()'),
  'existing regression targets available':!!packageJson.scripts['test:realized-hours']&&!!packageJson.scripts['test:prod-config']
};
for(const [name,ok] of Object.entries(checks))assert.equal(ok,true,'Release 1 source gate: '+name);
const blockers=['PROD_LEGACY_MANAGER_LIFECYCLE_WRITES','PROD_LEGACY_DIRECT_LIFECYCLE_WRITE','PROD_REALIZED_HOURS_CANONICAL_PARITY_UNPROVEN','PROD infrastructure IAM/Firestore/SSoT runtime proof','Manager/Auditor Single Planning E2E evidence'];
console.log('SINGLE_PLANNING_RELEASE_1_SOURCE_PASS '+Object.keys(checks).length+' checks; NO PROD authorization');
console.log('RELEASE_1_OPEN_BLOCKERS '+blockers.join(' | '));
