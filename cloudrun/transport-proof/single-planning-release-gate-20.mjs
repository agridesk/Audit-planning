// Release 1 source gate. Read-only, no SWAP, no production changes.
// A passing source gate is NOT lifecycle E2E proof or PROD authorization.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const r4=read('./server-r4.js'),r6=read('./server-r6.js'),r12=read('./server-r12.js');
const packageJson=JSON.parse(read('./package.json'));
const managerPortal=read('./manager-portal.js');
const compositionPreview=read('./visit-composition-preview-20.mjs');
const compositionCommand=read('./visit-composition-command-20.mjs');
const scopeAllocation=read('./visit-scope-allocation-20.mjs');
const modelCLinkSplit=read('./visit-model-c-link-split-plan-20.mjs');
const atomicComposition=read('./planning-visit-composition-service-20.js');
const sourceEvidence=read('./visit-composition-source-evidence-20.mjs');
const r15=read('./server-r15.js');
const canonicalReader=read('./visit-composition-canonical-reader-20.mjs');
const compositionOverview=read('./visit-composition-overview-20.mjs');
const handoff=managerPortal.split('function submitSelectionHandoff(mode){')[1]?.split('\nfunction text(v)')[0]||'';
const checks={
  'single planning direct endpoint present':r4.includes("'/api/v1/planning/direct-commit'"),
  'combined visit separate owner exists':r6.includes("'/api/v1/planning/direct-commit'"),
  'PROD legacy lifecycle remains blocked':r4.includes('PROD_')&&r6.includes('PROD_'),
  'DEV realized hours remains fast atomic direct':r12.includes('DIRECT_SHEETS_ATOMIC')&&r12.includes('appendCells:'),
  'PROD realized hours stays fail closed':r12.includes('PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED'),
  'Customer Confirmation isolated from first release':!r4.includes('customer-confirmation-policy-20')&&!r6.includes('customer-confirmation-policy-20')&&!r12.includes('customer-confirmation-policy-20'),
  'Toolkit destination reserved before async handoff':handoff.indexOf('window.open("about:blank",target)')>=0&&handoff.indexOf('window.open("about:blank",target)')<handoff.indexOf('fetch("/api/v1/manager/selection-handoff"'),
  'unsupported Toolkit handoff modes rejected':handoff.includes('mode!=="batch"&&mode!=="concept"'),
  'Toolkit handoff request has bounded wait':handoff.includes('signal:AbortSignal.timeout(20000)'),
  'handoff form targets reserved window':handoff.includes('form.target=target')&&handoff.includes('form.submit()'),
  'failed handoff closes reserved window':handoff.includes('win.close()'),
  'existing regression targets available':!!packageJson.scripts['test:realized-hours']&&!!packageJson.scripts['test:prod-config'],
  'Issue87 Model C composition read-only and fail-closed':compositionPreview.includes('canCommit:false')&&compositionCommand.includes('canCommit:false')&&scopeAllocation.includes('SCOPE_ALLOCATION_REQUIRED_HOURS_MISMATCH'),
  'Issue87 targeted regression command exists':packageJson.scripts['test:issue87-allocation']?.includes('visit-composition-command-20-test.mjs')===true,
  'Issue87 link split projection stays read-only and fail-closed':modelCLinkSplit.includes('canCommit:false')&&modelCLinkSplit.includes('MODEL_C_LINK_SPLIT_SOURCE_LINK_DRIFT')&&packageJson.scripts['test:issue87-allocation']?.includes('visit-model-c-link-split-plan-20-test.mjs')===true,
  'Issue87 atomic composition service is isolated and gated':atomicComposition.includes('if(!enabled)')&&atomicComposition.includes('store.commitMulti(')&&atomicComposition.includes('appendProjector.apply(')&&packageJson.scripts['test:issue87-allocation']?.includes('planning-visit-composition-split-20-test.mjs')===true,
  'Issue87 source read evidence mandatory before atomic commit':atomicComposition.includes('verifyVisitCompositionSource20(')&&sourceEvidence.includes('COMPOSITION_SOURCE_ACTIVE_LINK_DRIFT')&&packageJson.scripts['test:issue87-allocation']?.includes('visit-composition-source-evidence-20-test.mjs')===true,
  'Issue87 DEV SSoT composition overview wired as read-only':r15.includes('/api/v1/planning/composition-overview')&&r15.includes('AMS_DEV_COMPOSITION_OVERVIEW_ENABLED')&&canonicalReader.includes('COMPOSITION_READER_APPEND_ROW_OCCUPIED')&&compositionOverview.includes('writeEnabled:false'),
  'Issue87 atomic composition rereads SSoT independently':atomicComposition.includes('canonicalReader.read(')&&packageJson.scripts['test:issue87-allocation']?.includes('visit-composition-runtime-contract-20-test.mjs')===true
};
for(const [name,ok] of Object.entries(checks))assert.equal(ok,true,'Release 1 source gate: '+name);
const blockers=['PROD_LEGACY_MANAGER_LIFECYCLE_WRITES','PROD_LEGACY_DIRECT_LIFECYCLE_WRITE','PROD_REALIZED_HOURS_CANONICAL_PARITY_UNPROVEN','PROD infrastructure IAM/Firestore/SSoT runtime proof','Manager/Auditor Single Planning E2E evidence','Issue87 canonical together/separately writer and Model C link transfer'];
console.log('SINGLE_PLANNING_RELEASE_1_SOURCE_PASS '+Object.keys(checks).length+' checks; NO PROD authorization');
console.log('RELEASE_1_OPEN_BLOCKERS '+blockers.join(' | '));
