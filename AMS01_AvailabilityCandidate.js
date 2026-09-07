/**
 * FILE: AMS01_AvailabilityCandidate.js
 * BUILD: AMS01_AVAILABILITY_CANDIDATE_20260907_R1
 * PURPOSE:
 *   Read-only AMS-01 candidate for visible-month availability.
 *   Measures whether narrowing to the requested month before wide row reads
 *   removes the current cold-path hotspot without changing canonical data.
 *
 * SAFETY:
 *   - No writes to Audit planning, Auditor Availability or status data.
 *   - No cache writes.
 *   - No canonical endpoint replacement.
 *   - Uses existing Toolkit_AvailabilityMonth helpers and Planning JSON overlay.
 */

var AMS01_AVAILABILITY_CANDIDATE_BUILD = 'AMS01_AVAILABILITY_CANDIDATE_20260907_R1';

function AMS01_GetAvailabilityMonthCandidate(auditorEmail, monthKey) {
  var t0 = Date.now();
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKey = _mp_tdm_clean_(monthKey);

  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { success:false, message:'Invalid monthKey: ' + monthKey };

  var sh = _mp_tdm_getAvailabilitySheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return {
      success:true,
      auditorEmail:auditorEmail,
      monthKey:monthKey,
      days:{},
      meta:{ build:AMS01_AVAILABILITY_CANDIDATE_BUILD, serverMs:Date.now()-t0, rowsMatched:0 }
    };
  }

  var tHeader = Date.now();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var hm = _mp_tdm_headerMap_(headers);
  var cDate = hm.indexOf(['Date']);
  var cAud = hm.indexOf(['Auditor_Email', 'Auditor Email', 'Email', 'E-mail', 'Auditor_Name', 'Auditor Name']);
  var cAvail = hm.indexOf(['Available']);
  var cS1 = hm.indexOf(['First_Audit_Start_Time', 'First Audit Start Time']);
  var cE1 = hm.indexOf(['First_Audit_End_Time', 'First Audit End Time']);
  var cID1 = hm.indexOf(['Audit_ID_1', 'Audit ID 1']);
  var cS2 = hm.indexOf(['Second_Audit_Start_Time', 'Second Audit Start Time']);
  var cE2 = hm.indexOf(['Second_Audit_End_Time', 'Second Audit End Time']);
  var cID2 = hm.indexOf(['Audit_ID_2', 'Audit ID 2']);
  var cSt1 = hm.indexOf(['Status_1', 'Status 1', 'Status']);
  var cSt2 = hm.indexOf(['Status_2', 'Status 2']);
  if (cDate < 0 || cAud < 0 || cAvail < 0) {
    return { success:false, message:'Auditor Availability missing Date/Auditor_Email/Available columns' };
  }
  var headerMs = Date.now() - tHeader;

  var startISO = monthKey + '-01';
  var startD = _mp_parseISODate_(startISO);
  var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));

  // Candidate strategy:
  // 1. Read only Date + Auditor identity columns, not the entire availability body.
  // 2. Determine exact row numbers for the requested auditor AND requested month.
  // 3. Only then read full-width data for the small matched row blocks.
  var tIndex = Date.now();
  var firstCol = Math.min(cDate, cAud);
  var lastIdentityCol = Math.max(cDate, cAud);
  var identityWidth = lastIdentityCol - firstCol + 1;
  var identity = sh.getRange(2, firstCol + 1, lastRow - 1, identityWidth).getValues();
  var dateOffset = cDate - firstCol;
  var audOffset = cAud - firstCol;
  var rowNumbers = [];

  for (var i = 0; i < identity.length; i++) {
    var pair = identity[i] || [];
    if (_mp_tdm_normEmail_(pair[audOffset]) !== auditorEmail) continue;
    var isoCheck = _mp_tdm_fmtDate_(pair[dateOffset]);
    if (!isoCheck || isoCheck < startISO || isoCheck > endISO) continue;
    rowNumbers.push(i + 2);
  }
  var indexMs = Date.now() - tIndex;

  var tRead = Date.now();
  var blocks = _mp_tdm_compressRows_(rowNumbers);
  var days = {};
  var rowsInMonth = 0;

  function ensureDay_(iso) {
    if (!days[iso]) days[iso] = { intervals:[], meta:{} };
    return days[iso];
  }

  function addInterval_(day, start, end, hard, meta) {
    start = _mp_tdm_normTime_(start);
    end = _mp_tdm_normTime_(end);
    if (!start || !end) return;
    meta = meta || {};
    day.intervals.push({
      startTime:start,
      endTime:end,
      hard: hard !== false,
      kind: hard === false ? 'soft' : 'hard',
      source: meta.source || '',
      reason: meta.reason || '',
      status1: meta.status1 || '',
      status2: meta.status2 || ''
    });
  }

  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var vals = sh.getRange(blk.start, 1, blk.count, lastCol).getValues();
    for (var r = 0; r < vals.length; r++) {
      var row = vals[r] || [];
      if (_mp_tdm_normEmail_(row[cAud]) !== auditorEmail) continue;
      var iso = _mp_tdm_fmtDate_(row[cDate]);
      if (!iso || iso < startISO || iso > endISO) continue;
      rowsInMonth++;

      var available = cAvail >= 0 ? _mp_tdm_availableCell_(row[cAvail]) : '';
      var id1 = cID1 >= 0 ? _mp_tdm_clean_(row[cID1]) : '';
      var id2 = cID2 >= 0 ? _mp_tdm_clean_(row[cID2]) : '';
      var st1 = cSt1 >= 0 ? _mp_tdm_clean_(row[cSt1]) : '';
      var st2 = cSt2 >= 0 ? _mp_tdm_clean_(row[cSt2]) : '';
      var day = ensureDay_(iso);
      if (!day.meta.availableCell && available) day.meta.availableCell = available;

      if (id1) addInterval_(day, cS1 >= 0 ? row[cS1] : '', cE1 >= 0 ? row[cE1] : '', true, {
        source:'AUDITOR_AVAILABILITY', reason:'Occupied from Auditor availability', status1:st1, status2:st2
      });
      if (id2) addInterval_(day, cS2 >= 0 ? row[cS2] : '', cE2 >= 0 ? row[cE2] : '', true, {
        source:'AUDITOR_AVAILABILITY', reason:'Occupied from Auditor availability', status1:st1, status2:st2
      });

      if (!id1 && !id2 && available === 'NO') {
        var isSoft = _mp_tdm_isSoftStatus_(st1) || _mp_tdm_isSoftStatus_(st2);
        var isHard = _mp_tdm_isHardStatus_(st1) || _mp_tdm_isHardStatus_(st2);
        day.meta.softFullDay = !!isSoft && !isHard;
        addInterval_(day,
          cS1 >= 0 ? (row[cS1] || '08:00') : '08:00',
          cE1 >= 0 ? (row[cE1] || '18:00') : '18:00',
          !day.meta.softFullDay,
          {
            source:'AUDITOR_AVAILABILITY',
            reason:day.meta.softFullDay ? (st1 || st2 || 'Soft unavailable') : 'Available=NO',
            status1:st1,
            status2:st2
          }
        );
      }
    }
  }
  var rowReadMs = Date.now() - tRead;

  Object.keys(days).forEach(function(iso) {
    if (!days[iso] || !days[iso].intervals || !days[iso].intervals.length) delete days[iso];
  });

  var out = {
    success:true,
    auditorEmail:auditorEmail,
    auditorKey:auditorEmail,
    monthKey:monthKey,
    rangeStart:startISO,
    rangeEnd:endISO,
    days:days,
    meta:{
      build:AMS01_AVAILABILITY_CANDIDATE_BUILD,
      directMonth:true,
      cacheHit:false,
      sourceMode:'AMS01_CANDIDATE_LIVE',
      routeOwner:'AMS01_AvailabilityCandidate',
      rowsMatched:rowsInMonth,
      matchedRowNumbers:rowNumbers.length,
      blocksRead:blocks.length,
      identityColumnsRead:identityWidth,
      identityRowsRead:identity.length,
      timing:{ headerMs:headerMs, monthIndexMs:indexMs, rowReadMs:rowReadMs },
      preOverlayMs:Date.now()-t0
    }
  };

  var overlayed = _mp_tdm_addPlanningJsonOverlay_(out, auditorEmail, monthKey, { failOnOverlayError:false });
  overlayed.meta = overlayed.meta || {};
  overlayed.meta.build = AMS01_AVAILABILITY_CANDIDATE_BUILD;
  overlayed.meta.serverMs = Date.now() - t0;
  overlayed.meta.cacheHit = false;
  overlayed.meta.candidateTiming = out.meta.timing;
  overlayed.meta.candidatePreOverlayMs = out.meta.preOverlayMs;
  return overlayed;
}

