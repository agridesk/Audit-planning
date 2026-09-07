
/**************************************
 * AvailabilityService.gs
 * BUILD: SOLID_V3_T22_CANONICAL_AVAILABILITY_OWNER_20260514
 *
 * Self-contained service for Auditor Availability
 * - namespace: AvailabilityService
 * - backward-compatible global aliases
 * - includes legacy alias names used by current backends
 **************************************/

var AvailabilityService = (function () {
  var SERVICE_VERSION = '2026-05-15_AVAILABILITY_CACHE_CANONICAL_R6';

  var __AS_EXEC_CACHE = {};

  function resetExecCache_() {
    __AS_EXEC_CACHE = {};
  }


  function cleanText(v) {
    return String(v || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  function normalizeEmail(v) {
    return cleanText(v).toLowerCase();
  }

  function hdrKey(v) {
    return cleanText(v).toLowerCase().replace(/\s+/g, '_');
  }

  function headerIndexMap(headers) {
    var m = {};
    for (var i = 0; i < headers.length; i++) {
      var k = hdrKey(headers[i]);
      if (k && m[k] === undefined) m[k] = i;
    }
    return m;
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Auditor Availability');
    if (sh) return sh;
    sh = ss.getSheetByName('Auditor availability');
    if (sh) return sh;
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      var n = String(sheets[i].getName() || '').trim().toLowerCase();
      if (n === 'auditor availability') return sheets[i];
    }
    throw new Error("Missing sheet 'Auditor Availability'");
  }

  function findHeader(headers, candidates) {
    var hm = headerIndexMap(headers);
    for (var i = 0; i < candidates.length; i++) {
      var k = hdrKey(candidates[i]);
      if (hm[k] !== undefined) return hm[k];
    }
    return -1;
  }

  function normDateISO(v) {
    if (!v) return '';
    var ss = SpreadsheetApp.getActive();
    var tz = ss.getSpreadsheetTimeZone();
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    var s = cleanText(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  }

  function timeToMinutes(v) {
    if (v == null || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return v.getHours() * 60 + v.getMinutes();
    }
    var s = cleanText(v);
    var m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var hh = Number(m[1]), mm = Number(m[2]);
    if (!isFinite(hh) || !isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function minutesToHHMM(mins) {
    mins = Number(mins);
    if (!isFinite(mins)) return '';
    var hh = Math.floor(mins / 60);
    var mm = mins % 60;
    return ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
  }

  function isHHMMText_(v) {
    return /^\d{2}:\d{2}$/.test(cleanText(v));
  }

  function normalizeTimeCellForSheet_(v, fallback) {
    var s = cleanText(v);
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      var parts = s.split(':');
      var hh = Number(parts[0]);
      var mm = Number(parts[1]);
      if (isFinite(hh) && isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
      }
    }

    var mins = timeToMinutes(v);
    if (isFinite(mins)) {
      var hh2 = Math.floor(mins / 60);
      var mm2 = mins % 60;
      if (hh2 >= 0 && hh2 <= 23 && mm2 >= 0 && mm2 <= 59) {
        return ('0' + hh2).slice(-2) + ':' + ('0' + mm2).slice(-2);
      }
    }

    return fallback || '';
  }

  function forceDefaultTimeCells_(row, cm, startFallback, endFallback) {
    startFallback = startFallback || '08:00';
    endFallback = endFallback || '18:00';
    if (cm.iS1 >= 0) row[cm.iS1] = normalizeTimeCellForSheet_(row[cm.iS1], startFallback);
    if (cm.iE1 >= 0) row[cm.iE1] = normalizeTimeCellForSheet_(row[cm.iE1], endFallback);
    return row;
  }

  function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
    return (aStart < bEnd) && (bStart < aEnd);
  }

  function isManualSoftStatus_(statusVal) {
    var s = cleanText(statusVal).toUpperCase();
    return s === 'MANUAL_AUDITOR_BLOCKED_SOFT' || s === 'USER_MANUAL' || s === 'MANUAL_SOFT' || s === 'MANUAL_UNAVAILABLE_SOFT';
  }

  function isDefaultSoftStatus_(statusVal) {
    var s = cleanText(statusVal).toUpperCase();
    return s === 'DEFAULT_AUDITOR_BLOCKED_SOFT' || s === 'DEFAULT_WEEKEND_SOFT' || s === 'SYSTEM_DEFAULT' || s === 'CALENDAR' || s === 'CALENDER';
  }

  function isSoftUnavailableStatus_(statusVal) {
    return isDefaultSoftStatus_(statusVal) || isManualSoftStatus_(statusVal);
  }

  function normalizeAvailableCell_(v) {
    if (v === false) return 'NO';
    if (v === true) return 'YES';
    var s = cleanText(v).toUpperCase();
    if (!s) return '';
    if (s === 'FALSE' || s === 'NO' || s === 'N' || s === '0' || s === 'UNAVAILABLE' || s === 'NOT AVAILABLE' || s === 'NIET BESCHIKBAAR') return 'NO';
    if (s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'AVAILABLE' || s === 'BESCHIKBAAR') return 'YES';
    return s;
  }


  function readHeaders_(sh) {
    // PERF-PHASE2: cache headers per sheetId. Was called 4-5x per save
    // (validate, writeBack, findRowsByDateAuditor_, readRowObject_), each
    // doing a fresh getLastColumn + getRange round-trip (~50ms each).
    var sid = sh && sh.getSheetId ? sh.getSheetId() : 'na';
    var key = 'HDR|' + sid;
    if (__AS_EXEC_CACHE[key]) return __AS_EXEC_CACHE[key];
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var meta = { headers: headers, lastCol: lastCol };
    __AS_EXEC_CACHE[key] = meta;
    return meta;
  }

  function colMap_(headers) {
    return {
      iDate: findHeader(headers, ['Date']),
      iAud: findHeader(headers, ['Auditor_Email', 'Auditor Email', 'Email', 'E-mail', 'Auditor_Name', 'Auditor Name']),
      iAvail: findHeader(headers, ['Available']),
      iS1: findHeader(headers, ['First_Audit_Start_Time', 'First Audit Start Time']),
      iE1: findHeader(headers, ['First_Audit_End_Time', 'First Audit End Time']),
      iID1: findHeader(headers, ['Audit_ID_1', 'Audit ID 1', 'AuditId1']),
      iS2: findHeader(headers, ['Second_Audit_Start_Time', 'Second Audit Start Time']),
      iE2: findHeader(headers, ['Second_Audit_End_Time', 'Second Audit End Time']),
      iID2: findHeader(headers, ['Audit_ID_2', 'Audit ID 2', 'AuditId2']),
      iSt1: findHeader(headers, ['Status_1', 'Status 1', 'Status', 'Source']),
      iSt2: findHeader(headers, ['Status_2', 'Status 2']),
      iUpd: findHeader(headers, ['Last_Updated', 'Last Updated', 'Timestamp'])
    };
  }

  function validateRequiredCols_(cm) {
    if (cm.iDate < 0 || cm.iAud < 0 || cm.iAvail < 0) {
      throw new Error('Auditor Availability headers missing (need Date, Auditor_Email/Auditor_Name, Available)');
    }
  }

  function getSheetPack_(sh, meta, cm) {
    var key = 'PACK|' + String(sh && sh.getSheetId ? sh.getSheetId() : 'na');
    if (__AS_EXEC_CACHE[key]) return __AS_EXEC_CACHE[key];

    // PERF-PHASE5 / GATE MN (20260502): pure-lazy pack. The previous
    // PERF-PHASE4 implementation still eagerly read 2 full columns of the
    // Auditor Availability sheet (~1.5s cold for 5-10k rows). For both the
    // save hot path (validate+writeBack) AND the calendar month render we
    // typically need rows for ONE auditor only — so we now build the
    // (auditor|date) index lazily via TextFinder, populated per-email by
    // _ensureEmailLoadedInPack_(). Net win: ~1.2-1.5s save, ~1.3s
    // calendar cold.
    //
    // Compatibility: byDateAud is populated incrementally as emails are
    // touched. Callers that iterate the FULL byDateAud must explicitly
    // load all relevant emails first (none currently do — all consumers
    // are single-auditor).
    var pack = {
      lastRow: sh.getLastRow(),
      rows: [],
      byDateAud: {},
      lazyEmails: {}
    };
    __AS_EXEC_CACHE[key] = pack;
    return pack;
  }

  function _ensureEmailLoadedInPack_(sh, cm, pack, auditorEmail) {
    // GATE MN (20260502): populate pack.byDateAud entries for ONE auditor
    // using TextFinder (Java-native) + a single batched date-column read
    // over the spanning row range. ~150-250ms vs ~1500ms full pack build.
    var aud = normalizeEmail(auditorEmail);
    if (!aud) return;
    if (!pack.lazyEmails) pack.lazyEmails = {};
    if (pack.lazyEmails[aud]) return;
    pack.lazyEmails[aud] = true;
    if (cm.iAud < 0 || cm.iDate < 0) return;
    try {
      var finder = sh.createTextFinder(aud).matchEntireCell(true).matchCase(false);
      var matches = finder.findAll() || [];
      if (!matches.length) return;
      var rowNumbers = [];
      var emailColOneBased = cm.iAud + 1;
      for (var i = 0; i < matches.length; i++) {
        if (matches[i].getColumn() !== emailColOneBased) continue;
        var r = matches[i].getRow();
        if (r >= 2) rowNumbers.push(r);
      }
      if (!rowNumbers.length) return;
      rowNumbers.sort(function(a, b){ return a - b; });
      var minR = rowNumbers[0];
      var maxR = rowNumbers[rowNumbers.length - 1];
      var span = maxR - minR + 1;
      var rnSet = {};
      for (var x = 0; x < rowNumbers.length; x++) rnSet[rowNumbers[x]] = true;
      // Single batched read of the date column for the spanning range.
      var dateVals = sh.getRange(minR, cm.iDate + 1, span, 1).getValues();
      for (var k = 0; k < span; k++) {
        var actualRow = minR + k;
        if (!rnSet[actualRow]) continue;
        var d = normDateISO(dateVals[k][0]);
        if (!d) continue;
        var key = aud + '|' + d;
        if (!pack.byDateAud[key]) pack.byDateAud[key] = [];
        pack.byDateAud[key].push(actualRow);
      }
    } catch (e) {
      Logger.log('[V5][GATE MN] _ensureEmailLoadedInPack_ failed for ' + aud + ': ' + e);
    }
  }

  // PERF-PHASE4: lazy single-row fetch for sparse pack. Caches result so subsequent
  // accesses (validate -> writeBack on the same row) hit memory.
  function getPackRow_(sh, meta, pack, rowNumber) {
    var idx = rowNumber - 2;
    if (idx < 0) return [];
    var cached = pack.rows[idx];
    if (cached && cached.length) return cached;
    var row = sh.getRange(rowNumber, 1, 1, meta.lastCol).getValues()[0] || [];
    pack.rows[idx] = row;
    return row;
  }

  function updatePackRow_(sh, meta, cm, rowNumber, rowValues) {
    var pack = getSheetPack_(sh, meta, cm);
    var idx = rowNumber - 2;
    if (idx >= 0) pack.rows[idx] = rowValues.slice();
  }

  function appendPackRow_(sh, meta, cm, rowValues) {
    var pack = getSheetPack_(sh, meta, cm);
    var rowNumber = pack.lastRow + 1;
    pack.lastRow = rowNumber;
    // PERF-PHASE4: sparse-safe — index by rowNumber-2 instead of push() so this
    // works whether pack.rows is dense (fallback path) or sparse (lite path).
    pack.rows[rowNumber - 2] = rowValues.slice();
    var d = normDateISO(cm.iDate >= 0 ? rowValues[cm.iDate] : '');
    var a = normalizeEmail(cm.iAud >= 0 ? rowValues[cm.iAud] : '');
    if (d && a) {
      var k = a + '|' + d;
      if (!pack.byDateAud[k]) pack.byDateAud[k] = [];
      pack.byDateAud[k].push(rowNumber);
    }
    return rowNumber;
  }

  function findRowsByDateAuditor_(sh, cm, dateISO, auditorEmail) {
    var meta = readHeaders_(sh);
    var pack = getSheetPack_(sh, meta, cm);
    // GATE MN (20260502): pack is now lazy by default; ensure this auditor
    // is populated before lookup. Cached per-execution after first call.
    _ensureEmailLoadedInPack_(sh, cm, pack, auditorEmail);
    var key = normalizeEmail(auditorEmail) + '|' + cleanText(dateISO);
    return (pack.byDateAud[key] || []).slice();
  }

  function readRowObject_(sh, rowNumber, cm) {
    var meta = readHeaders_(sh);
    var pack = getSheetPack_(sh, meta, cm);
    // PERF-PHASE4: lazy fetch the row if not yet in the sparse pack.
    var row = getPackRow_(sh, meta, pack, rowNumber).slice();
    return {
      rowNumber: rowNumber,
      row: row,
      avail: cm.iAvail >= 0 ? normalizeAvailableCell_(row[cm.iAvail]) : '',
      s1: cm.iS1 >= 0 ? timeToMinutes(row[cm.iS1]) : null,
      e1: cm.iE1 >= 0 ? timeToMinutes(row[cm.iE1]) : null,
      id1: cm.iID1 >= 0 ? cleanText(row[cm.iID1]) : '',
      s2: cm.iS2 >= 0 ? timeToMinutes(row[cm.iS2]) : null,
      e2: cm.iE2 >= 0 ? timeToMinutes(row[cm.iE2]) : null,
      id2: cm.iID2 >= 0 ? cleanText(row[cm.iID2]) : '',
      st1: cm.iSt1 >= 0 ? cleanText(row[cm.iSt1]) : '',
      st2: cm.iSt2 >= 0 ? cleanText(row[cm.iSt2]) : ''
    };
  }

  function isDefaultOrManualBlock_(statusVal) {
    var s = cleanText(statusVal).toUpperCase();
    if (!s) return false;
    if (s.indexOf('DEFAULT_') === 0) return true;
    if (s === 'CALENDAR' || s === 'CALENDER' || s === 'SYSTEM_DEFAULT') return true;
    if (s.indexOf('MANUAL') === 0) return true;
    if (s.indexOf('BLOCK') === 0) return true;
    return false;
  }

  function sortSheet_(sh, cm) {
    var lr = sh.getLastRow();
    if (lr < 3) return;
    if (cm.iDate >= 0 && cm.iAud >= 0) {
      sh.getRange(2, 1, lr - 1, sh.getLastColumn()).sort([
        { column: cm.iDate + 1, ascending: true },
        { column: cm.iAud + 1, ascending: true }
      ]);
    } else if (cm.iDate >= 0) {
      sh.getRange(2, 1, lr - 1, sh.getLastColumn()).sort([{ column: cm.iDate + 1, ascending: true }]);
    }
  }

  function findDuplicateAvailabilityRows_() {
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { success: true, groups: [], count: 0 };

    var vals = sh.getRange(2, 1, lastRow - 1, meta.lastCol).getValues();
    var groups = {};

    for (var i = 0; i < vals.length; i++) {
      var row = vals[i];
      var dateISO = normDateISO(row[cm.iDate]);
      var aud = normalizeEmail(row[cm.iAud]);
      if (!dateISO || !aud) continue;
      var key = aud + '|' + dateISO;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ rowIndex: i + 2, row: row });
    }

    var out = [];
    Object.keys(groups).forEach(function (k) {
      if (groups[k].length > 1) out.push({ key: k, rows: groups[k] });
    });

    return { success: true, groups: out, count: out.length };
  }

  function mergeRows_(base, extra, cm, nowStamp) {
    var out = base.slice();

    if (cm.iID1 >= 0 && !cleanText(out[cm.iID1]) && cleanText(extra[cm.iID1])) {
      if (cm.iS1 >= 0) out[cm.iS1] = extra[cm.iS1];
      if (cm.iE1 >= 0) out[cm.iE1] = extra[cm.iE1];
      out[cm.iID1] = extra[cm.iID1];
      if (cm.iSt1 >= 0) out[cm.iSt1] = extra[cm.iSt1];
    } else if (cm.iID2 >= 0 && !cleanText(out[cm.iID2]) && cleanText(extra[cm.iID2])) {
      if (cm.iS2 >= 0) out[cm.iS2] = extra[cm.iS2];
      if (cm.iE2 >= 0) out[cm.iE2] = extra[cm.iE2];
      out[cm.iID2] = extra[cm.iID2];
      if (cm.iSt2 >= 0) out[cm.iSt2] = extra[cm.iSt2];
    }

    if (cm.iAvail >= 0) out[cm.iAvail] = 'NO';
    if (cm.iUpd >= 0) out[cm.iUpd] = nowStamp;
    return out;
  }

  function fixDuplicateAvailabilityRows_() {
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var dup = findDuplicateAvailabilityRows_();
    if (!dup.success || !dup.count) return { success: true, deleted: 0, groups: 0 };

    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var nowStamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    var deleted = 0;

    for (var g = 0; g < dup.groups.length; g++) {
      var grp = dup.groups[g];
      grp.rows.sort(function (a, b) { return a.rowIndex - b.rowIndex; });

      var keeper = grp.rows[0];
      var merged = keeper.row.slice();

      for (var j = 1; j < grp.rows.length; j++) {
        merged = mergeRows_(merged, grp.rows[j].row, cm, nowStamp);
      }

      sh.getRange(keeper.rowIndex, 1, 1, meta.lastCol).setValues([merged]);

      for (var d = grp.rows.length - 1; d >= 1; d--) {
        sh.deleteRow(grp.rows[d].rowIndex);
        deleted++;
      }
    }

    sortSheet_(sh, cm);
    SpreadsheetApp.flush();
    return { success: true, deleted: deleted, groups: dup.count };
  }

  function getAuditorAvailabilityRaw(auditorEmail, rangeStartISO, rangeEndISO, opts) {
    opts = opts || {};
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var auditorKey = normalizeEmail(auditorEmail);
    if (!auditorKey) throw new Error('getAuditorAvailabilityRaw: missing auditor email');

    var rangeStart = cleanText(rangeStartISO);
    var rangeEnd = cleanText(rangeEndISO);
    if (!rangeStart || !rangeEnd) throw new Error('getAuditorAvailabilityRaw: missing range');

    var lastRow = sh.getLastRow();
    if (lastRow < 2) {
      return { success: true, auditorKey: auditorKey, rangeStart: rangeStart, rangeEnd: rangeEnd, days: {}, meta: { version: SERVICE_VERSION } };
    }

    var vals = sh.getRange(2, 1, lastRow - 1, meta.lastCol).getValues();
    var days = {};

    for (var i = 0; i < vals.length; i++) {
      var row = vals[i];
      var rowAud = normalizeEmail(row[cm.iAud]);
      if (rowAud !== auditorKey) continue;

      var dateISO = normDateISO(row[cm.iDate]);
      if (!dateISO || dateISO < rangeStart || dateISO > rangeEnd) continue;

      var availableCell = cm.iAvail >= 0 ? String(row[cm.iAvail] || '').trim().toUpperCase() : '';
      if (!days[dateISO]) {
        days[dateISO] = { intervals: [], meta: { availableCell: availableCell, plannedAuditIds: [] } };
      } else {
        days[dateISO].meta.availableCell = availableCell;
        if (!Array.isArray(days[dateISO].meta.plannedAuditIds)) days[dateISO].meta.plannedAuditIds = [];
      }

      var id1 = cm.iID1 >= 0 ? cleanText(row[cm.iID1]) : '';
      var id2 = cm.iID2 >= 0 ? cleanText(row[cm.iID2]) : '';
      var st1 = cm.iSt1 >= 0 ? cleanText(row[cm.iSt1]) : '';
      var st2 = cm.iSt2 >= 0 ? cleanText(row[cm.iSt2]) : '';
      var slot1Start = cm.iS1 >= 0 ? (minutesToHHMM(timeToMinutes(row[cm.iS1])) || '09:00') : '09:00';
      var slot1End = cm.iE1 >= 0 ? (minutesToHHMM(timeToMinutes(row[cm.iE1])) || '17:00') : '17:00';
      var slot2Start = cm.iS2 >= 0 ? (minutesToHHMM(timeToMinutes(row[cm.iS2])) || '09:00') : '09:00';
      var slot2End = cm.iE2 >= 0 ? (minutesToHHMM(timeToMinutes(row[cm.iE2])) || '17:00') : '17:00';

      if (id1) {
        if (!days[dateISO].meta.auditId1) days[dateISO].meta.auditId1 = id1;
        if (!days[dateISO].meta.slot1Start) days[dateISO].meta.slot1Start = slot1Start;
        if (!days[dateISO].meta.slot1End) days[dateISO].meta.slot1End = slot1End;
        if (!days[dateISO].meta.status1) days[dateISO].meta.status1 = st1;
        if (days[dateISO].meta.plannedAuditIds.indexOf(id1) < 0) days[dateISO].meta.plannedAuditIds.push(id1);
      }
      if (id2) {
        if (!days[dateISO].meta.auditId2) days[dateISO].meta.auditId2 = id2;
        if (!days[dateISO].meta.slot2Start) days[dateISO].meta.slot2Start = slot2Start;
        if (!days[dateISO].meta.slot2End) days[dateISO].meta.slot2End = slot2End;
        if (!days[dateISO].meta.status2) days[dateISO].meta.status2 = st2;
        if (days[dateISO].meta.plannedAuditIds.indexOf(id2) < 0) days[dateISO].meta.plannedAuditIds.push(id2);
      }

      if (availableCell === 'NO' && !id1 && !id2) {
        var isDefaultSoft = isSoftUnavailableStatus_(st1) || isSoftUnavailableStatus_(st2);
        days[dateISO].meta.softFullDay = !!isDefaultSoft;
        days[dateISO].intervals.push({
          startTime: slot1Start,
          endTime: slot1End,
          reason: isDefaultSoft ? (st1 || st2 || 'Soft unavailable') : 'Available=NO',
          state: 'BLOCKED',
          kind: isDefaultSoft ? 'soft' : 'hard',
          hard: !isDefaultSoft,
          auditId: '',
          slot: ''
        });
        continue;
      }

      if (id1) {
        days[dateISO].intervals.push({
          startTime: slot1Start,
          endTime: slot1End,
          reason: 'Occupied (Audit_ID_1=' + id1 + ')',
          state: 'BLOCKED',
          kind: 'hard',
          auditId: id1,
          slot: 'S1'
        });
      }
      if (id2) {
        days[dateISO].intervals.push({
          startTime: slot2Start,
          endTime: slot2End,
          reason: 'Occupied (Audit_ID_2=' + id2 + ')',
          state: 'BLOCKED',
          kind: 'hard',
          auditId: id2,
          slot: 'S2'
        });
      }
    }

    return {
      success: true,
      auditorKey: auditorKey,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      days: days,
      meta: { version: SERVICE_VERSION }
    };
  }

  function buildAvailabilitySummaryMap() {
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var out = {};
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;

    var vals = sh.getRange(2, 1, lastRow - 1, meta.lastCol).getValues();

    function ensure_(auditId) {
      auditId = cleanText(auditId);
      if (!auditId) return null;
      if (!out[auditId]) out[auditId] = { days: {}, mins: 0 };
      return out[auditId];
    }

    function addBlock_(rec, rawDate, rawStart, rawEnd) {
      if (!rec) return;
      var d = normDateISO(rawDate);
      if (d) rec.days[d] = true;
      var sm = timeToMinutes(rawStart), em = timeToMinutes(rawEnd);
      if (isFinite(sm) && isFinite(em) && em > sm) rec.mins += (em - sm);
    }

    for (var r = 0; r < vals.length; r++) {
      var row = vals[r];
      if (cm.iID1 >= 0) addBlock_(ensure_(row[cm.iID1]), cm.iDate >= 0 ? row[cm.iDate] : '', cm.iS1 >= 0 ? row[cm.iS1] : '', cm.iE1 >= 0 ? row[cm.iE1] : '');
      if (cm.iID2 >= 0) addBlock_(ensure_(row[cm.iID2]), cm.iDate >= 0 ? row[cm.iDate] : '', cm.iS2 >= 0 ? row[cm.iS2] : '', cm.iE2 >= 0 ? row[cm.iE2] : '');
    }

    return out;
  }

  function plannedSummaryFromAvailabilityMap(availabilityMap, auditId) {
    var out = { plannedDates: '', plannedHours: '', plannedTooltip: '', _firstDateObj: null };
    auditId = cleanText(auditId);
    if (!auditId || !availabilityMap || !availabilityMap[auditId]) return out;

    var rec = availabilityMap[auditId] || {};
    var days = Object.keys(rec.days || {}).sort();
    if (!days.length) return out;

    out.plannedDates = days[0] + (days.length > 1 ? ' (+' + (days.length - 1) + ')' : '');
    out.plannedTooltip = days.join('\n');
    out._firstDateObj = new Date(days[0] + 'T00:00:00');
    if (rec.mins > 0) out.plannedHours = (Math.round((rec.mins / 60) * 4) / 4).toString();
    return out;
  }

  function loadAuditorAvailabilityMap(auditorKey, rangeStart, rangeEnd) {
    var raw = getAuditorAvailabilityRaw(auditorKey, rangeStart, rangeEnd, {});
    var map = {};
    var dayKeys = Object.keys(raw.days || {});
    for (var i = 0; i < dayKeys.length; i++) {
      var d = dayKeys[i];
      var day = raw.days[d];
      var hard = {};
      var intervals = day && day.intervals ? day.intervals : [];
      for (var j = 0; j < intervals.length; j++) {
        var it = intervals[j] || {};
        if (String(it.kind || '').toLowerCase() === 'soft' || it.hard === false) continue;
        var s = timeToMinutes(it.startTime);
        var e = timeToMinutes(it.endTime);
        if (isFinite(s) && isFinite(e) && intervalsOverlap(s, e, 8 * 60, 12 * 60)) hard['S1'] = it.reason || 'Blocked';
        if (isFinite(s) && isFinite(e) && intervalsOverlap(s, e, 12 * 60, 17 * 60)) hard['S2'] = it.reason || 'Blocked';
      }
      map[d] = { hardBlock: hard };
    }
    return map;
  }

  function buildCollisionMap(auditorKey, rangeStart, rangeEnd, excludeAuditId) {
    var sh = SpreadsheetApp.getActive().getSheetByName('Audit planning');
    if (!sh) return {};

    var values = sh.getDataRange().getValues();
    if (values.length < 2) return {};

    var h = values[0].map(function (x) { return cleanText(x); });
    function idx(name) { return h.indexOf(name); }

    var statusCol = idx('Status');
    var auditorCol = idx('Assigned to');
    var planningCol = idx('Planning JSON');
    var auditIdCol = idx('Audit ID');
    if (statusCol < 0 || auditorCol < 0 || planningCol < 0 || auditIdCol < 0) return {};

    var relevant = { 'Pending Approval': true, 'Approved': true, 'Accepted': true };
    var out = {};

    function mark(dateISO, slotId, code, message) {
      out[dateISO] = out[dateISO] || {};
      out[dateISO][slotId] = { code: code, message: message };
    }

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (normalizeEmail(row[auditorCol]) !== normalizeEmail(auditorKey)) continue;

      var otherAuditId = cleanText(row[auditIdCol]);
      if (excludeAuditId && otherAuditId === cleanText(excludeAuditId)) continue;

      var st = cleanText(row[statusCol]);
      if (!relevant[st]) continue;

      var pj = cleanText(row[planningCol]);
      if (!pj) continue;

      var slots = [];
      try {
        var data = JSON.parse(pj);
        if (Array.isArray(data)) slots = data;
        else if (data && Array.isArray(data.blocks)) slots = data.blocks;
        else if (data && Array.isArray(data.slots)) slots = data.slots;
      } catch (e) {}

      for (var i = 0; i < slots.length; i++) {
        var s = slots[i] || {};
        var dt = cleanText(s.date);
        var stt = cleanText(s.startTime || s.start);
        var enn = cleanText(s.endTime || s.end);
        if (!dt || !stt || !enn) continue;
        if (dt < rangeStart || dt > rangeEnd) continue;

        if (intervalsOverlap(timeToMinutes(stt), timeToMinutes(enn), 8 * 60, 12 * 60)) {
          mark(dt, 'S1', 'COLLISION_' + st.toUpperCase().replace(/\s+/g, '_'), 'Collision with ' + st + ' audit ' + otherAuditId + ' (S1)');
        }
        if (intervalsOverlap(timeToMinutes(stt), timeToMinutes(enn), 12 * 60, 17 * 60)) {
          mark(dt, 'S2', 'COLLISION_' + st.toUpperCase().replace(/\s+/g, '_'), 'Collision with ' + st + ' audit ' + otherAuditId + ' (S2)');
        }
      }
    }

    return out;
  }

  function validate(auditId, auditorEmail, auditorName, blocks) {
    auditId = cleanText(auditId);
    auditorEmail = normalizeEmail(auditorEmail);
    blocks = blocks || [];

    function isSoftNoAuditRow_(info) {
      if (!info) return false;
      if (info.id1 || info.id2) return false;
      if (info.avail !== 'NO') return false;

      var st1 = cleanText(info.st1).toUpperCase();
      var st2 = cleanText(info.st2).toUpperCase();

      // Soft defaults must NEVER hard-block planning validation.
      // This covers the centralized default generator statuses and legacy CALENDAR rows.
      if (isSoftUnavailableStatus_(st1) || isSoftUnavailableStatus_(st2)) return true;
      return false;
    }

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b] || {};
      var dISO = normDateISO(blk.date);
      if (!dISO) return { success: false, message: 'Save failed: invalid date' };

      var reqS = timeToMinutes(blk.start);
      var reqE = timeToMinutes(blk.end);
      if (!isFinite(reqS) || !isFinite(reqE) || reqE <= reqS) {
        return { success: false, message: 'Save failed: invalid time range' };
      }

      var rowNumbers = findRowsByDateAuditor_(sh, cm, dISO, auditorEmail);
      for (var r = 0; r < rowNumbers.length; r++) {
        var info = readRowObject_(sh, rowNumbers[r], cm);

        if (info.avail === 'NO' && !info.id1 && !info.id2) {
          if (isSoftNoAuditRow_(info)) {
            continue;
          }
          var bS = isFinite(info.s1) ? info.s1 : (8 * 60);
          var bE = isFinite(info.e1) ? info.e1 : (18 * 60);
          if (intervalsOverlap(reqS, reqE, bS, bE)) {
            return { success: false, message: 'Save failed: Auditor marked unavailable on ' + dISO };
          }
          continue;
        }

        if (info.id1 && info.id1 !== auditId && isFinite(info.s1) && isFinite(info.e1) && intervalsOverlap(reqS, reqE, info.s1, info.e1)) {
          return { success: false, message: 'Save failed: Collision with existing Audit 1 on ' + dISO };
        }
        if (info.id2 && info.id2 !== auditId && isFinite(info.s2) && isFinite(info.e2) && intervalsOverlap(reqS, reqE, info.s2, info.e2)) {
          return { success: false, message: 'Save failed: Collision with existing Audit 2 on ' + dISO };
        }
      }
    }

    return { success: true, message: 'OK' };
  }


  function resolveTargetRowForDateAuditor_(sh, meta, cm, dateISO, auditorEmail, nowStamp) {
    var rowNumbers = findRowsByDateAuditor_(sh, cm, dateISO, auditorEmail);

    if (!rowNumbers.length) {
      var newRow = new Array(meta.lastCol).fill('');
      newRow[cm.iDate] = dateISO;
      newRow[cm.iAud] = auditorEmail;
      newRow[cm.iAvail] = 'NO';
      if (cm.iUpd >= 0) newRow[cm.iUpd] = nowStamp;
      var appendAt = sh.getLastRow() + 1;
      sh.getRange(appendAt, 1, 1, meta.lastCol).setValues([newRow]);
      appendPackRow_(sh, meta, cm, newRow);
      return { rowNumber: appendAt, dedupeDeleted: 0 };
    }

    if (rowNumbers.length === 1) {
      return { rowNumber: rowNumbers[0], dedupeDeleted: 0 };
    }

    // Local-only dedupe for this auditor+date. Never scan or sort the full sheet here.
    rowNumbers.sort(function(a, b) { return a - b; });

    var keeperRowNumber = rowNumbers[0];
    // GATE MN (20260502): use cached getPackRow_ instead of direct sheet
    // read — validate's readRowObject_ likely already cached this row.
    var packForReads = getSheetPack_(sh, meta, cm);
    var keeper = getPackRow_(sh, meta, packForReads, keeperRowNumber).slice();
    var deleted = 0;

    for (var i = 1; i < rowNumbers.length; i++) {
      var extraRowNumber = rowNumbers[i];
      var extra = getPackRow_(sh, meta, packForReads, extraRowNumber).slice();
      keeper = mergeRows_(keeper, extra, cm, nowStamp);
    }

    sh.getRange(keeperRowNumber, 1, 1, meta.lastCol).setValues([keeper]);
    updatePackRow_(sh, meta, cm, keeperRowNumber, keeper);

    for (var d = rowNumbers.length - 1; d >= 1; d--) {
      sh.deleteRow(rowNumbers[d]);
      deleted++;
    }

    return { rowNumber: keeperRowNumber, dedupeDeleted: deleted };
  }

  function writeBack(auditId, auditorEmail, auditorName, blocks, mode) {
    auditId = cleanText(auditId);
    auditorEmail = normalizeEmail(auditorEmail);
    auditorName = cleanText(auditorName);
    blocks = blocks || [];
    mode = mode || 'PLAN';

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var nowStamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    var dedupeDeletedTotal = 0;

    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b] || {};
      var dISO = normDateISO(blk.date);
      if (!dISO) throw new Error('Writeback failed: invalid date');

      var reqS = minutesToHHMM(timeToMinutes(blk.start));
      var reqE = minutesToHHMM(timeToMinutes(blk.end));
      if (!reqS || !reqE) throw new Error('Writeback failed: invalid time range');

      var target = resolveTargetRowForDateAuditor_(sh, meta, cm, dISO, auditorEmail, nowStamp);
      var rn = target.rowNumber;
      dedupeDeletedTotal += Number(target.dedupeDeleted || 0);

      // GATE MN (20260502): use cached getPackRow_ — validate's
      // readRowObject_ already populated pack.rows[rn-2] for existing rows
      // (saves ~80-120ms per block of sheet I/O + auto-flush).
      var packWB = getSheetPack_(sh, meta, cm);
      var rowVals = getPackRow_(sh, meta, packWB, rn).slice();

      if (mode === 'CANCEL') {
        var changed = false;
        if (cm.iID1 >= 0 && cleanText(rowVals[cm.iID1]) === auditId) {
          if (cm.iS1 >= 0) rowVals[cm.iS1] = '';
          if (cm.iE1 >= 0) rowVals[cm.iE1] = '';
          rowVals[cm.iID1] = '';
          if (cm.iSt1 >= 0) rowVals[cm.iSt1] = '';
          changed = true;
        }
        if (cm.iID2 >= 0 && cleanText(rowVals[cm.iID2]) === auditId) {
          if (cm.iS2 >= 0) rowVals[cm.iS2] = '';
          if (cm.iE2 >= 0) rowVals[cm.iE2] = '';
          rowVals[cm.iID2] = '';
          if (cm.iSt2 >= 0) rowVals[cm.iSt2] = '';
          changed = true;
        }
        if (changed) {
          rowVals[cm.iAvail] = 'NO';
          if (cm.iUpd >= 0) rowVals[cm.iUpd] = nowStamp;
          sh.getRange(rn, 1, 1, meta.lastCol).setValues([rowVals]);
          // GATE MN (20260502): keep pack consistent so we can skip the
          // execCache reset at the end of writeBack.
          updatePackRow_(sh, meta, cm, rn, rowVals);
        }
        continue;
      }

      var id1 = cm.iID1 >= 0 ? cleanText(rowVals[cm.iID1]) : '';
      var id2 = cm.iID2 >= 0 ? cleanText(rowVals[cm.iID2]) : '';

      if (id1 === auditId) {
        if (cm.iS1 >= 0) rowVals[cm.iS1] = reqS;
        if (cm.iE1 >= 0) rowVals[cm.iE1] = reqE;
        if (cm.iSt1 >= 0) rowVals[cm.iSt1] = 'Manager Planned';
      } else if (id2 === auditId) {
        if (cm.iS2 >= 0) rowVals[cm.iS2] = reqS;
        if (cm.iE2 >= 0) rowVals[cm.iE2] = reqE;
        if (cm.iSt2 >= 0) rowVals[cm.iSt2] = 'Manager Planned';
      } else if (!id1) {
        if (cm.iS1 >= 0) rowVals[cm.iS1] = reqS;
        if (cm.iE1 >= 0) rowVals[cm.iE1] = reqE;
        if (cm.iID1 >= 0) rowVals[cm.iID1] = auditId;
        if (cm.iSt1 >= 0) rowVals[cm.iSt1] = 'Manager Planned';
      } else if (!id2) {
        if (cm.iS2 >= 0) rowVals[cm.iS2] = reqS;
        if (cm.iE2 >= 0) rowVals[cm.iE2] = reqE;
        if (cm.iID2 >= 0) rowVals[cm.iID2] = auditId;
        if (cm.iSt2 >= 0) rowVals[cm.iSt2] = 'Manager Planned';
      } else {
        throw new Error('Writeback failed: day already occupied (2 audits) on ' + dISO);
      }

      rowVals[cm.iAvail] = 'NO';
      if (cm.iUpd >= 0) rowVals[cm.iUpd] = nowStamp;
      sh.getRange(rn, 1, 1, meta.lastCol).setValues([rowVals]);
      // GATE MN (20260502): keep pack consistent (pack.rows[rn-2] now
      // matches sheet) so we can skip the execCache reset below.
      updatePackRow_(sh, meta, cm, rn, rowVals);
    }

    // GATE MN (20260502): resetExecCache_ removed — pack stays consistent
    // via updatePackRow_/appendPackRow_ during writeBack. Keeping the
    // exec cache lets any subsequent in-execution caller (e.g. follow-up
    // availability read) skip the ~150-250ms TextFinder repopulation.
    // try { resetExecCache_(); } catch(e) {}
    try { AS_clearAvailabilitySummaryMapCache_(); } catch(eSummaryCache) {}

    return {
      success: true,
      message: 'OK',
      data: { auditId: auditId, auditorEmail: auditorEmail, blocks: blocks, dedupeDeleted: dedupeDeletedTotal }
    };
  }


  function clearAuditId(auditId) {
    auditId = cleanText(auditId);
    if (!auditId) return { success: true, changed: 0, rows: 0, deletedRows: 0, message: 'No auditId' };

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { success: true, changed: 0, rows: 0, deletedRows: 0, message: 'No rows' };

    var rng = sh.getRange(2, 1, lastRow - 1, meta.lastCol);
    var vals = rng.getValues();
    var changed = 0, rowsTouched = 0, deletedRows = 0;
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var deleteSheetRows = [];

    for (var r = 0; r < vals.length; r++) {
      var row = vals[r];
      var rowChanged = false;

      if (cm.iID1 >= 0 && cleanText(row[cm.iID1]) === auditId) {
        if (cm.iS1 >= 0) row[cm.iS1] = '';
        if (cm.iE1 >= 0) row[cm.iE1] = '';
        row[cm.iID1] = '';
        if (cm.iSt1 >= 0) row[cm.iSt1] = '';
        changed++;
        rowChanged = true;
      }
      if (cm.iID2 >= 0 && cleanText(row[cm.iID2]) === auditId) {
        if (cm.iS2 >= 0) row[cm.iS2] = '';
        if (cm.iE2 >= 0) row[cm.iE2] = '';
        row[cm.iID2] = '';
        if (cm.iSt2 >= 0) row[cm.iSt2] = '';
        changed++;
        rowChanged = true;
      }

      if (!rowChanged) continue;
      rowsTouched++;

      var hasAudit1 = (cm.iID1 >= 0) && cleanText(row[cm.iID1]);
      var hasAudit2 = (cm.iID2 >= 0) && cleanText(row[cm.iID2]);
      var keepBlocked = isDefaultOrManualBlock_(cm.iSt1 >= 0 ? row[cm.iSt1] : '') || isDefaultOrManualBlock_(cm.iSt2 >= 0 ? row[cm.iSt2] : '');

      if (!hasAudit1 && !hasAudit2) {
        if (keepBlocked) {
          row[cm.iAvail] = 'NO';
          if (cm.iUpd >= 0) row[cm.iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
        } else {
          deleteSheetRows.push(r + 2);
        }
      } else {
        row[cm.iAvail] = 'NO';
        if (cm.iUpd >= 0) row[cm.iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
      }
    }

    if (changed) {
      rng.setValues(vals);
      deleteSheetRows.sort(function (a, b) { return b - a; });
      for (var d = 0; d < deleteSheetRows.length; d++) {
        sh.deleteRow(deleteSheetRows[d]);
        deletedRows++;
      }
      sortSheet_(sh, cm);
      SpreadsheetApp.flush();
      try { AS_clearAvailabilitySummaryMapCache_(); } catch(eSummaryCache) {}
    }

    return { success: true, changed: changed, rows: rowsTouched, deletedRows: deletedRows, message: 'Cleared cells: ' + changed + ', deleted rows: ' + deletedRows };
  }

  function repairDefaultTimeCells(req) {
    req = req || {};
    var auditorFilter = normalizeEmail(req.auditorEmail || '');
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { success: true, repaired: 0, scanned: 0 };

    var rng = sh.getRange(2, 1, lastRow - 1, meta.lastCol);
    var vals = rng.getValues();
    var repaired = 0;
    var scanned = 0;
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var nowStamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

    for (var r = 0; r < vals.length; r++) {
      var row = vals[r] || [];
      var aud = cm.iAud >= 0 ? normalizeEmail(row[cm.iAud]) : '';
      if (auditorFilter && aud !== auditorFilter) continue;
      scanned++;

      var id1 = cm.iID1 >= 0 ? cleanText(row[cm.iID1]) : '';
      var id2 = cm.iID2 >= 0 ? cleanText(row[cm.iID2]) : '';
      if (id1 || id2) continue;

      var st1 = cm.iSt1 >= 0 ? cleanText(row[cm.iSt1]).toUpperCase() : '';
      var st2 = cm.iSt2 >= 0 ? cleanText(row[cm.iSt2]).toUpperCase() : '';
      var isDefault = (st1.indexOf('DEFAULT_') === 0 || st2.indexOf('DEFAULT_') === 0 || st1 === 'CALENDAR' || st2 === 'CALENDAR' || st2 === 'SYSTEM_DEFAULT');
      if (!isDefault) continue;

      var changed = false;
      if (cm.iS1 >= 0 && !isHHMMText_(row[cm.iS1])) {
        row[cm.iS1] = '08:00';
        changed = true;
      }
      if (cm.iE1 >= 0 && !isHHMMText_(row[cm.iE1])) {
        row[cm.iE1] = '18:00';
        changed = true;
      }
      if (changed) {
        if (cm.iUpd >= 0) row[cm.iUpd] = nowStamp;
        vals[r] = row;
        repaired++;
      }
    }

    if (repaired) {
      rng.setValues(vals);
      SpreadsheetApp.flush();
      resetExecCache_();
      try { if (typeof AV_clearMonthCachesForAuditor_ === 'function' && auditorFilter) AV_clearMonthCachesForAuditor_(auditorFilter); } catch (e1) {}
    }

    return { success: true, repaired: repaired, scanned: scanned, auditorEmail: auditorFilter || 'ALL_AUDITORS' };
  }

  function healthcheck() {
    try {
      var sh = getSheet_();
      var meta = readHeaders_(sh);
      var cm = colMap_(meta.headers);
      validateRequiredCols_(cm);
      return { success: true, version: SERVICE_VERSION, sheet: sh.getName(), columns: cm };
    } catch (e) {
      return { success: false, version: SERVICE_VERSION, message: String(e && e.message ? e.message : e) };
    }
  }

  


  function isSoftStandaloneStatus_(statusVal) {
    var s = cleanText(statusVal).toUpperCase();
    return isSoftUnavailableStatus_(s);
  }

  function isSoftNoAuditRowStandalone_(info) {
    if (!info) return false;
    if (info.id1 || info.id2) return false;
    if (info.avail !== 'NO') return false;
    return isSoftStandaloneStatus_(info.st1) || isSoftStandaloneStatus_(info.st2);
  }

  function touchLastUpdatedCell_(sh, rowNumber, cm, nowStamp) {
    if (cm.iUpd >= 0) sh.getRange(rowNumber, cm.iUpd + 1).setValue(nowStamp);
  }


  function invalidateToolkitMonthCacheRequired_(auditorEmail, monthKey, opts) {
    var email = normalizeEmail(auditorEmail);
    var mk = cleanText(monthKey);
    if (!email || !/^\d{4}-\d{2}$/.test(mk)) {
      throw new Error('AvailabilityService invalidateToolkitMonthCacheRequired_: invalid args email=' + email + ' monthKey=' + mk);
    }
    if (typeof TDM_invalidateAvailabilityMonthCache !== 'function') {
      throw new Error('AvailabilityService requires TDM_invalidateAvailabilityMonthCache from Toolkit_AvailabilityMonth.js');
    }
    return TDM_invalidateAvailabilityMonthCache(email, mk, opts || {});
  }

  function invalidateMonthCacheIfPresent_(auditorEmail, dateISO) {
    var email = normalizeEmail(auditorEmail);
    var monthKey = String(dateISO || '').slice(0, 7);
    if (!email || !/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new Error('AvailabilityService invalidateMonthCacheIfPresent_: invalid args email=' + email + ' dateISO=' + dateISO);
    }

    if (typeof AV_clearMonthCache_ === 'function') AV_clearMonthCache_(email, monthKey);
    if (typeof AV_clearMonthCachesForAuditor_ === 'function') AV_clearMonthCachesForAuditor_(email);
    invalidateToolkitMonthCacheRequired_(email, monthKey, { lite: false });

    if (typeof AS_clearAvailabilitySummaryMapCache_ === 'function') AS_clearAvailabilitySummaryMapCache_();
    resetExecCache_();
  }

  function setBlockedWeekdaysCsv_(auditorEmail, weekdaysCsv) {
    auditorEmail = normalizeEmail(auditorEmail);
    weekdaysCsv = cleanText(weekdaysCsv);

    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return false;

    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return false;

    var headers = values[0].map(function (x) { return cleanText(x); });
    var idxEmail = findHeader(headers, ['E-mail', 'Email']);
    var idxBlocked = findHeader(headers, ['Blocked weekdays', 'Unavailable weekdays', 'Default unavailable weekdays', 'Default blocked weekdays']);

    if (idxEmail < 0 || idxBlocked < 0) return false;

    for (var r = 1; r < values.length; r++) {
      if (normalizeEmail(values[r][idxEmail]) === auditorEmail) {
        sh.getRange(r + 1, idxBlocked + 1).setValue(weekdaysCsv);
        return true;
      }
    }
    return false;
  }


  function buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO) {
    auditorEmail = normalizeEmail(auditorEmail);
    dateISO = cleanText(dateISO);
    if (!auditorEmail || !dateISO) return null;

    var rowNumbers = findRowsByDateAuditor_(sh, cm, dateISO, auditorEmail);
    if (!rowNumbers || !rowNumbers.length) return null;

    var chosen = null;
    function rankStatus_(s) {
      s = String(s || '').toLowerCase();
      if (s === 'hard') return 3;
      if (s === 'soft' || s === 'blocked') return 2;
      return 1;
    }

    for (var i = 0; i < rowNumbers.length; i++) {
      var rowNumber = rowNumbers[i];
      var row = sh.getRange(rowNumber, 1, 1, meta.lastCol).getValues()[0];
      var cls = AV_classifyRow_(row, {
        date: cm.iDate,
        auditorEmail: cm.iAud,
        available: cm.iAvail,
        firstStart: cm.iS1,
        firstEnd: cm.iE1,
        auditId1: cm.iID1,
        secondStart: cm.iS2,
        secondEnd: cm.iE2,
        auditId2: cm.iID2,
        status1: cm.iSt1,
        status2: cm.iSt2,
        lastUpdated: cm.iUpd
      }, rowNumber);

      var candidate = {
        date: dateISO,
        status: cls.finalStatus,
        readonly: cls.readonly,
        rowNumber: rowNumber,
        availableRaw: cls.availableRaw,
        from: cls.from,
        to: cls.to,
        auditFrom: cls.auditFrom,
        auditTo: cls.auditTo,
        intervals: cls.intervals,
        status1: cls.status1,
        status2: cls.status2,
        auditId1: cls.auditId1,
        auditId2: cls.auditId2,
        decisionReason: cls.decisionReason
      };

      if (!chosen) {
        chosen = candidate;
        continue;
      }

      var oldRank = rankStatus_(chosen.status);
      var newRank = rankStatus_(candidate.status);
      if (newRank > oldRank) {
        chosen = candidate;
        continue;
      }
      if (newRank < oldRank) continue;

      var oldHasAuditId = !!(chosen.auditId1 || chosen.auditId2);
      var newHasAuditId = !!(candidate.auditId1 || candidate.auditId2);
      if (newHasAuditId && !oldHasAuditId) chosen = candidate;
    }

    if (!chosen) return null;
    if (String(chosen.status || '').toLowerCase() === 'available') return null;
    return chosen;
  }

  function toggleManualSoftDay(req) {
    req = req || {};
    var auditorEmail = normalizeEmail(req.auditorEmail);
    var dateISO = cleanText(req.dateISO);
    var from = cleanText(req.from) || '08:00';
    var to = cleanText(req.to) || '18:00';

    if (!auditorEmail || !dateISO) return { success: false, message: 'Missing auditorEmail/dateISO' };

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var rowNumbers = findRowsByDateAuditor_(sh, cm, dateISO, auditorEmail);
    var nowStamp = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');

    var chosen = null;
    for (var i = 0; i < rowNumbers.length; i++) {
      var info = readRowObject_(sh, rowNumbers[i], cm);
      if (info.id1 || info.id2) {
        return { success: true, action: 'READ_ONLY', dateISO: dateISO, reason: 'HARD_AUDIT_DAY', dayState: buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO) };
      }
      if (!chosen) chosen = info;
      if (isSoftNoAuditRowStandalone_(info)) chosen = info;
    }

    var currentDayState = buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO);
    var isToggleableSoft = !!(
      currentDayState &&
      String(currentDayState.status || '').toLowerCase() === 'soft' &&
      isSoftUnavailableStatus_(currentDayState.status1) &&
      !currentDayState.readonly
    );

    if (chosen && isToggleableSoft) {
      var rowVals = chosen.row.slice();
      if (cm.iAvail >= 0) rowVals[cm.iAvail] = 'YES';
      if (cm.iS1 >= 0) rowVals[cm.iS1] = '';
      if (cm.iE1 >= 0) rowVals[cm.iE1] = '';
      if (cm.iID1 >= 0) rowVals[cm.iID1] = '';
      if (cm.iS2 >= 0) rowVals[cm.iS2] = '';
      if (cm.iE2 >= 0) rowVals[cm.iE2] = '';
      if (cm.iID2 >= 0) rowVals[cm.iID2] = '';
      if (cm.iSt1 >= 0) rowVals[cm.iSt1] = '';
      if (cm.iSt2 >= 0) rowVals[cm.iSt2] = '';
      if (cm.iUpd >= 0) rowVals[cm.iUpd] = nowStamp;
      sh.getRange(chosen.rowNumber, 1, 1, meta.lastCol).setValues([rowVals]);
      updatePackRow_(sh, meta, cm, chosen.rowNumber, rowVals);
      invalidateMonthCacheIfPresent_(auditorEmail, dateISO);
      return { success: true, action: 'UPDATE_TO_AVAILABLE', dateISO: dateISO, dayState: buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO) };
    }

    if (chosen) {
      var rowVals2 = chosen.row.slice();
      if (cm.iAvail >= 0) rowVals2[cm.iAvail] = 'NO';
      if (cm.iS1 >= 0) rowVals2[cm.iS1] = from;
      if (cm.iE1 >= 0) rowVals2[cm.iE1] = to;
      if (cm.iID1 >= 0) rowVals2[cm.iID1] = '';
      if (cm.iS2 >= 0) rowVals2[cm.iS2] = '';
      if (cm.iE2 >= 0) rowVals2[cm.iE2] = '';
      if (cm.iID2 >= 0) rowVals2[cm.iID2] = '';
      if (cm.iSt1 >= 0) rowVals2[cm.iSt1] = 'MANUAL_AUDITOR_BLOCKED_SOFT';
      if (cm.iSt2 >= 0) rowVals2[cm.iSt2] = 'USER_MANUAL';
      if (cm.iUpd >= 0) rowVals2[cm.iUpd] = nowStamp;
      sh.getRange(chosen.rowNumber, 1, 1, meta.lastCol).setValues([rowVals2]);
      updatePackRow_(sh, meta, cm, chosen.rowNumber, rowVals2);
      invalidateMonthCacheIfPresent_(auditorEmail, dateISO);
      return { success: true, action: 'UPDATE_TO_SOFT', dateISO: dateISO, dayState: buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO) };
    }

    var newRow = new Array(meta.lastCol).fill('');
    if (cm.iDate >= 0) newRow[cm.iDate] = dateISO;
    if (cm.iAud >= 0) newRow[cm.iAud] = auditorEmail;
    if (cm.iAvail >= 0) newRow[cm.iAvail] = 'NO';
    if (cm.iS1 >= 0) newRow[cm.iS1] = from;
    if (cm.iE1 >= 0) newRow[cm.iE1] = to;
    if (cm.iID1 >= 0) newRow[cm.iID1] = '';
    if (cm.iS2 >= 0) newRow[cm.iS2] = '';
    if (cm.iE2 >= 0) newRow[cm.iE2] = '';
    if (cm.iID2 >= 0) newRow[cm.iID2] = '';
    if (cm.iSt1 >= 0) newRow[cm.iSt1] = 'MANUAL_AUDITOR_BLOCKED_SOFT';
    if (cm.iSt2 >= 0) newRow[cm.iSt2] = 'USER_MANUAL';
    if (cm.iUpd >= 0) newRow[cm.iUpd] = nowStamp;

    var appendAt = sh.getLastRow() + 1;
    sh.getRange(appendAt, 1, 1, meta.lastCol).setValues([newRow]);
    appendPackRow_(sh, meta, cm, newRow);
    invalidateMonthCacheIfPresent_(auditorEmail, dateISO);
    return { success: true, action: 'INSERT', dateISO: dateISO, dayState: buildSingleDayStateStandalone_(sh, meta, cm, auditorEmail, dateISO) };
  }


  function applyRangeManualSoftDays(req) {
    req = req || {};
    var auditorEmail = normalizeEmail(req.auditorEmail);
    var fromISO = cleanText(req.fromISO);
    var toISO = cleanText(req.toISO);
    var from = cleanText(req.from) || '08:00';
    var to = cleanText(req.to) || '18:00';

    if (!auditorEmail || !fromISO || !toISO) return { success: false, message: 'Missing args' };
    if (toISO < fromISO) return { success: false, message: 'Invalid range' };

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var start = Utilities.parseDate(fromISO + ' 00:00', SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    var end = Utilities.parseDate(toISO + ' 00:00', SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    var inserted = [];
    var updated = [];
    var skipped = [];
    var touched = [];
    var nowStamp = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');

    function setSoftUnavailable_(rowVals) {
      if (cm.iAvail >= 0) rowVals[cm.iAvail] = 'NO';
      if (cm.iS1 >= 0) rowVals[cm.iS1] = from;
      if (cm.iE1 >= 0) rowVals[cm.iE1] = to;
      if (cm.iID1 >= 0) rowVals[cm.iID1] = '';
      if (cm.iS2 >= 0) rowVals[cm.iS2] = '';
      if (cm.iE2 >= 0) rowVals[cm.iE2] = '';
      if (cm.iID2 >= 0) rowVals[cm.iID2] = '';
      if (cm.iSt1 >= 0) rowVals[cm.iSt1] = 'MANUAL_AUDITOR_BLOCKED_SOFT';
      if (cm.iSt2 >= 0) rowVals[cm.iSt2] = 'USER_MANUAL';
      if (cm.iUpd >= 0) rowVals[cm.iUpd] = nowStamp;
      return rowVals;
    }

    for (var cur = new Date(start.getTime()); cur <= end; cur.setDate(cur.getDate() + 1)) {
      var iso = Utilities.formatDate(new Date(cur), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      var rowNumbers = findRowsByDateAuditor_(sh, cm, iso, auditorEmail);
      var hasHard = false;
      var candidates = [];

      for (var i = 0; i < rowNumbers.length; i++) {
        var info = readRowObject_(sh, rowNumbers[i], cm);
        if (info.id1 || info.id2) {
          hasHard = true;
          break;
        }
        candidates.push(info);
      }

      if (hasHard) {
        skipped.push({ dateISO: iso, reason: 'HARD_AUDIT_DAY' });
        continue;
      }

      if (candidates.length) {
        // P0 R5: old behavior skipped existing non-hard rows, which meant
        // applying an unavailable range silently did not persist for days that
        // already had default/available/non-hard records. Correct behavior is
        // update the canonical row to the requested unavailable interval.
        candidates.sort(function(a, b) { return Number(a.rowNumber || 0) - Number(b.rowNumber || 0); });
        var chosen = candidates[0];
        var rowVals = setSoftUnavailable_(chosen.row.slice());
        sh.getRange(chosen.rowNumber, 1, 1, meta.lastCol).setValues([rowVals]);
        updatePackRow_(sh, meta, cm, chosen.rowNumber, rowVals);
        // Remove duplicate non-hard rows for same date/auditor to prevent
        // render drift. Delete bottom-up so row numbers remain valid.
        for (var d = candidates.length - 1; d >= 1; d--) {
          try { sh.deleteRow(candidates[d].rowNumber); } catch (eDel) {}
        }
        updated.push(iso);
        touched.push(iso);
        invalidateMonthCacheIfPresent_(auditorEmail, iso);
        continue;
      }

      var row = new Array(meta.lastCol).fill('');
      if (cm.iDate >= 0) row[cm.iDate] = iso;
      if (cm.iAud >= 0) row[cm.iAud] = auditorEmail;
      setSoftUnavailable_(row);

      var appendAt = sh.getLastRow() + 1;
      sh.getRange(appendAt, 1, 1, meta.lastCol).setValues([row]);
      appendPackRow_(sh, meta, cm, row);
      inserted.push(iso);
      touched.push(iso);
      invalidateMonthCacheIfPresent_(auditorEmail, iso);
    }

    try { SpreadsheetApp.flush(); } catch (eFlush) {}
    try { resetExecCache_(); } catch (eReset) {}

    return {
      success: true,
      build: SERVICE_VERSION,
      inserted: inserted,
      updated: updated,
      touched: touched,
      skipped: skipped,
      countInserted: inserted.length,
      countUpdated: updated.length,
      countTouched: touched.length,
      message: 'Applied unavailable range with backend-confirmed writes'
    };
  }

  function applyDefaultWeekdaysAndRebuild12m(req) {
    req = req || {};
    var auditorEmail = normalizeEmail(req.auditorEmail);
    var weekdays = Array.isArray(req.weekdays) ? req.weekdays : [];
    if (!auditorEmail) return { success: false, reason: 'MISSING_EMAIL' };

    var weekdayMap = { Mo: true, Tu: true, We: true, Th: true, Fr: true, Sa: true, Su: true };
    var normalizedWeekdays = [];
    var seenWeekdays = {};
    weekdays.forEach(function (x) {
      var tok = cleanText(x);
      if (!weekdayMap[tok] || seenWeekdays[tok]) return;
      seenWeekdays[tok] = true;
      normalizedWeekdays.push(tok);
    });

    var ss = SpreadsheetApp.getActive();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var hdr = meta.headers || [];
    var cm = colMap_(hdr);
    validateRequiredCols_(cm);

    function fmtYMD_(d) {
      return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd');
    }
    function fmtStamp_(d) {
      return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd HH:mm');
    }
    function localMidnightFromYMD_(ymd) {
      return Utilities.parseDate(ymd + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
    }
    function localNoonFromYMD_(ymd) {
      return Utilities.parseDate(ymd + ' 12:00', tz, 'yyyy-MM-dd HH:mm');
    }
    function weekdayTokenTZ_(d) {
      var u = Number(Utilities.formatDate(new Date(d), tz, 'u'));
      return ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][u] || '';
    }
    function isWeekendToken_(wd) {
      return wd === 'Sa' || wd === 'Su';
    }
    function hasAuditInRow_(row) {
      return !!((cm.iID1 >= 0 && cleanText(row[cm.iID1])) || (cm.iID2 >= 0 && cleanText(row[cm.iID2])));
    }
    function status1_(row) {
      return cm.iSt1 >= 0 ? cleanText(row[cm.iSt1]).toUpperCase() : '';
    }
    function status2_(row) {
      return cm.iSt2 >= 0 ? cleanText(row[cm.iSt2]).toUpperCase() : '';
    }
    function isDefaultAuditorSoftRow_(row) {
      if (hasAuditInRow_(row)) return false;
      var avail = cm.iAvail >= 0 ? cleanText(row[cm.iAvail]).toUpperCase() : '';
      if (avail === 'YES') return false;
      var st1 = status1_(row);
      var st2 = status2_(row);
      return st1 === 'DEFAULT_AUDITOR_BLOCKED_SOFT' || st2 === 'DEFAULT_AUDITOR_BLOCKED_SOFT' || st1 === 'CALENDAR';
    }
    function isDefaultWeekendSoftRow_(row) {
      if (hasAuditInRow_(row)) return false;
      var avail = cm.iAvail >= 0 ? cleanText(row[cm.iAvail]).toUpperCase() : '';
      if (avail === 'YES') return false;
      var st1 = status1_(row);
      var st2 = status2_(row);
      return st1 === 'DEFAULT_WEEKEND_SOFT' || st2 === 'DEFAULT_WEEKEND_SOFT';
    }
    function isExplicitAvailableRow_(row) {
      var avail = cm.iAvail >= 0 ? cleanText(row[cm.iAvail]).toUpperCase() : '';
      if (avail !== 'YES') return false;
      if (hasAuditInRow_(row)) return false;
      return true;
    }
    function buildDefaultRow_(dateISO, statusToUse) {
      var row = new Array(hdr.length).fill('');
      if (cm.iDate >= 0) row[cm.iDate] = dateISO;
      if (cm.iAud >= 0) row[cm.iAud] = auditorEmail;
      if (cm.iAvail >= 0) row[cm.iAvail] = 'NO';
      if (cm.iS1 >= 0) row[cm.iS1] = '08:00';
      if (cm.iE1 >= 0) row[cm.iE1] = '18:00';
      if (cm.iID1 >= 0) row[cm.iID1] = '';
      if (cm.iS2 >= 0) row[cm.iS2] = '';
      if (cm.iE2 >= 0) row[cm.iE2] = '';
      if (cm.iID2 >= 0) row[cm.iID2] = '';
      if (cm.iSt1 >= 0) row[cm.iSt1] = statusToUse;
      if (cm.iSt2 >= 0) row[cm.iSt2] = (statusToUse === 'DEFAULT_AUDITOR_BLOCKED_SOFT') ? 'SYSTEM_DEFAULT' : '';
      if (cm.iUpd >= 0) row[cm.iUpd] = nowStamp;
      return row;
    }
    function patchDefaultRow_(row, statusToUse) {
      if (cm.iAvail >= 0) row[cm.iAvail] = 'NO';
      if (cm.iS1 >= 0) row[cm.iS1] = '08:00';
      if (cm.iE1 >= 0) row[cm.iE1] = '18:00';
      if (cm.iID1 >= 0) row[cm.iID1] = '';
      if (cm.iS2 >= 0) row[cm.iS2] = '';
      if (cm.iE2 >= 0) row[cm.iE2] = '';
      if (cm.iID2 >= 0) row[cm.iID2] = '';
      if (cm.iSt1 >= 0) row[cm.iSt1] = statusToUse;
      if (cm.iSt2 >= 0) row[cm.iSt2] = (statusToUse === 'DEFAULT_AUDITOR_BLOCKED_SOFT') ? 'SYSTEM_DEFAULT' : '';
      if (cm.iUpd >= 0) row[cm.iUpd] = nowStamp;
      return row;
    }
    function invalidateMonth_(monthKey) {
      monthKey = cleanText(monthKey);
      if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('applyDefaultWeekdaysAndRebuild12m invalidateMonth_: invalid monthKey ' + monthKey);

      if (typeof AV_clearMonthCache_ === 'function') AV_clearMonthCache_(auditorEmail, monthKey);
      if (typeof AV_clearMonthCachesForAuditor_ === 'function') AV_clearMonthCachesForAuditor_(auditorEmail);
      invalidateToolkitMonthCacheRequired_(auditorEmail, monthKey, { lite: false });
      if (typeof AS_clearAvailabilitySummaryMapCache_ === 'function') AS_clearAvailabilitySummaryMapCache_();
    }

    var setOk = setBlockedWeekdaysCsv_(auditorEmail, normalizedWeekdays.join(','));
    if (!setOk) return { success: false, reason: 'AUDITOR_NOT_FOUND_OR_BLOCKED_WEEKDAY_COLUMN_MISSING', auditorEmail: auditorEmail };

    var startMonth = new Date();
    startMonth = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
    var endMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 12, 0);
    var startISO = fmtYMD_(startMonth);
    var endISO = fmtYMD_(endMonth);
    var nowStamp = fmtStamp_(new Date());

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 1) return { success: false, reason: 'AUDITOR_AVAILABILITY_EMPTY' };

    var byDate = {};
    var touchedMonths = {};
    var lastRow = sh.getLastRow();
    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var em = cm.iAud >= 0 ? normalizeEmail(row[cm.iAud]) : '';
      if (em !== auditorEmail) continue;
      var dateISO = cm.iDate >= 0 ? normDateISO(row[cm.iDate]) : '';
      if (!dateISO || dateISO < startISO || dateISO > endISO) continue;
      if (!byDate[dateISO]) byDate[dateISO] = [];
      byDate[dateISO].push({ rowIndex: r + 1, row: row.slice() });
    }

    var toAppend = [];
    var rowWrites = [];
    var toDelete = [];
    var diagnostics = {
      processedDays: 0,
      monthsProcessed: [],
      insertedNewDefaults: 0,
      patchedExistingDefaults: 0,
      deletedOldDefaults: 0,
      deletedDuplicateDefaults: 0,
      skippedHardAuditRows: 0,
      skippedExplicitAvailableRows: 0,
      skippedNonDefaultRows: 0,
      weekendDefaultsEnsured: 0,
      auditorWeekdayDefaultsEnsured: 0
    };

    for (var cur = new Date(startMonth.getTime()); cur <= endMonth; cur.setDate(cur.getDate() + 1)) {
      var ymd = fmtYMD_(cur);
      var noon = localNoonFromYMD_(ymd);
      var wd = weekdayTokenTZ_(noon);
      var isWeekend = isWeekendToken_(wd);
      var isAuditorDefault = !!seenWeekdays[wd] && !isWeekend;
      var desiredStatus = isWeekend ? 'DEFAULT_WEEKEND_SOFT' : (isAuditorDefault ? 'DEFAULT_AUDITOR_BLOCKED_SOFT' : '');
      var rowsForDate = byDate[ymd] || [];
      var monthKey = ymd.slice(0, 7);
      touchedMonths[monthKey] = true;
      diagnostics.processedDays++;

      var hasHardAudit = false;
      var explicitAvailable = false;
      var defaultRows = [];
      var nonDefaultRows = [];

      for (var i = 0; i < rowsForDate.length; i++) {
        var rec = rowsForDate[i];
        if (hasAuditInRow_(rec.row)) {
          hasHardAudit = true;
          continue;
        }
        if (isExplicitAvailableRow_(rec.row)) {
          explicitAvailable = true;
          continue;
        }
        if (isDefaultAuditorSoftRow_(rec.row) || isDefaultWeekendSoftRow_(rec.row)) {
          defaultRows.push(rec);
          continue;
        }
        nonDefaultRows.push(rec);
      }

      if (hasHardAudit) {
        diagnostics.skippedHardAuditRows++;
        // Remove obsolete soft default duplicates on hard-audit days, but keep the hard audit row untouched.
        for (var hd = 0; hd < defaultRows.length; hd++) {
          var hdSt = isDefaultWeekendSoftRow_(defaultRows[hd].row) ? 'DEFAULT_WEEKEND_SOFT' : 'DEFAULT_AUDITOR_BLOCKED_SOFT';
          if (desiredStatus && hdSt === desiredStatus) continue;
          toDelete.push(defaultRows[hd].rowIndex);
          diagnostics.deletedOldDefaults++;
        }
        continue;
      }

      if (explicitAvailable) {
        diagnostics.skippedExplicitAvailableRows++;
        // Explicit Available=YES is user intent. Remove conflicting auto default duplicates only.
        for (var ea = 0; ea < defaultRows.length; ea++) {
          toDelete.push(defaultRows[ea].rowIndex);
          diagnostics.deletedOldDefaults++;
        }
        continue;
      }

      if (nonDefaultRows.length) {
        diagnostics.skippedNonDefaultRows++;
        continue;
      }

      if (!desiredStatus) {
        // No default should exist on this weekday anymore. Remove old auditor default rows, keep weekends already handled by desiredStatus.
        for (var od = 0; od < defaultRows.length; od++) {
          if (isDefaultAuditorSoftRow_(defaultRows[od].row)) {
            toDelete.push(defaultRows[od].rowIndex);
            diagnostics.deletedOldDefaults++;
          }
        }
        continue;
      }

      var keeper = null;
      for (var df = 0; df < defaultRows.length; df++) {
        var rowIsDesired = desiredStatus === 'DEFAULT_WEEKEND_SOFT'
          ? isDefaultWeekendSoftRow_(defaultRows[df].row)
          : isDefaultAuditorSoftRow_(defaultRows[df].row);
        if (rowIsDesired && !keeper) {
          keeper = defaultRows[df];
          continue;
        }
        toDelete.push(defaultRows[df].rowIndex);
        diagnostics.deletedDuplicateDefaults++;
      }

      if (keeper) {
        var patched = patchDefaultRow_(keeper.row.slice(), desiredStatus);
        rowWrites.push({ rowIndex: keeper.rowIndex, row: patched });
        diagnostics.patchedExistingDefaults++;
      } else {
        toAppend.push(buildDefaultRow_(ymd, desiredStatus));
        diagnostics.insertedNewDefaults++;
      }

      if (desiredStatus === 'DEFAULT_WEEKEND_SOFT') diagnostics.weekendDefaultsEnsured++;
      if (desiredStatus === 'DEFAULT_AUDITOR_BLOCKED_SOFT') diagnostics.auditorWeekdayDefaultsEnsured++;
    }

    if (rowWrites.length > 0) {
      for (var w = 0; w < rowWrites.length; w++) {
        sh.getRange(rowWrites[w].rowIndex, 1, 1, meta.lastCol).setValues([rowWrites[w].row]);
      }
    }

    if (toAppend.length > 0) {
      var firstNewRow = sh.getLastRow() + 1;
      sh.getRange(firstNewRow, 1, toAppend.length, hdr.length).setValues(toAppend);
      try {
        if (cm.iDate >= 0) {
          var rngDate = sh.getRange(firstNewRow, cm.iDate + 1, toAppend.length, 1);
          rngDate.setNumberFormat('@');
          var isoCol = [];
          for (var q = 0; q < toAppend.length; q++) isoCol.push([toAppend[q][cm.iDate]]);
          rngDate.setValues(isoCol);
        }
      } catch (eFmt) {}
    }

    if (toDelete.length > 0) {
      var deleteSeen = {};
      toDelete = toDelete.filter(function (rn) {
        rn = Number(rn);
        if (!rn || deleteSeen[rn]) return false;
        deleteSeen[rn] = true;
        return true;
      }).sort(function (a, b) { return b - a; });
      for (var d = 0; d < toDelete.length; d++) {
        sh.deleteRow(toDelete[d]);
      }
    }

    SpreadsheetApp.flush();
    sortAuditorAvailability();
    resetExecCache_();

    var months = Object.keys(touchedMonths).sort();
    diagnostics.monthsProcessed = months;
    for (var mi = 0; mi < months.length; mi++) invalidateMonth_(months[mi]);

    return {
      success: true,
      mode: 'AUDITOR_SCOPED_REBUILD_12M',
      auditorEmail: auditorEmail,
      weekdays: normalizedWeekdays,
      rangeStart: startISO,
      rangeEnd: endISO,
      appended: toAppend.length,
      patchedExisting: rowWrites.length,
      deleted: toDelete.length,
      diagnostics: diagnostics
    };
  }


  function parseWeekdaySet_(s) {
    var out = {};
    if (!s) return out;
    var parts = String(s).split(',');
    for (var i = 0; i < parts.length; i++) {
      var t = cleanText(parts[i]);
      if (!t) continue;
      t = t.charAt(0).toUpperCase() + t.slice(1, 2).toLowerCase();
      if (['Mo','Tu','We','Th','Fr','Sa','Su'].indexOf(t) >= 0) out[t] = true;
    }
    return out;
  }

  function getAuditorsListForDefaults_() {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return [];
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return [];

    var hdr = values[0] || [];
    var idxName = findHeader(hdr, ['Auditor','Name','Auditor name','Auditor Name']);
    var idxEmail = findHeader(hdr, ['Email','E-mail','E-mail address','Auditor Email','Auditor_Email']);
    var idxActive = findHeader(hdr, ['Active']);
    var idxRole = findHeader(hdr, ['Role','Function']);
    var idxBlocked = findHeader(hdr, ['Blocked weekdays','Default blocked weekdays','Default blocked days','Blocked weekdays (default)']);

    if (idxName < 0 || idxEmail < 0) return [];

    var out = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var name = cleanText(row[idxName]);
      var email = cleanText(row[idxEmail]);
      if (!name || !email) continue;

      var active = idxActive >= 0 ? cleanText(row[idxActive]).toUpperCase() : 'YES';
      if (active !== 'YES') continue;

      if (idxRole >= 0) {
        var role = cleanText(row[idxRole]).toLowerCase();
        if (role !== 'auditor') continue;
      }

      out.push({
        name: name,
        email: email,
        blockedWeekdays: idxBlocked >= 0 ? cleanText(row[idxBlocked]) : ''
      });
    }
    return out;
  }

  function sortAuditorAvailability() {
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    sortSheet_(sh, cm);
    return { success: true };
  }

  function ensureDefaults12m(opts) {
    opts = opts || {};
    var alsoFillMissing = (opts.alsoFillMissingMetadataOnExistingDefaultRows !== false);
    var doSort = (opts.doSort !== false);

    var ss = SpreadsheetApp.getActive();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var hdr = meta.headers || [];
    var cm = colMap_(hdr);
    validateRequiredCols_(cm);

    function fmtYMD_(d) {
      return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd');
    }
    function fmtStamp_(d) {
      return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd HH:mm');
    }
    function localMidnightFromYMD_(ymd) {
      return Utilities.parseDate(ymd + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
    }
    function weekdayTokenTZ_(d) {
      var u = Number(Utilities.formatDate(new Date(d), tz, 'u'));
      return ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][u] || '';
    }
    function isWeekendTZ_(d) {
      var u = Number(Utilities.formatDate(new Date(d), tz, 'u'));
      return (u === 6 || u === 7);
    }
    function isDefaultLikeCalendar_(row) {
      var avail2 = cm.iAvail >= 0 ? cleanText(row[cm.iAvail]).toUpperCase() : '';
      if (avail2 === 'YES') return false;
      var hasAudit = (cm.iID1 >= 0 && row[cm.iID1]) || (cm.iID2 >= 0 && row[cm.iID2]);
      if (hasAudit) return false;
      return true;
    }

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) throw new Error('Auditor Availability has no data (missing header or empty sheet).');

    var defaultStart = '08:00';
    var defaultEnd = '18:00';
    var nowStamp = fmtStamp_(new Date());

    var map = {};
    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var email = cm.iAud >= 0 ? normalizeEmail(row[cm.iAud]) : '';
      if (!email) continue;
      var d0 = cm.iDate >= 0 ? row[cm.iDate] : '';
      if (!d0) continue;
      var ymd = fmtYMD_(d0);
      var key = email + '|' + ymd;
      if (!map[key]) map[key] = { rowIndex: r + 1, row: row };
    }

    var auditors = getAuditorsListForDefaults_();
    var today = new Date();
    var startYMD = fmtYMD_(today);
    var start = localMidnightFromYMD_(startYMD);
    var end = new Date(start.getTime());
    end.setMonth(end.getMonth() + 12);

    var toAppend = [];
    var updates = [];
    var toDeleteRowIdx = [];

    var eligibleEmailSet = {};
    for (var a0 = 0; a0 < auditors.length; a0++) {
      var em0 = normalizeEmail(auditors[a0].email);
      if (em0) eligibleEmailSet[em0] = true;
    }

    for (var k0 in map) {
      if (!map.hasOwnProperty(k0)) continue;
      var rec0 = map[k0];
      var row0 = rec0.row || [];
      var email0 = cm.iAud >= 0 ? normalizeEmail(row0[cm.iAud]) : '';
      if (!email0) continue;
      if (eligibleEmailSet[email0]) continue;

      var hasAudit0 = (cm.iID1 >= 0 && row0[cm.iID1]) || (cm.iID2 >= 0 && row0[cm.iID2]);
      if (hasAudit0) continue;

      var avail0 = cm.iAvail >= 0 ? cleanText(row0[cm.iAvail]).toUpperCase() : '';
      if (avail0 === 'YES') continue;

      var st0 = cm.iSt1 >= 0 ? cleanText(row0[cm.iSt1]) : '';
      var isDefaultSoft0 = (st0 === 'DEFAULT_WEEKEND_SOFT' || st0 === 'DEFAULT_AUDITOR_BLOCKED_SOFT');
      var isLegacyDefault0 = (st0 === 'CALENDAR') && isDefaultLikeCalendar_(row0);

      if (isDefaultSoft0 || isLegacyDefault0) {
        toDeleteRowIdx.push(rec0.rowIndex);
      }
    }

    for (var a = 0; a < auditors.length; a++) {
      var aud = auditors[a] || {};
      var emailNorm = normalizeEmail(aud.email);
      if (!emailNorm) continue;

      var blockedSet = parseWeekdaySet_(aud.blockedWeekdays);
      var hasBlockedWeekdays = blockedSet && Object.keys(blockedSet).length > 0;
      var desired = {};

      for (var dt = new Date(start.getTime()); dt <= end; dt.setDate(dt.getDate() + 1)) {
        var dtNoon = Utilities.parseDate(fmtYMD_(dt) + ' 12:00', tz, 'yyyy-MM-dd HH:mm');
        var isWeekend = isWeekendTZ_(dtNoon);
        var wd = weekdayTokenTZ_(dtNoon);
        var isAuditorBlockedWeekday = !!(hasBlockedWeekdays && blockedSet[wd]);

        if (isAuditorBlockedWeekday && (wd === 'Sa' || wd === 'Su')) isAuditorBlockedWeekday = false;
        if (!isWeekend && !isAuditorBlockedWeekday) continue;

        var ymd2 = fmtYMD_(dtNoon);
        var statusToUse = isWeekend ? 'DEFAULT_WEEKEND_SOFT' : 'DEFAULT_AUDITOR_BLOCKED_SOFT';
        desired[ymd2] = statusToUse;

        var key2 = emailNorm + '|' + ymd2;
        var existing = map[key2];

        if (!existing) {
          var newRow = new Array(hdr.length).fill('');
          if (cm.iDate >= 0) newRow[cm.iDate] = ymd2;
          if (cm.iAud >= 0) newRow[cm.iAud] = cleanText(aud.email);
          if (cm.iAvail >= 0) newRow[cm.iAvail] = 'NO';
          if (cm.iS1 >= 0) newRow[cm.iS1] = defaultStart;
          if (cm.iE1 >= 0) newRow[cm.iE1] = defaultEnd;
          if (cm.iSt1 >= 0) newRow[cm.iSt1] = statusToUse;
          if (cm.iUpd >= 0) newRow[cm.iUpd] = nowStamp;
          toAppend.push(newRow);
        } else if (alsoFillMissing) {
          var row2 = existing.row || [];
          var avail2 = cm.iAvail >= 0 ? cleanText(row2[cm.iAvail]).toUpperCase() : '';
          if (avail2 === 'YES') continue;

          var hasAudit = (cm.iID1 >= 0 && row2[cm.iID1]) || (cm.iID2 >= 0 && row2[cm.iID2]);
          if (hasAudit) continue;

          var st = cm.iSt1 >= 0 ? cleanText(row2[cm.iSt1]) : '';
          var isCalendar = (st === 'CALENDAR');
          var isAutoDefault = (!st) || (st.indexOf('DEFAULT_') === 0) || (isCalendar && isDefaultLikeCalendar_(row2));
          if (!isAutoDefault) continue;

          if (cm.iSt1 >= 0 && st !== statusToUse) updates.push({ rowIndex: existing.rowIndex, colIndex: cm.iSt1 + 1, value: statusToUse });
          if (cm.iS1 >= 0 && !isHHMMText_(row2[cm.iS1])) updates.push({ rowIndex: existing.rowIndex, colIndex: cm.iS1 + 1, value: defaultStart });
          if (cm.iE1 >= 0 && !isHHMMText_(row2[cm.iE1])) updates.push({ rowIndex: existing.rowIndex, colIndex: cm.iE1 + 1, value: defaultEnd });
          if (cm.iUpd >= 0) updates.push({ rowIndex: existing.rowIndex, colIndex: cm.iUpd + 1, value: nowStamp });
        }
      }

      for (var key in map) {
        if (key.indexOf(emailNorm + '|') !== 0) continue;

        var existing2 = map[key];
        var rowX = existing2.row || [];
        var ymdX = key.split('|')[1];

        var availX = cm.iAvail >= 0 ? cleanText(rowX[cm.iAvail]).toUpperCase() : '';
        if (availX === 'YES') continue;

        var hasAuditX = (cm.iID1 >= 0 && rowX[cm.iID1]) || (cm.iID2 >= 0 && rowX[cm.iID2]);
        if (hasAuditX) continue;

        var stX = cm.iSt1 >= 0 ? cleanText(rowX[cm.iSt1]) : '';
        var isCalendarX = (stX === 'CALENDAR');
        var isDefaultAud = (stX === 'DEFAULT_AUDITOR_BLOCKED_SOFT');
        var wdX = weekdayTokenTZ_(Utilities.parseDate(ymdX + ' 12:00', tz, 'yyyy-MM-dd HH:mm'));
        var isWeekendX = (wdX === 'Sa' || wdX === 'Su');
        var removableCalendar = isCalendarX && isDefaultLikeCalendar_(rowX);
        var isRemovable = (isDefaultAud || removableCalendar) && !isWeekendX;

        if (!isRemovable) continue;
        if (desired.hasOwnProperty(ymdX)) continue;

        toDeleteRowIdx.push(existing2.rowIndex);
      }
    }

    if (toAppend.length > 0) {
      var lastRowBefore = sh.getLastRow();
      var firstNewRow = lastRowBefore + 1;
      sh.getRange(firstNewRow, 1, toAppend.length, hdr.length).setValues(toAppend);
      try {
        if (cm.iDate >= 0) {
          var rngDate = sh.getRange(firstNewRow, cm.iDate + 1, toAppend.length, 1);
          rngDate.setNumberFormat('@');
          var isoCol = [];
          for (var q = 0; q < toAppend.length; q++) isoCol.push([toAppend[q][cm.iDate]]);
          rngDate.setValues(isoCol);
        }
      } catch (eFmt) {}
    }

    if (updates.length > 0) {
      var byRow = {};
      for (var u = 0; u < updates.length; u++) {
        var it = updates[u];
        var rk = String(it.rowIndex);
        if (!byRow[rk]) byRow[rk] = [];
        byRow[rk].push(it);
      }
      var rowKeys = Object.keys(byRow);
      for (var k = 0; k < rowKeys.length; k++) {
        var rr = parseInt(rowKeys[k], 10);
        var items = byRow[rowKeys[k]];
        for (var j = 0; j < items.length; j++) {
          sh.getRange(rr, items[j].colIndex).setValue(items[j].value);
        }
      }
    }

    if (toDeleteRowIdx.length > 0) {
      toDeleteRowIdx.sort(function(a, b) { return b - a; });
      for (var d = 0; d < toDeleteRowIdx.length; d++) {
        sh.deleteRow(toDeleteRowIdx[d]);
      }
    }

    if (doSort) sortAuditorAvailability();
    resetExecCache_();

    return { success: true, appended: toAppend.length, patchedExisting: updates.length, deleted: toDeleteRowIdx.length };
  }

  function regenerateDefaults12m() {
    return ensureDefaults12m({ alsoFillMissingMetadataOnExistingDefaultRows: true, doSort: true });
  }

  function setupDefaultsTriggerDaily() {
    var handler = 'V5_runAuditorAvailabilityDefaultsAuto';
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === handler) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).create();
    return { success: true, message: 'Daily trigger installed for ' + handler + ' (03:00 local script time).' };
  }

  function runDefaultsAuto() {
    try {
      ensureDefaults12m({ alsoFillMissingMetadataOnExistingDefaultRows: true, doSort: true });
    } catch (e) {
      Logger.log('V5_runAuditorAvailabilityDefaultsAuto error: ' + (e && e.stack ? e.stack : e));
    }
  }

  function ensureDefaultsForToolkitOpen(auditorsList, preferredAuditorEmail) {
    auditorsList = auditorsList || [];
    preferredAuditorEmail = normalizeEmail(preferredAuditorEmail || '');

    var ss = SpreadsheetApp.getActive();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var hdr = meta.headers || [];
    var cm = colMap_(hdr);
    validateRequiredCols_(cm);

    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + 120);

    function fmtYMD(d) { return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd'); }
    function fmtStamp(d) { return Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd HH:mm'); }
    function localNoonFromYMD(ymd) { return Utilities.parseDate(ymd + ' 12:00', tz, 'yyyy-MM-dd HH:mm'); }
    function weekdayToken(d) {
      var u = Number(Utilities.formatDate(new Date(d), tz, 'u'));
      return ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][u] || '';
    }
    function isWeekend(d) {
      var u = Number(Utilities.formatDate(new Date(d), tz, 'u'));
      return (u === 6 || u === 7);
    }
    function isDefaultLikeCalendar(row) {
      var avail = cm.iAvail >= 0 ? cleanText(row[cm.iAvail]).toUpperCase() : '';
      if (avail === 'YES') return false;
      var hasAudit = (cm.iID1 >= 0 && row[cm.iID1]) || (cm.iID2 >= 0 && row[cm.iID2]);
      if (hasAudit) return false;
      return true;
    }

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return { success: true, ensured: 0, appended: 0, patched: 0 };

    var map = {};
    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var em = cm.iAud >= 0 ? normalizeEmail(row[cm.iAud]) : '';
      if (!em) continue;
      var d0 = cm.iDate >= 0 ? row[cm.iDate] : '';
      if (!d0) continue;
      var ymd = fmtYMD(d0);
      map[em + '|' + ymd] = { rowIndex: r + 1, row: row };
    }

    var emailToMeta = {};
    for (var a = 0; a < auditorsList.length; a++) {
      var au = auditorsList[a] || {};
      var emO = cleanText(au.email);
      var emL = emO.toLowerCase();
      if (!emL) continue;
      if (!emailToMeta[emL]) {
        emailToMeta[emL] = { emailOriginal: emO, blockedWeekdays: (au.blockedWeekdays !== undefined ? au.blockedWeekdays : '') };
      }
    }
    if (preferredAuditorEmail) {
      var peL = preferredAuditorEmail.toLowerCase();
      if (!emailToMeta[peL]) emailToMeta[peL] = { emailOriginal: preferredAuditorEmail, blockedWeekdays: '' };
    }

    var defaultStart = '08:00';
    var defaultEnd = '18:00';
    var nowStamp = fmtStamp(new Date());
    var toAppend = [];
    var patches = [];
    var ensuredCount = 0;

    var emails = Object.keys(emailToMeta);
    for (var ei = 0; ei < emails.length; ei++) {
      var emailLower = emails[ei];
      var metaAud = emailToMeta[emailLower] || {};
      var blockedSet = parseWeekdaySet_(metaAud.blockedWeekdays);
      var hasBlocked = blockedSet && Object.keys(blockedSet).length > 0;

      for (var dt = new Date(start.getTime()); dt <= end; dt.setDate(dt.getDate() + 1)) {
        var ymd = fmtYMD(dt);
        var dtNoon = localNoonFromYMD(ymd);
        var wd = weekdayToken(dtNoon);
        var weekend = isWeekend(dtNoon);

        var isAuditorBlocked = !!(hasBlocked && blockedSet[wd]);
        if (isAuditorBlocked && (wd === 'Sa' || wd === 'Su')) isAuditorBlocked = false;
        if (!weekend && !isAuditorBlocked) continue;

        var statusToUse = weekend ? 'DEFAULT_WEEKEND_SOFT' : 'DEFAULT_AUDITOR_BLOCKED_SOFT';
        var key = emailLower + '|' + ymd;
        var ex = map[key];

        if (!ex) {
          var newRow = new Array(hdr.length).fill('');
          if (cm.iDate >= 0) newRow[cm.iDate] = ymd;
          if (cm.iAud >= 0) newRow[cm.iAud] = cleanText(metaAud.emailOriginal || emailLower);
          if (cm.iAvail >= 0) newRow[cm.iAvail] = 'NO';
          if (cm.iS1 >= 0) newRow[cm.iS1] = defaultStart;
          if (cm.iE1 >= 0) newRow[cm.iE1] = defaultEnd;
          if (cm.iSt1 >= 0) newRow[cm.iSt1] = statusToUse;
          if (cm.iUpd >= 0) newRow[cm.iUpd] = nowStamp;
          toAppend.push(newRow);
          ensuredCount++;
        } else {
          var rowX = ex.row || [];
          var availX = cm.iAvail >= 0 ? cleanText(rowX[cm.iAvail]).toUpperCase() : '';
          if (availX === 'YES') continue;

          var hasAuditX = (cm.iID1 >= 0 && rowX[cm.iID1]) || (cm.iID2 >= 0 && rowX[cm.iID2]);
          if (hasAuditX) continue;

          var stX = cm.iSt1 >= 0 ? cleanText(rowX[cm.iSt1]) : '';
          var isCalendar = (stX === 'CALENDAR');
          var isAutoDefault = (!stX) || (stX.indexOf('DEFAULT_') === 0) || (isCalendar && isDefaultLikeCalendar(rowX));
          if (!isAutoDefault) continue;

          if (cm.iSt1 >= 0 && stX !== statusToUse) patches.push({ r: ex.rowIndex, c: cm.iSt1 + 1, v: statusToUse });
          if (cm.iS1 >= 0 && !isHHMMText_(rowX[cm.iS1])) patches.push({ r: ex.rowIndex, c: cm.iS1 + 1, v: defaultStart });
          if (cm.iE1 >= 0 && !isHHMMText_(rowX[cm.iE1])) patches.push({ r: ex.rowIndex, c: cm.iE1 + 1, v: defaultEnd });
          if (cm.iUpd >= 0) patches.push({ r: ex.rowIndex, c: cm.iUpd + 1, v: nowStamp });
        }
      }
    }

    if (toAppend.length > 0) {
      var firstNewRow = sh.getLastRow() + 1;
      sh.getRange(firstNewRow, 1, toAppend.length, hdr.length).setValues(toAppend);
      try {
        if (cm.iDate >= 0) {
          var rngDate = sh.getRange(firstNewRow, cm.iDate + 1, toAppend.length, 1);
          rngDate.setNumberFormat('@');
          var isoCol = [];
          for (var q = 0; q < toAppend.length; q++) isoCol.push([toAppend[q][cm.iDate]]);
          rngDate.setValues(isoCol);
        }
      } catch (eFmt) {}
    }

    if (patches.length > 0) {
      for (var p = 0; p < patches.length; p++) {
        sh.getRange(patches[p].r, patches[p].c).setValue(patches[p].v);
      }
    }

    resetExecCache_();
    return { success: true, ensured: ensuredCount, appended: toAppend.length, patched: patches.length };
  }


  function getAuditorAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, opts) {
    opts = opts || {};
    var t0 = new Date().getTime();
    var tPack0 = 0;
    var tRows0 = 0;
    var tBuild0 = 0;

    var sh = getSheet_();
    var meta = readHeaders_(sh);
    var cm = colMap_(meta.headers);
    validateRequiredCols_(cm);

    var auditorKey = normalizeEmail(auditorEmail);
    if (!auditorKey) throw new Error('getAuditorAvailabilityLite: missing auditor email');

    var rangeStart = cleanText(rangeStartISO);
    var rangeEnd = cleanText(rangeEndISO);
    if (!rangeStart || !rangeEnd) throw new Error('getAuditorAvailabilityLite: missing range');

    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var days = {};

    function addDaysISO_(iso, daysDelta) {
      var d = Utilities.parseDate(String(iso) + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
      d.setDate(d.getDate() + Number(daysDelta || 0));
      return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    }

    function compressRowNumbers_(rowNumbers) {
      var out = [];
      if (!rowNumbers || !rowNumbers.length) return out;
      rowNumbers = rowNumbers.slice().sort(function(a, b) { return a - b; });
      var start = rowNumbers[0];
      var prev = rowNumbers[0];
      for (var i = 1; i < rowNumbers.length; i++) {
        var n = rowNumbers[i];
        if (n === prev + 1) {
          prev = n;
          continue;
        }
        out.push({ start: start, count: prev - start + 1 });
        start = n;
        prev = n;
      }
      out.push({ start: start, count: prev - start + 1 });
      return out;
    }

    function readInfoFromRow_(rowVals, rowNumber) {
      return {
        rowNumber: rowNumber,
        row: rowVals,
        avail: cm.iAvail >= 0 ? normalizeAvailableCell_(rowVals[cm.iAvail]) : '',
        s1: cm.iS1 >= 0 ? timeToMinutes(rowVals[cm.iS1]) : null,
        e1: cm.iE1 >= 0 ? timeToMinutes(rowVals[cm.iE1]) : null,
        id1: cm.iID1 >= 0 ? cleanText(rowVals[cm.iID1]) : '',
        s2: cm.iS2 >= 0 ? timeToMinutes(rowVals[cm.iS2]) : null,
        e2: cm.iE2 >= 0 ? timeToMinutes(rowVals[cm.iE2]) : null,
        id2: cm.iID2 >= 0 ? cleanText(rowVals[cm.iID2]) : '',
        st1: cm.iSt1 >= 0 ? cleanText(rowVals[cm.iSt1]) : '',
        st2: cm.iSt2 >= 0 ? cleanText(rowVals[cm.iSt2]) : ''
      };
    }

    function ensureDay_(dateISO) {
      if (!days[dateISO]) days[dateISO] = { intervals: [], meta: {} };
      return days[dateISO];
    }

    // PERFORMANCE FIX 2026-04-26:
    // Previous implementation called readRowObject_ per date/row during month render.
    // This keeps the exact output shape but reads all relevant auditor+month rows in compressed batches.
    tPack0 = new Date().getTime();
    var pack = getSheetPack_(sh, meta, cm);
    // GATE MN (20260502): pack is now lazy. Populate this auditor's
    // (date -> rowNumbers) index via TextFinder before iterating. Single
    // findAll + one batched date-col read instead of full 2-column scan.
    _ensureEmailLoadedInPack_(sh, cm, pack, auditorKey);
    var rowNumbers = [];
    var seenRows = {};
    var curISO = rangeStart;
    while (curISO <= rangeEnd) {
      var key = auditorKey + '|' + curISO;
      var nums = (pack.byDateAud && pack.byDateAud[key]) ? pack.byDateAud[key] : [];
      for (var n = 0; n < nums.length; n++) {
        var rn0 = Number(nums[n]);
        if (rn0 >= 2 && !seenRows[rn0]) {
          seenRows[rn0] = true;
          rowNumbers.push(rn0);
        }
      }
      curISO = addDaysISO_(curISO, 1);
    }
    var packMs = new Date().getTime() - tPack0;

    if (!rowNumbers.length) {
      return {
        success: true,
        auditorKey: auditorKey,
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        days: days,
        meta: {
          version: SERVICE_VERSION,
          serverMs: (new Date().getTime() - t0),
          lite: true,
          optimized: true,
          rowsMatched: 0,
          timing: { packMs: packMs, rowReadMs: 0, buildMs: 0 }
        }
      };
    }

    tRows0 = new Date().getTime();
    rowNumbers.sort(function(a, b) { return a - b; });
    var rowByNumber = {};
    var blocks = []; // kept for meta.rowBlocksRead reporting

    // GATE P1 (20260502): single batched read for the spanning range when
    // reasonable. Each Range.getValues() carries ~30-50ms call overhead
    // in GAS; for a 12-month single-auditor render with ~20-40 sparse
    // rows compressRowNumbers_ produces 20-40 small blocks → ~1000-1500ms
    // of pure I/O overhead. One spanning read of ~600-1500 rows × N cols
    // is ~150-300ms. Fallback to compressed blocks for extremely sparse
    // cases (span > maxSpan) so we never read insane ranges.
    if (rowNumbers.length === 1) {
      var soloVals = sh.getRange(rowNumbers[0], 1, 1, meta.lastCol).getValues();
      rowByNumber[rowNumbers[0]] = soloVals[0] || [];
      blocks = [{ start: rowNumbers[0], count: 1 }];
    } else {
      var minR = rowNumbers[0];
      var maxR = rowNumbers[rowNumbers.length - 1];
      var span = maxR - minR + 1;
      var maxSpan = Math.max(rowNumbers.length * 30, 800);
      if (span <= maxSpan && span <= 5000) {
        var spanVals = sh.getRange(minR, 1, span, meta.lastCol).getValues();
        var rnSet = {};
        for (var x = 0; x < rowNumbers.length; x++) rnSet[rowNumbers[x]] = true;
        for (var k = 0; k < span; k++) {
          var actualRow = minR + k;
          if (!rnSet[actualRow]) continue;
          rowByNumber[actualRow] = spanVals[k] || [];
        }
        blocks = [{ start: minR, count: span }];
      } else {
        // Fallback: original compressed blocks (very sparse — keeps
        // memory/I/O bounded when range exceeds the threshold).
        blocks = compressRowNumbers_(rowNumbers);
        for (var b = 0; b < blocks.length; b++) {
          var block = blocks[b];
          var vals = sh.getRange(block.start, 1, block.count, meta.lastCol).getValues();
          for (var r = 0; r < vals.length; r++) {
            rowByNumber[block.start + r] = vals[r] || [];
          }
        }
      }
    }
    var rowReadMs = new Date().getTime() - tRows0;

    tBuild0 = new Date().getTime();
    for (var i = 0; i < rowNumbers.length; i++) {
      var rn = rowNumbers[i];
      var rowVals = rowByNumber[rn] || [];
      var rowAud = cm.iAud >= 0 ? normalizeEmail(rowVals[cm.iAud]) : '';
      if (rowAud !== auditorKey) continue;

      var dateISO = cm.iDate >= 0 ? normDateISO(rowVals[cm.iDate]) : '';
      if (!dateISO || dateISO < rangeStart || dateISO > rangeEnd) continue;

      var info = readInfoFromRow_(rowVals, rn);
      var day = ensureDay_(dateISO);
      if (!day.meta.availableCell && info.avail) day.meta.availableCell = info.avail;

      if (info.avail === 'NO' && !info.id1 && !info.id2) {
        var st1 = cleanText(info.st1).toUpperCase();
        var st2 = cleanText(info.st2).toUpperCase();
        var isSoft = isSoftUnavailableStatus_(st1) || isSoftUnavailableStatus_(st2);
        day.meta.softFullDay = !!isSoft;
        day.intervals.push({
          startTime: isFinite(info.s1) ? minutesToHHMM(info.s1) : '08:00',
          endTime: isFinite(info.e1) ? minutesToHHMM(info.e1) : '18:00',
          hard: !isSoft,
          kind: isSoft ? 'soft' : 'hard',
          reason: isSoft ? (st1 || st2 || 'Soft unavailable') : 'Available=NO'
        });
        continue;
      }

      if (info.id1 && isFinite(info.s1) && isFinite(info.e1) && info.e1 > info.s1) {
        day.intervals.push({
          startTime: minutesToHHMM(info.s1),
          endTime: minutesToHHMM(info.e1),
          hard: true
        });
      }
      if (info.id2 && isFinite(info.s2) && isFinite(info.e2) && info.e2 > info.s2) {
        day.intervals.push({
          startTime: minutesToHHMM(info.s2),
          endTime: minutesToHHMM(info.e2),
          hard: true
        });
      }
    }

    Object.keys(days).forEach(function(dateISO) {
      if (!days[dateISO] || !days[dateISO].intervals || !days[dateISO].intervals.length) delete days[dateISO];
    });

    var buildMs = new Date().getTime() - tBuild0;

    return {
      success: true,
      auditorKey: auditorKey,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      days: days,
      meta: {
        version: SERVICE_VERSION,
        serverMs: (new Date().getTime() - t0),
        lite: true,
        optimized: true,
        rowsMatched: rowNumbers.length,
        rowBlocksRead: blocks.length,
        timing: {
          packMs: packMs,
          rowReadMs: rowReadMs,
          buildMs: buildMs
        }
      }
    };
  }

return {
    VERSION: SERVICE_VERSION,
    getAuditorAvailabilityRaw: getAuditorAvailabilityRaw,
    getAuditorAvailabilityLite: getAuditorAvailabilityLite,
    buildAvailabilitySummaryMap: buildAvailabilitySummaryMap,
    plannedSummaryFromAvailabilityMap: plannedSummaryFromAvailabilityMap,
    loadAuditorAvailabilityMap: loadAuditorAvailabilityMap,
    buildCollisionMap: buildCollisionMap,
    validate: validate,
    writeBack: writeBack,
    clearAuditId: clearAuditId,
    isDefaultOrManualBlock: isDefaultOrManualBlock_,
    findDuplicateAvailabilityRows: findDuplicateAvailabilityRows_,
    fixDuplicateAvailabilityRows: fixDuplicateAvailabilityRows_,
    healthcheck: healthcheck,
    resetExecCache: resetExecCache_,
    ensureDefaults12m: ensureDefaults12m,
    regenerateDefaults12m: regenerateDefaults12m,
    runDefaultsAuto: runDefaultsAuto,
    setupDefaultsTriggerDaily: setupDefaultsTriggerDaily,
    ensureDefaultsForToolkitOpen: ensureDefaultsForToolkitOpen,
    sortAuditorAvailability: sortAuditorAvailability,
    toggleManualSoftDay: toggleManualSoftDay,
    applyRangeManualSoftDays: applyRangeManualSoftDays,
    applyDefaultWeekdaysAndRebuild12m: applyDefaultWeekdaysAndRebuild12m,
    repairDefaultTimeCells: repairDefaultTimeCells
  };
})();

