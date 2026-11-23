import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../PlanningWorkspaceStaleConceptReconciler.js', import.meta.url), 'utf8');
let releases = 0;
const context = {
  console: {log() {}},
  CRFB_enabled_: () => true,
  ConceptReservationReadModel_get: () => ({rows: [{auditId: 'audit-test'}]}),
  PlanningWorkspaceConceptLifecycle_project: () => ({
    activeRows: [],
    staleRows: [{auditId: 'audit-test', canonicalStatus: 'Approved', canonicalStatusNormalized: 'APPROVED'}]
  }),
  ConceptReservationCommandService_release: () => {
    releases++;
    return {released: true, reason: 'RELEASED'};
  }
};

vm.runInNewContext(source, context);
assert.throws(
  () => context.PlanningWorkspaceStaleConceptReconciler_run({apply: true}),
  /CONCEPT_RESERVATION_STALE_RECONCILER_FIRESTORE_BRIDGE_REQUIRED/
);
assert.equal(releases, 0);

const dryRun = context.PlanningWorkspaceStaleConceptReconciler_run({apply: false});
assert.equal(dryRun.mode, 'DRY_RUN');
assert.equal(releases, 0);

context.CRFB_enabled_ = () => false;
const legacyApply = context.PlanningWorkspaceStaleConceptReconciler_run({apply: true});
assert.equal(legacyApply.released, 1);
assert.equal(releases, 1);

console.log('concept-reservation-stale-reconciler-20-test: PASS');
