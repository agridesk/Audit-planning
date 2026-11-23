import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../ManagerPlanningUI_boot.html', import.meta.url), 'utf8');
const start = html.indexOf('async function doSave(){');
const end = html.indexOf('async function doSaveWithHoursCheck(){', start);
assert.ok(start > 0 && end > start, 'doSave source not found');
const source = html.slice(start, end);

function harness(rpc) {
  const calls = { states: [], errors: [], banners: [], reset: 0, locked: 0, postSave: [] };
  const deps = {
    payload: { auditorEmail: '', blocks: [{ date: '2026-03-02', start: '08:00', end: '12:00' }] },
    auditId: 'TEST-AUDIT',
    blocks: [{ date: '2026-03-02', start: '08:00', end: '12:00' }],
    log() {},
    setSavingState(s) { calls.states.push(s); },
    v5GasCall_: rpc,
    resetSaveUi_() { calls.reset++; },
    async v5ShowError_(m) { calls.errors.push(String(m)); },
    setBanner(m, isError) { calls.banners.push({ m: String(m), isError }); },
    lockUI() { calls.locked++; },
    v5_markAvailDirty_() {}, invalidateAuditorMonthCache_() {}, v5_storeRecentReservations_() {},
    applySavedBlocksToDayAvail_() {}, renderCalendarOnceLoaded_: undefined,
    ctx: { audit: {} }, document: { getElementById() { return null; } }, mpSetText_() {},
    computePlannedHours_() { return 4; }, localStorage: { setItem() {} }, v5PostToOpener_() {},
    isAuditorToolkit_() { return false; },
    v5ShowPostSaveStayOpenState_(msg, status) { calls.postSave.push(status); },
  };
  const names = Object.keys(deps);
  const doSave = new Function(...names, source + '\nreturn doSave;')(...names.map((n) => deps[n]));
  return { doSave, calls };
}

async function expectNotSaved(response, expectedText) {
  const { doSave, calls } = harness(async () => response);
  await doSave();
  assert.equal(calls.locked, 0, 'UI must not lock without explicit confirmation');
  assert.equal(calls.postSave.length, 0, 'no success state without explicit confirmation');
  assert.equal(calls.reset, 1, 'Save button must be restored');
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], expectedText);
}

await expectNotSaved(undefined, /unconfirmed/);
await expectNotSaved(null, /unconfirmed/);
await expectNotSaved({}, /unconfirmed/);
await expectNotSaved({ ok: false, error: 'PORTAL_INTEGRATION_FAILED' }, /Save failed: PORTAL_INTEGRATION_FAILED/);
await expectNotSaved({ success: false, message: 'Hours too low' }, /Save failed: Hours too low/);
await expectNotSaved({ success: true }, /unconfirmed/);

{
  const { doSave, calls } = harness(async () => { throw new Error('timeout'); });
  await doSave();
  assert.equal(calls.locked, 0);
  assert.equal(calls.reset, 1);
  assert.match(calls.errors[0], /Save failed: timeout/);
}

{
  const { doSave, calls } = harness(async () => ({ success: true, newStatus: 'Approved' }));
  await doSave();
  assert.equal(calls.errors.length, 0);
  assert.equal(calls.locked, 1);
  assert.deepEqual(calls.postSave, ['Approved']);
}

console.log('manager-planning-save-confirmation tests passed');
