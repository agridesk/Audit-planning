// AMS 2.0 Planning Toolkit: read-only source regression guard.
// This verifies selection boundaries, not runtime correctness or a reproduced incident.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = filename => readFileSync(new URL(filename, import.meta.url), 'utf8');
const ui = read('./server-r5.js');
const single = read('./server-r4.js');
const combined = read('./server-r6.js');
const router = read('./server-r8.js');
const windowProjection = read('./server-r10.js');

function requireSource(source, fragment, label) {
  assert.ok(source.includes(fragment), label);
}

// Sibling audits are offered as options, but not selected automatically.
requireSource(ui, 'visitAuditIds=new Set(planningSet.filter(r=>r.isPrimary).map(r=>r.auditId))',
  'Toolkit must default to primary audit only');
requireSource(ui, 'if(el.checked)visitAuditIds.add(el.dataset.visitAudit);else visitAuditIds.delete(el.dataset.visitAudit)',
  'Toolkit sibling membership must follow explicit checkbox selection');
requireSource(ui, 'visitAuditIds:[...visitAuditIds]',
  'Toolkit must submit selected IDs, not entire company planning set');
requireSource(ui, 'visitMembers:[...visitAuditIds].map(id=>',
  'Toolkit revision members must follow exactly the selected IDs');

// A single audit must not accidentally enter the combined-write path.
requireSource(router, 'if(ids.length<2)return false;',
  'Combined handoff must decline a single-member request');
requireSource(combined, 'if(ids.length>1)',
  'Combined direct commit must require more than one member');

// The related-window guard remains intact for explicitly combined visits.
requireSource(single, "throw new Error('VISIT_RELATED_PLANNING_WINDOW_BLOCKED')",
  'Related audit planning-window guard must be preserved');
requireSource(combined, "'VISIT_RELATED_PLANNING_WINDOW_BLOCKED'",
  'Combined visit planning-window guard must be preserved');

// Model C window projections must be constrained to links of the requested Audit ID.
requireSource(windowProjection, "if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;",
  'Model C window projection must not include unrelated audit links');

console.log('Planning Toolkit selection/window source regression guard: PASS');