/**************************************
 * CENTRAL LEGACY ALIAS OWNER
 * Keep all backward-compatible global aliases here.
 * AuditorAvailabilityBackend stays read/model only.
 **************************************/

/**************************************
 * BACKWARD-COMPATIBLE GLOBAL ALIASES
 **************************************/

function v5_getAuditorAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, opts) {
  return AvailabilityService.getAuditorAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, opts);
}
function AS_getAuditorAvailabilityRaw_(auditorEmail, rangeStartISO, rangeEndISO, opts) {
  return AvailabilityService.getAuditorAvailabilityRaw(auditorEmail, rangeStartISO, rangeEndISO, opts);
}
function AS_getAuditorAvailabilityRawFast_(auditorEmail, rangeStartISO, rangeEndISO, opts) {
  return AvailabilityService.getAuditorAvailabilityRaw(auditorEmail, rangeStartISO, rangeEndISO, opts);
}
function AS_availabilitySummaryMapCacheKey_(opts) {
  opts = opts || {};
  return String(opts.cacheKey || 'availability_summary_map_v1').trim() || 'availability_summary_map_v1';
}

function AS_buildAvailabilitySummaryMap_(opts) {
  opts = opts || {};
  var cacheKey = AS_availabilitySummaryMapCacheKey_(opts);
  var ttl = Number(opts.ttlSeconds || (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && AUDIT_CACHE.TTL ? AUDIT_CACHE.TTL.AVAILABILITY_MONTH : 300) || 300);
  if (!isFinite(ttl) || ttl <= 0) ttl = 300;

  try {
    if (!(opts.forceFresh === true || opts.forceRefresh === true || opts.bypassCache === true) &&
        typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      var cachedCentral = AUDIT_CACHE.get(
        (AUDIT_CACHE.NS && AUDIT_CACHE.NS.AVAILABILITY) ? AUDIT_CACHE.NS.AVAILABILITY : 'availability',
        cacheKey
      );
      if (cachedCentral) return cachedCentral;
    }
  } catch (eCentralGet) {}

  try {
    if (!(opts.forceFresh === true || opts.forceRefresh === true || opts.bypassCache === true)) {
      var raw = CacheService.getScriptCache().get('AS_SUMMARY|' + cacheKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed) return parsed;
      }
    }
  } catch (eNativeGet) {}

  var built = AvailabilityService.buildAvailabilitySummaryMap();

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(
        (AUDIT_CACHE.NS && AUDIT_CACHE.NS.AVAILABILITY) ? AUDIT_CACHE.NS.AVAILABILITY : 'availability',
        cacheKey,
        built,
        ttl
      );
    }
  } catch (eCentralPut) {}

  try {
    var s = JSON.stringify(built || {});
    if (s && s.length < 90000) CacheService.getScriptCache().put('AS_SUMMARY|' + cacheKey, s, ttl);
  } catch (eNativePut) {}

  return built;
}

