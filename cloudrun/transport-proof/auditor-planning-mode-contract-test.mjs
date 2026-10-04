import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const handoff=readFileSync(new URL('../../zzz_ExternalAuditorPlanningSessionHandoff.js',import.meta.url),'utf8');

const checks=[
  [r4,"AUDITOR_AUDIT_ACCESS_FORBIDDEN"],
  [r4,"AUDITOR_CANNOT_PLAN_FOR_OTHER_AUDITOR"],
  [r4,"AUDITOR_SELF_PLANNING_NOT_AUTHORIZED"],
  [r4,"AUDIT_PLANNED_BY_AUDITOR"],
  [r4,"CLOUD_RUN_DIRECT_SHEETS_AUDITOR_SELF_PLAN"],
  [r5,"AUDITOR_PLANNING_SESSION"],
  [r5,"AUDITOR_CANNOT_CHECK_OTHER_AUDITOR"],
  [r5,"sel.disabled=true"],
  [r5,"PLANNING_SAVED_V5"],
  [handoff,"validateTrustedTokenByRole(token,'Auditor',device)"],
  [handoff,"AUDITOR_PLANNING_SESSION"]
];
for(const [text,needle] of checks)assert.ok(text.includes(needle),needle+' missing');
assert.ok(!handoff.includes('saveManagerPlanning('),'handoff must not write planning');
console.log(JSON.stringify({ok:true,build:'2026-10-04_AUDITOR_SHARED_PLANNING_MODE_CONTRACT_R1',tests:12,writesPerformed:false}));
