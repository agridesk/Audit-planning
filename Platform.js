/**
 * Platform.gs — Platform Abstraction Layer (PAL)
 * ────────────────────────────────────────────────────────────────────────────
 * Hexagonal "ports" for the 6 GAS-specific concerns in the audit system.
 * Current adapter: Google Apps Script. Future adapter: Node.js + Postgres.
 *
 * GOAL (Master §20):
 *   When the system migrates from GAS to a real backend, only THIS file
 *   needs replacement. Domain services (StatusMachine, ALC, Reject,
 *   Complete, SaveSchedule, etc.) should depend on Platform_* and remain
 *   unchanged.
 *
 * STATUS:
 *   - All ports defined as Platform_* functions.
 *   - GAS adapter implemented inline below.
 *   - Existing services CURRENTLY still call GAS APIs directly. Each call
 *     site is marked `// PAL:` in source so future migration is traceable.
 *   - Migration sequence: see _PORTABILITY.md.
 *
 * THE 6 PORTS:
 *   1. IPersistence — sheet rows ↔ SQL rows
 *   2. ILock        — document lock ↔ row/advisory lock or Redis
 *   3. IKeyValue    — PropertiesService/CacheService ↔ Redis or DB row
 *   4. IScheduler   — ScriptApp triggers ↔ cron/queue worker
 *   5. IClock       — Utilities.formatDate ↔ standard date library
 *   6. IIdentity    — Session.getActiveUser ↔ req.user from auth
 * ────────────────────────────────────────────────────────────────────────────
 * Build: 2026-05-03_REWORK_001
 */

var PLATFORM_VERSION = '2026-05-03_REWORK_001';
var PLATFORM_RUNTIME = 'apps-script';   // future: 'node' | 'cloudflare-worker' | etc.

// ═══════════════════════════════════════════════════════════════════════════
// 1. IPersistence — abstract sheet/table operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find row number by key value in a header column. Hot-path safe (no full scan).
 * @param  {string} sheetName    e.g. 'Audit planning'
 * @param  {string} keyHeader    e.g. 'Audit ID'
 * @param  {string} keyValue     e.g. 'AUDIT-12345'
 * @return {number|null} 1-indexed row number, or null if not found.
 */
function Platform_findRowByKey(sheetName, keyHeader, keyValue) {
  var ctx = Platform__sheetCtx_(sheetName);
  var iKey = ctx.hdr.indexOf(keyHeader);
  if (iKey < 0) throw new Error('Platform: header "' + keyHeader + '" missing in ' + sheetName);
  var match = ctx.sh.getRange(1, iKey + 1, ctx.sh.getLastRow(), 1)
                    .createTextFinder(String(keyValue))
                    .matchEntireCell(true).findNext();
  return match ? match.getRow() : null;
}

/** @return {Object} row as {header: value} object, with _hdr and _raw. */
function Platform_readRow(sheetName, rowNum) {
  var ctx = Platform__sheetCtx_(sheetName);
  var raw = ctx.sh.getRange(rowNum, 1, 1, ctx.hdr.length).getValues()[0];
  var out = {};
  for (var i = 0; i < ctx.hdr.length; i++) out[ctx.hdr[i]] = raw[i];
  out._hdr = ctx.hdr.slice();
  out._raw = raw;
  return out;
}

function Platform_setCell(sheetName, rowNum, header, value) {
  var ctx = Platform__sheetCtx_(sheetName);
  var idx = ctx.hdr.indexOf(header);
  if (idx < 0) throw new Error('Platform: header "' + header + '" missing in ' + sheetName);
  ctx.sh.getRange(rowNum, idx + 1).setValue(value);
}

function Platform_setCells(sheetName, rowNum, fields) {
  // fields: { headerName: value, ... } — written one-by-one (GAS), batched in Node adapter.
  var ctx = Platform__sheetCtx_(sheetName);
  Object.keys(fields).forEach(function (h) {
    var idx = ctx.hdr.indexOf(h);
    if (idx < 0) throw new Error('Platform: header "' + h + '" missing in ' + sheetName);
    ctx.sh.getRange(rowNum, idx + 1).setValue(fields[h]);
  });
}

function Platform_appendRow(sheetName, headerOrder, rowData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Platform: sheet "' + sheetName + '" missing');
  if (sh.getLastRow() === 0) sh.appendRow(headerOrder);
  sh.appendRow(rowData);
  return sh.getLastRow();
}

function Platform_deleteRow(sheetName, rowNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Platform: sheet "' + sheetName + '" missing');
  sh.deleteRow(rowNum);
}