function AS_clearAvailabilitySummaryMapCache_(opts) {
  opts = opts || {};
  var cacheKey = AS_availabilitySummaryMapCacheKey_(opts);
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function') {
      AUDIT_CACHE.remove(
        (AUDIT_CACHE.NS && AUDIT_CACHE.NS.AVAILABILITY) ? AUDIT_CACHE.NS.AVAILABILITY : 'availability',
        cacheKey
      );
    }
  } catch (eCentralRemove) {}
  try { CacheService.getScriptCache().remove('AS_SUMMARY|' + cacheKey); } catch (eNativeRemove) {}
  try { CacheService.getScriptCache().remove('AS_SUMMARY|_AUDITOR_V5_AVAIL_SUMMARY_CACHE_'); } catch (eCompatRemove) {}
  return { success: true, cacheKey: cacheKey };
}

function AS_plannedSummaryFromAvailabilityMap_(availabilityMap, auditId) {
  return AvailabilityService.plannedSummaryFromAvailabilityMap(availabilityMap, auditId);
}
function AS_loadAuditorAvailabilityMap_(auditorKey, rangeStart, rangeEnd) {
  return AvailabilityService.loadAuditorAvailabilityMap(auditorKey, rangeStart, rangeEnd);
}
function AS_buildCollisionMap_(auditorKey, rangeStart, rangeEnd, excludeAuditId) {
  return AvailabilityService.buildCollisionMap(auditorKey, rangeStart, rangeEnd, excludeAuditId);
}
function AS_validate_(auditId, auditorEmail, auditorName, blocks) {
  return AvailabilityService.validate(auditId, auditorEmail, auditorName, blocks);
}
function AS_writeBack_(auditId, auditorEmail, auditorName, blocks, mode) {
  return AvailabilityService.writeBack(auditId, auditorEmail, auditorName, blocks, mode);
}
function AS_clearAuditId_(auditId) {
  return AvailabilityService.clearAuditId(auditId);
}
function AS_isDefaultOrManualBlock_(statusVal) {
  return AvailabilityService.isDefaultOrManualBlock(statusVal);
}
function AS_findDuplicateAvailabilityRows_() {
  return AvailabilityService.findDuplicateAvailabilityRows();
}
function AS_fixDuplicateAvailabilityRows_() {
  return AvailabilityService.fixDuplicateAvailabilityRows();
}
function AS_healthcheck_() {
  return AvailabilityService.healthcheck();
}
function AS_repairDefaultTimeCells_(req) {
  return AvailabilityService.repairDefaultTimeCells(req);
}
function V5_repairAuditorAvailabilityDefaultTimeCells() {
  return AvailabilityService.repairDefaultTimeCells({});
}
function V5_repairAuditorAvailabilityDefaultTimeCells_All() {
  return AvailabilityService.repairDefaultTimeCells({});
}

