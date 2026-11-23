import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./server-r4.js', import.meta.url), 'utf8');
const focused = source.slice(source.indexOf('async function focused('), source.indexOf('http.createServer('));
const directPlanning = source.slice(source.indexOf('function directPlanningCommit('), source.indexOf('async function focused('));
const serverR15 = await readFile(new URL('./server-r15.js', import.meta.url), 'utf8');
const serverR6 = await readFile(new URL('./server-r6.js', import.meta.url), 'utf8');
const reconcileStart = source.indexOf("if(u.pathname==='/api/v1/manager/concept-reservations/reconcile'");
const reconcileRoute = source.slice(reconcileStart, source.indexOf("if(u.pathname==='/api/v1/internal/concept-reservations'", reconcileStart));
const compositionStart = serverR15.indexOf('const planningAtomicComposition=');
const compositionPreflight = serverR15.slice(
  compositionStart,
  serverR15.indexOf('const atomicLifecyclePaths=', compositionStart)
);

assert.ok(focused.includes("conceptReservationsFirestoreEnabled?'Config_Scopes!A1:A1':'Concept Reservations!A1:P256'"),
  'Firestore cutover must skip reading the legacy reservation sheet');
assert.ok(focused.includes('conceptReservationStore.list({from,to,auditorUids})'),
  'Firestore reservation projection must read by the eligible auditors canonical UIDs');
assert.ok(focused.includes("col(auditorHeaders,['Auditor_UID','Auditor UID'])"),
  'Firestore reservation projection must resolve identity through Auditor_UID');
assert.ok(focused.includes('Object.assign(reservations,reservationProjection(projectedValues,emails,from,to,context))'),
  'Firestore documents must pass through the existing canonical projection');
assert.ok(focused.includes('conceptReservations:reservationSourceCount'),
  'the response count must reflect the selected reservation source');
assert.doesNotMatch(focused, /conceptReservationStore\.(?:upsert|upsertBatch|release)\(/,
  'the focused workspace read path must not write Firestore');
assert.ok(directPlanning.includes("conceptReservationsFirestoreEnabled?'Config_Scopes!A1:A1':'Concept Reservations!A1:P256'"),
  'direct planning must skip the legacy reservation sheet under the Firestore gate');
assert.ok(directPlanning.includes('conceptReservationStore.list({from:dates[0],to:dates[dates.length-1],auditorUids:[auditorUid]})'),
  'auditor self-planning collision checks must use reservations keyed by Auditor_UID');
assert.ok(directPlanning.includes('if(!conceptReservationsFirestoreEnabled)for(let i=1;i<cr.length;i++)'),
  'the direct-planning projection must not write reservation rows to Sheets under the Firestore gate');
assert.ok(directPlanning.includes('conceptReservationStore.release({auditId,actorUid,actorRole,reason:\'CANONICAL_COMMIT\'})'),
  'direct planning must release the Firestore reservation only after the plan write succeeds');
assert.match(directPlanning, /const conceptReservationRelease=await releaseFirestoreReservation\(\);\s*return\{success:true,idempotent:true/,
  'an idempotent direct-planning replay must retry a prior reservation release');
assert.ok(serverR15.includes("reason:'CANONICAL_COMMIT'"),
  'atomic planning must finalize reservation release after the canonical projection');
assert.ok(serverR15.includes("process.env.AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED==='true'"),
  'the second server must use the same explicit full-cutover gate');
assert.ok(compositionPreflight.includes('conceptReservationStore.read(String(body.auditId||\'\').trim())'),
  'separate-visit preflight must read the source audit reservation by audit ID');
assert.ok(compositionPreflight.includes("name==='Concept Reservations'&&conceptReservationsFirestoreEnabled"),
  'the gated preflight must skip the legacy reservation-sheet range');
assert.ok(compositionPreflight.includes('reservationRows,availabilityRows:tables[\'Auditor Availability\']'),
  'the Firestore reservation read must flow into the existing preflight');
assert.doesNotMatch(compositionPreflight, /conceptReservationStore\.(?:list|upsert|release)\(/,
  'the preflight must not write reservation data or scan the collection');
assert.ok(serverR6.includes("AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED==='true'"),
  'combined visit must observe the full reservation cutover gate');
assert.ok(serverR6.includes("if(conceptReservationsFirestoreEnabled&&process.env.AMS_COMBINED_CANONICAL_GAS_WRITE_ENABLED!=='true')"),
  'Firestore cutover must refuse the legacy combined-visit writer');
assert.ok(serverR6.includes("conceptReservationsFirestoreEnabled?'Config_Scopes!A1:A1':'Concept Reservations!A1:P256'"),
  'Firestore cutover must skip the legacy combined-visit reservation read');
assert.ok(reconcileStart >= 0 && reconcileRoute.includes('!conceptReservationsFirestoreEnabled'),
  'the Sheets projector endpoint must be hidden unless the DEV full-cutover gate is enabled');
assert.ok(reconcileRoute.includes("clean(actor.role).toLowerCase()!=='manager'"),
  'the projection endpoint must preserve manager-only authorization');
assert.ok(reconcileRoute.includes("body.action!=='PROJECT'||body.confirm!=='PROJECT_CONCEPT_RESERVATIONS'"),
  'derived projection requires an explicit confirmation');
assert.ok(reconcileRoute.includes('readOnly:true')&&reconcileRoute.includes('reservationDocumentWrites:false'),
  'the reconciliation preview is read-only and the projector does not write reservation documents');
assert.ok(reconcileRoute.includes('conceptReservationSheetsProjector20.reconcile()'),
  'the explicitly confirmed operation must invoke the Sheets projector');

console.log('concept-reservation-cloudrun-read-20-test: PASS');