function Platform__sheetCtx_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Platform: sheet "' + sheetName + '" missing');
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return { sh: sh, hdr: hdr };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ILock — distributed lock
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run fn under an exclusive lock. Releases on exit (success or throw).
 * GAS adapter: LockService.getDocumentLock (single-doc scope).
 * Node adapter: pg_advisory_lock by hash(name) OR Redis SET NX.
 *
 * @param {string}   name        unused in GAS (single-doc), used in Node for key.
 * @param {Function} fn          () => result
 * @param {number}   timeoutMs   default 5000
 */
function Platform_withLock(name, fn, timeoutMs) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(timeoutMs || 5000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

/** Non-blocking try-lock variant. */
function Platform_tryLock(name, fn, timeoutMs) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(timeoutMs || 2000)) return { acquired: false };
  try { return { acquired: true, result: fn() }; }
  finally { lock.releaseLock(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. IKeyValue — properties/cache abstraction
// ═══════════════════════════════════════════════════════════════════════════

function Platform_kvGet(key)        { return PropertiesService.getDocumentProperties().getProperty(key); }
function Platform_kvSet(key, value) {        PropertiesService.getDocumentProperties().setProperty(key, value); }
function Platform_kvDelete(key)     {        PropertiesService.getDocumentProperties().deleteProperty(key); }

/**
 * Atomic JSON queue operations. Use for SaveScheduleService availability queue, etc.
 * GAS: lock + read+modify+write JSON in PropertiesService.
 * Node: SQL transaction OR Redis LPUSH/RPOP.
 */
function Platform_queuePush(key, item) {
  return Platform_withLock('queue:' + key, function () {
    var raw  = Platform_kvGet(key);
    var arr  = raw ? JSON.parse(raw) : [];
    arr.push(item);
    Platform_kvSet(key, JSON.stringify(arr));
    return { length: arr.length };
  });
}

function Platform_queueShift(key) {
  return Platform_withLock('queue:' + key, function () {
    var raw  = Platform_kvGet(key);
    var arr  = raw ? JSON.parse(raw) : [];
    var item = arr.shift() || null;
    Platform_kvSet(key, JSON.stringify(arr));
    return { item: item, remaining: arr.length };
  });
}

function Platform_queueLength(key) {
  var raw = Platform_kvGet(key);
  if (!raw) return 0;
  try { return JSON.parse(raw).length; } catch (_) { return -1; }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. IScheduler — recurring jobs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure a recurring job is registered. Idempotent.
 * GAS: ScriptApp time-based trigger.
 * Node: cron entry OR queue worker registration.
 */
function Platform_ensureRecurringJob(handlerName, intervalMin) {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === handlerName;
  });
  if (existing.length) return { created: false, handler: handlerName };
  ScriptApp.newTrigger(handlerName).timeBased().everyMinutes(intervalMin).create();
  return { created: true, handler: handlerName, intervalMin: intervalMin };
}

function Platform_listJobs() {
  return ScriptApp.getProjectTriggers().map(function (t) {
    return { handler: t.getHandlerFunction(), source: String(t.getTriggerSource()) };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. IClock — time + timezone
// ═══════════════════════════════════════════════════════════════════════════

function Platform_nowISO()     { return new Date().toISOString(); }
function Platform_now()        { return new Date(); }
function Platform_todayISO()   { return Utilities.formatDate(new Date(), Platform_timezone(), 'yyyy-MM-dd'); }
function Platform_timezone()   { return Session.getScriptTimeZone(); }

/**
 * Format a Date as 'yyyy-MM-dd' in the platform timezone.
 * GAS: Utilities.formatDate. Node: Intl.DateTimeFormat or luxon.
 */
function Platform_formatDateISO(date) {
  return Utilities.formatDate(date, Platform_timezone(), 'yyyy-MM-dd');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. IIdentity — current user
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Email of currently authenticated user.
 * GAS: Session.getActiveUser().getEmail() (only works for org users).
 * Node: req.user.email from auth middleware.
 */
function Platform_currentUserEmail() {
  try {
    var e = Session.getActiveUser().getEmail();
    if (!e) throw new Error('empty');
    return String(e).trim().toLowerCase();
  } catch (e) {
    throw new Error('Platform: cannot resolve current user email (Session unavailable)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostics + version
// ═══════════════════════════════════════════════════════════════════════════

function Platform_diagnose() {
  return {
    version: PLATFORM_VERSION,
    runtime: PLATFORM_RUNTIME,
    ports: {
      IPersistence: ['findRowByKey','readRow','setCell','setCells','appendRow','deleteRow'],
      ILock:        ['withLock','tryLock'],
      IKeyValue:    ['kvGet','kvSet','kvDelete','queuePush','queueShift','queueLength'],
      IScheduler:   ['ensureRecurringJob','listJobs'],
      IClock:       ['nowISO','now','todayISO','timezone','formatDateISO'],
      IIdentity:    ['currentUserEmail']
    },
    migrationNote: 'Replace this file with Node adapter when migrating; domain services unchanged.'
  };
}