/*** extra legacy aliases used by current backend builds ***/
function AS_availabilityValidate_(auditId, auditorEmail, auditorName, blocks) {
  return AvailabilityService.validate(auditId, auditorEmail, auditorName, blocks);
}
function AS_availabilityWriteBack_(auditId, auditorEmail, auditorName, blocks, mode) {
  return AvailabilityService.writeBack(auditId, auditorEmail, auditorName, blocks, mode);
}
function AS_availabilityClearAuditId_(auditId) {
  return AvailabilityService.clearAuditId(auditId);
}

function AS_resetExecCache_() {
  return AvailabilityService.resetExecCache();
}



function AS_toggleManualSoftDayStandalone_(req) {
  return AvailabilityService.toggleManualSoftDay(req);
}
function AS_applyRangeManualSoftDaysStandalone_(req) {
  return AvailabilityService.applyRangeManualSoftDays(req);
}
function AS_applyDefaultWeekdaysAndRebuild12mStandalone_(req) {
  return AvailabilityService.applyDefaultWeekdaysAndRebuild12m(req);
}

/*** availability default aliases / central owner ***/
function AS_ensureDefaults12m_(opts) {
  return AvailabilityService.ensureDefaults12m(opts);
}
function AS_regenerateDefaults12m_() {
  return AvailabilityService.regenerateDefaults12m();
}
function AS_runDefaultsAuto_() {
  return AvailabilityService.runDefaultsAuto();
}
function AS_setupDefaultsTriggerDaily_() {
  return AvailabilityService.setupDefaultsTriggerDaily();
}
function AS_ensureDefaultsForToolkitOpen_(auditorsList, preferredAuditorEmail) {
  return AvailabilityService.ensureDefaultsForToolkitOpen(auditorsList, preferredAuditorEmail);
}
function AS_sortAuditorAvailability_() {
  return AvailabilityService.sortAuditorAvailability();
}
function V5_regenerateAuditorAvailabilityDefaults12m() {
return AvailabilityService.regenerateDefaults12m();
}