function AMS01_CompareAvailabilityOldVsCandidate() {
  var auditorEmail = 'david@agriqa.es';
  var monthKey = '2026-09';
  var tOld = Date.now();
  var oldRes = getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, {
    forceFresh:true,
    bypassCache:true,
    verifyFreshness:false,
    failOnOverlayError:false
  });
  var oldMs = Date.now() - tOld;

  var tNew = Date.now();
  var newRes = AMS01_GetAvailabilityMonthCandidate(auditorEmail, monthKey);
  var newMs = Date.now() - tNew;

  var oldDays = oldRes && oldRes.days ? oldRes.days : {};
  var newDays = newRes && newRes.days ? newRes.days : {};
  var oldJson = JSON.stringify(oldDays);
  var newJson = JSON.stringify(newDays);

  var result = {
    build:AMS01_AVAILABILITY_CANDIDATE_BUILD,
    auditorEmail:auditorEmail,
    monthKey:monthKey,
    oldMs:oldMs,
    candidateMs:newMs,
    improvementMs:oldMs-newMs,
    improvementPct:oldMs > 0 ? Math.round(((oldMs-newMs)/oldMs)*1000)/10 : 0,
    outputEqual:oldJson === newJson,
    oldDayCount:Object.keys(oldDays).length,
    candidateDayCount:Object.keys(newDays).length,
    oldMeta:oldRes && oldRes.meta ? oldRes.meta : null,
    candidateMeta:newRes && newRes.meta ? newRes.meta : null
  };
  Logger.log('[AMS01_AVAIL_COMPARE] ' + JSON.stringify(result));
  return result;
}