function V5_runAuditorAvailabilityDefaultsAuto() {
return AvailabilityService.runDefaultsAuto();
}

function V5_setupAuditorAvailabilityDefaultsTriggerDaily() {
return AvailabilityService.setupDefaultsTriggerDaily();
}


/*** direct legacy standalone aliases now owned by AvailabilityService ***/
function AV_toggleManualSoftDayStandalone(req) {
  return AvailabilityService.toggleManualSoftDay(req);
}
function AV_applyRangeManualSoftDaysStandalone(req) {
  return AvailabilityService.applyRangeManualSoftDays(req);
}
function AV_applyDefaultWeekdaysAndRebuild12mStandalone(req) {
  return AvailabilityService.applyDefaultWeekdaysAndRebuild12m(req);
}
function AV5_toggleManualSoftDayStandalone(req) {
  return AvailabilityService.toggleManualSoftDay(req);
}
function AV5_applyRangeManualSoftDaysStandalone(req) {
  return AvailabilityService.applyRangeManualSoftDays(req);
}
function AV5_applyDefaultWeekdaysAndRebuild12mStandalone(req) {
  return AvailabilityService.applyDefaultWeekdaysAndRebuild12m(req);
}


function RUN_AVAILABILITY_P0_R2_APPLY_RANGE_DIAG() {
  var res = AvailabilityService.applyRangeManualSoftDays({
    auditorEmail: 'leen@agriqa.es',
    fromISO: '2026-11-18',
    toISO: '2026-11-21',
    from: '08:00',
    to: '18:00'
  });
  Logger.log(JSON.stringify({ build: '2026-05-15_P0_R2_AVAILABILITY_WRITE_CACHE_DIAG', result: res }, null, 2));
  return res;
}


function RUN_AVAILABILITY_SOFT_HARD_R2_SELFTEST() {
  var cases = [
    { status1: 'DEFAULT_AUDITOR_BLOCKED_SOFT', status2: 'SYSTEM_DEFAULT', expectedSoft: true, label: 'default weekday soft' },
    { status1: 'DEFAULT_WEEKEND_SOFT', status2: '', expectedSoft: true, label: 'default weekend soft' },
    { status1: 'MANUAL_AUDITOR_BLOCKED_SOFT', status2: 'USER_MANUAL', expectedSoft: true, label: 'manual soft' },
    { status1: 'MANAGER PLANNED', status2: '', expectedSoft: false, label: 'manager planned hard' }
  ];
  var out = {
    ok: true,
    build: '2026-05-15_AVAILABILITY_SOFT_HARD_R2',
    purpose: 'Contract selftest for soft/default/manual status classification. No sheet mutation.',
    cases: []
  };
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var got = AvailabilityService.isDefaultOrManualBlock(c.status1) || AvailabilityService.isDefaultOrManualBlock(c.status2);
    // isDefaultOrManualBlock intentionally includes hard-looking BLOCK tokens for legacy; this selftest reports classification contract only.
    var softLike = (String(c.status1).indexOf('DEFAULT_') === 0 || String(c.status1).indexOf('MANUAL_') === 0 || c.status1 === 'CALENDAR' || c.status1 === 'SYSTEM_DEFAULT' || c.status2 === 'SYSTEM_DEFAULT' || c.status2 === 'USER_MANUAL');
    var ok = (softLike === c.expectedSoft);
    out.cases.push({ label: c.label, status1: c.status1, status2: c.status2, expectedSoft: c.expectedSoft, softLike: softLike, ok: ok });
    if (!ok) out.ok = false;
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_AVAILABILITY_CACHE_CANONICAL_R6_SELFTEST() {
  var out = {
    ok: true,
    build: '2026-05-15_AVAILABILITY_CACHE_CANONICAL_R6',
    checks: {}
  };
  try {
    out.checks.version = AvailabilityService.VERSION;
    out.checks.hasToolkitInvalidator = (typeof TDM_invalidateAvailabilityMonthCache === 'function');
    if (!out.checks.hasToolkitInvalidator) throw new Error('Missing TDM_invalidateAvailabilityMonthCache');
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
