/********************************************************************
 * FILE: PlanningEngine.gs
 * PURPOSE:
 *   Central owner for PLAN + RESCHEDULE.
 *   StatusMachine only validates/dispatches.
 *
 * PUBLIC COMPAT ENTRYPOINTS KEPT:
 *   - planAuditV5_(request)
 *   - planAudit(auditId, blocks, auditorName, auditorEmail, opts)
 *
 * NEW OWNER HELPERS:
 *   - Planning_applyPlan_(ctx, transition, payload)
 *   - Planning_applyReschedule_(ctx, transition, payload)
 ********************************************************************/

function planAuditV5_(request) {
  if (!request || !request.auditId || !request.blocks || !request.blocks.length) {
    return fail_('Missing auditId or blocks.');
  }

  return planAudit(
    request.auditId,
    request.blocks,
    request.auditorName || '',
    request.auditorEmail || '',
    {
      allowWeekend: request.allowWeekendOverride !== false,
      actorRole: request.actorRole || 'MANAGER'
    }
  );
}

function planAudit(auditId, blocks, auditorName, auditorEmail, opts) {
  opts = opts || {};

  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return fail_("Sheet 'Audit planning' missing.");

    var ctx = loadContext_(sh);
    var rowInfo = findAudit_(ctx, auditId);
    if (!rowInfo) return fail_('Audit not found: ' + auditId);

    if (typeof Status_applyTransition_ !== 'function') {
      return fail_('StatusMachine missing.');
    }

    var transition = Status_applyTransition_({
      status: rowInfo.status,
      action: 'PLAN',
      role: opts.actorRole || 'MANAGER'
    });
    if (!transition || !transition.ok) {
      return fail_('Planning not allowed from status: ' + rowInfo.status);
    }

    return Planning_executeWrite_(rowInfo, transition, {
      auditId: auditId,
      blocks: blocks,
      auditorName: auditorName || '',
      auditorEmail: auditorEmail || '',
      allowWeekend: opts.allowWeekend !== false,
      isReschedule: false
    });
  } catch (err) {
    return fail_('Exception in planAudit: ' + err);
  }
}

function Planning_applyPlan_(statusCtx, transition, payload) {
  payload = payload || {};
  if (!statusCtx || !statusCtx.auditId) return fail_('Missing status context for PLAN');

  var rowInfo = planningRowInfoFromStatusCtx_(statusCtx);
  if (!rowInfo) return fail_('Could not resolve audit row for PLAN');

  return Planning_executeWrite_(rowInfo, transition, {
    auditId: statusCtx.auditId,
    blocks: payload.blocks || [],
    auditorName: payload.auditorName || '',
    auditorEmail: payload.auditorEmail || '',
    allowWeekend: payload.allowWeekend !== false,
    isReschedule: false
  });
}

function Planning_applyReschedule_(statusCtx, transition, payload) {
  payload = payload || {};
  if (!statusCtx || !statusCtx.auditId) return fail_('Missing status context for RESCHEDULE');

  var rowInfo = planningRowInfoFromStatusCtx_(statusCtx);
  if (!rowInfo) return fail_('Could not resolve audit row for RESCHEDULE');

  return Planning_executeWrite_(rowInfo, transition, {
    auditId: statusCtx.auditId,
    blocks: payload.blocks || [],
    auditorName: payload.auditorName || (statusCtx.col.assigned >= 0 ? String(statusCtx.row[statusCtx.col.assigned] || '') : ''),
    auditorEmail: payload.auditorEmail || '',
    allowWeekend: payload.allowWeekend !== false,
    isReschedule: true
  });
}

function Planning_executeWrite_(rowInfo, transition, opts) {
  opts = opts || {};

  var nb = normalizeBlocks_(opts.blocks || []);
  if (nb.hard.length) return failHard_(nb.hard);

  var blocksN = nb.blocks;
  var reqH = Number(rowInfo.requiredHours || 0);
  var sumH = blocksN.reduce(function(a, b){ return a + b.hours; }, 0);
  if (sumH < reqH) {
    return failHard_([{ date: null, reason: 'Planned hours < required hours' }]);
  }

  var auditorOwner = String(opts.auditorEmail || opts.auditorName || '').trim();
  if (!auditorOwner) return fail_('Missing auditor owner for planning');

  var hard = checkHardConflicts_(rowInfo.ctx, rowInfo, blocksN, auditorOwner, opts.auditId);
  if (hard.length) return failHard_(hard);

  var softObj = checkSoftConflicts_(rowInfo.ctx, rowInfo, blocksN, auditorOwner, { allowWeekend: opts.allowWeekend !== false });
  if (softObj.hard.length) return failHard_(softObj.hard);

  var planningJson = {
    blocks: blocksN,
    totalPlannedHours: sumH,
    auditorEmail: opts.auditorEmail || '',
    auditorName: opts.auditorName || ''
  };

  var syncRes = Planning_syncAvailability_(opts.auditId, blocksN, auditorOwner, transition.afterStatusDisplay, !!opts.isReschedule);
  if (!syncRes || syncRes.success === false) {
    return syncRes || fail_('Availability sync failed');
  }

  var row = rowInfo.row.slice();
  while (row.length < rowInfo.ctx.hdr.length) row.push('');

  if (rowInfo.ctx.colJson > 0) row[rowInfo.ctx.colJson - 1] = JSON.stringify(planningJson);
  if (rowInfo.ctx.colAssigned > 0) row[rowInfo.ctx.colAssigned - 1] = auditorOwner;
  if (rowInfo.ctx.colDatePlanned > 0) row[rowInfo.ctx.colDatePlanned - 1] = blocksN[0].date;
  if (rowInfo.ctx.colStatus > 0) row[rowInfo.ctx.colStatus - 1] = transition.afterStatusDisplay;

  rowInfo.ctx.sh.getRange(rowInfo.rowIndex, 1, 1, row.length).setValues([row]);
  Planning_invalidate_();

  return {
    success: true,
    code: 'OK',
    action: opts.isReschedule ? 'RESCHEDULE' : 'PLAN',
    auditId: String(opts.auditId || '').trim(),
    beforeStatus: transition.beforeStatus,
    beforeStatusDisplay: transition.beforeStatusDisplay,
    newStatus: transition.afterStatusDisplay,
    afterStatus: transition.afterStatus,
    afterStatusDisplay: transition.afterStatusDisplay,
    planningJson: JSON.stringify(planningJson),
    plannedDate: blocksN[0].date,
    plannedDates: blocksN.map(function(b){ return b.date; }),
    assignedTo: auditorOwner,
    hoursPlanned: sumH,
    requiredHours: reqH,
    softConflicts: softObj.soft,
    hardConflicts: []
  };
}

function Planning_syncAvailability_(auditId, blocks, auditorOwner, statusDisplay, isReschedule) {
  if (isReschedule) {
    var rel = Planning_callAvailabilityRelease_(auditId);
    if (rel && rel.success === false) return rel;
  }

  var svc = Planning_callAvailabilityReserve_(auditId, blocks, auditorOwner, statusDisplay);
  if (svc && svc.success !== false) return svc;

  return Planning_directReserveAvailability_(auditId, blocks, auditorOwner, statusDisplay);
}

function Planning_callAvailabilityReserve_(auditId, blocks, auditorOwner, statusDisplay) {
  var payload = {
    auditId: String(auditId || '').trim(),
    blocks: blocks || [],
    auditorEmail: String(auditorOwner || '').trim(),
    auditorName: String(auditorOwner || '').trim(),
    status: String(statusDisplay || 'Pending Approval').trim()
  };

  try {
    if (typeof AvailabilityService_reserveAudit_ === 'function') return AvailabilityService_reserveAudit_(payload);
  } catch (e0) {}
  try {
    if (typeof AvailabilityService_applyPlanningBlocks_ === 'function') return AvailabilityService_applyPlanningBlocks_(payload);
  } catch (e1) {}
  try {
    if (typeof AV_reserveAudit_ === 'function') return AV_reserveAudit_(payload);
  } catch (e2) {}
  try {
    if (typeof V5_availabilityReserveAuditBlocks_ === 'function') return V5_availabilityReserveAuditBlocks_(payload);
  } catch (e3) {}

  return null;
}

function Planning_callAvailabilityRelease_(auditId) {
  try {
    if (typeof AvailabilityService_releaseAudit_ === 'function') return AvailabilityService_releaseAudit_(auditId, { silent: true });
  } catch (e0) {}
  try {
    if (typeof managerV5_releaseAvailability_ === 'function') return managerV5_releaseAvailability_(auditId, { silent: true });
  } catch (e1) {}
  try {
    if (typeof V5_availabilityClearAuditId_ === 'function') return V5_availabilityClearAuditId_(auditId);
  } catch (e2) {}
  return { success: true, skipped: true, reason: 'NO_RELEASE_HELPER' };
}

function Planning_directReserveAvailability_(auditId, blocks, auditorOwner, statusDisplay) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
  if (!sh) return fail_('Auditor Availability sheet not found');

  Planning_directClearAuditId_(sh, auditId);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v || '').trim(); });

  function hidx_(names) {
    var lc = hdr.map(function(v){ return String(v || '').trim().toLowerCase().replace(/[_\s]+/g, ' '); });
    for (var i = 0; i < names.length; i++) {
      var key = String(names[i] || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
      var idx = lc.indexOf(key);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  var iDate = hidx_(['Date']);
  var iAvail = hidx_(['Available']);
  var iAud = hidx_(['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']);
  var iS1 = hidx_(['First_Audit_Start_Time','First Audit Start Time']);
  var iE1 = hidx_(['First_Audit_End_Time','First Audit End Time']);
  var iId1 = hidx_(['Audit_ID_1','Audit ID 1']);
  var iSt1 = hidx_(['Status_1','Status 1','Status']);
  var iS2 = hidx_(['Second_Audit_Start_Time','Second Audit Start Time']);
  var iE2 = hidx_(['Second_Audit_End_Time','Second Audit End Time']);
  var iId2 = hidx_(['Audit_ID_2','Audit ID 2']);
  var iSt2 = hidx_(['Status_2','Status 2']);
  var iUpd = hidx_(['Last_Updated','Last Updated','Timestamp']);

  if (iDate < 0 || iAud < 0 || iAvail < 0 || iS1 < 0 || iE1 < 0 || iId1 < 0 || iS2 < 0 || iE2 < 0 || iId2 < 0) {
    return fail_('Auditor Availability missing required columns');
  }

  var values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var rowByKey = {};
  for (var r = 0; r < values.length; r++) {
    var dateIso = Planning_cellToYmd_(values[r][iDate]);
    var aud = String(values[r][iAud] || '').trim();
    if (!dateIso || !aud) continue;
    rowByKey[aud + '|' + dateIso] = { rowIndex: r + 2, row: values[r] };
  }

  var tz = Planning_tz_();
  var changed = 0;

  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b] || {};
    var key = String(auditorOwner || '').trim() + '|' + String(block.date || '').trim();
    var rowObj = rowByKey[key];
    var row, rowIndex;

    if (rowObj) {
      row = rowObj.row.slice();
      rowIndex = rowObj.rowIndex;
    } else {
      row = new Array(lastCol);
      for (var z = 0; z < row.length; z++) row[z] = '';
      row[iDate] = String(block.date || '').trim();
      row[iAud] = String(auditorOwner || '').trim();
      rowIndex = sh.getLastRow() + 1;
    }

    var targetSlot = Planning_pickAvailabilitySlot_(row, {
      start: String(block.start || '').trim(),
      end: String(block.end || '').trim(),
      auditId: String(auditId || '').trim()
    }, {
      iS1: iS1, iE1: iE1, iId1: iId1,
      iS2: iS2, iE2: iE2, iId2: iId2
    });

    if (!targetSlot.ok) return failHard_([{ date: block.date, reason: targetSlot.reason }]);

    if (targetSlot.slot === 1) {
      row[iS1] = block.start;
      row[iE1] = block.end;
      row[iId1] = auditId;
      if (iSt1 >= 0) row[iSt1] = statusDisplay || 'Pending Approval';
    } else {
      row[iS2] = block.start;
      row[iE2] = block.end;
      row[iId2] = auditId;
      if (iSt2 >= 0) row[iSt2] = statusDisplay || 'Pending Approval';
    }

    row[iAvail] = 'NO';
    if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

    if (rowObj) {
      sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      rowByKey[key] = { rowIndex: rowIndex, row: row };
    }
    changed++;
  }

  return { success: true, changed: changed, message: 'Availability reserved' };
}

function Planning_directClearAuditId_(sh, auditId) {
  if (!auditId) return;
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v || '').trim(); });
  function hidx_(names) {
    var lc = hdr.map(function(v){ return String(v || '').trim().toLowerCase().replace(/[_\s]+/g, ' '); });
    for (var i = 0; i < names.length; i++) {
      var key = String(names[i] || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
      var idx = lc.indexOf(key);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  var iAvail = hidx_(['Available']);
  var iS1 = hidx_(['First_Audit_Start_Time','First Audit Start Time']);
  var iE1 = hidx_(['First_Audit_End_Time','First Audit End Time']);
  var iId1 = hidx_(['Audit_ID_1','Audit ID 1']);
  var iSt1 = hidx_(['Status_1','Status 1','Status']);
  var iS2 = hidx_(['Second_Audit_Start_Time','Second Audit Start Time']);
  var iE2 = hidx_(['Second_Audit_End_Time','Second Audit End Time']);
  var iId2 = hidx_(['Audit_ID_2','Audit ID 2']);
  var iSt2 = hidx_(['Status_2','Status 2']);
  var iUpd = hidx_(['Last_Updated','Last Updated','Timestamp']);

  var vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var tz = Planning_tz_();
  var changed = false;

  for (var r = 0; r < vals.length; r++) {
    var row = vals[r];
    var rowChanged = false;

    if (iId1 >= 0 && String(row[iId1] || '').trim() === auditId) {
      row[iId1] = '';
      if (iS1 >= 0) row[iS1] = '';
      if (iE1 >= 0) row[iE1] = '';
      if (iSt1 >= 0) row[iSt1] = '';
      rowChanged = true;
    }
    if (iId2 >= 0 && String(row[iId2] || '').trim() === auditId) {
      row[iId2] = '';
      if (iS2 >= 0) row[iS2] = '';
      if (iE2 >= 0) row[iE2] = '';
      if (iSt2 >= 0) row[iSt2] = '';
      rowChanged = true;
    }

    if (rowChanged) {
      var has1 = iId1 >= 0 && String(row[iId1] || '').trim();
      var has2 = iId2 >= 0 && String(row[iId2] || '').trim();
      if (iAvail >= 0) row[iAvail] = (has1 || has2) ? 'NO' : '';
      if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
      changed = true;
    }
  }

  if (changed) sh.getRange(2, 1, lastRow - 1, lastCol).setValues(vals);
}

function Planning_pickAvailabilitySlot_(row, block, idx) {
  var auditId = String(block.auditId || '').trim();
  var start = String(block.start || '').trim();
  var end = String(block.end || '').trim();

  var id1 = String(row[idx.iId1] || '').trim();
  var s1 = String(row[idx.iS1] || '').trim();
  var e1 = String(row[idx.iE1] || '').trim();
  var id2 = String(row[idx.iId2] || '').trim();
  var s2 = String(row[idx.iS2] || '').trim();
  var e2 = String(row[idx.iE2] || '').trim();

  if (id1 === auditId || !id1) {
    if (!id2 || id2 === auditId || !overlap_(block, { start: s2, end: e2 })) return { ok: true, slot: 1 };
  }
  if (id2 === auditId || !id2) {
    if (!id1 || id1 === auditId || !overlap_(block, { start: s1, end: e1 })) return { ok: true, slot: 2 };
  }

  return { ok: false, reason: 'Time overlap with existing audit in availability' };
}

function Planning_invalidate_() {
  try { if (typeof Status_invalidateAuditPlanningPack_ === 'function') Status_invalidateAuditPlanningPack_(); } catch (e0) {}
  try { if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_(); } catch (e1) {}
}

function Planning_tz_() {
  try {
    var ss = SpreadsheetApp.getActive();
    return (ss && ss.getSpreadsheetTimeZone) ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
  } catch (e) {
    return Session.getScriptTimeZone();
  }
}

function Planning_cellToYmd_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Planning_tz_(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function planningRowInfoFromStatusCtx_(statusCtx) {
  if (!statusCtx || !statusCtx.sheet || !statusCtx.row || !statusCtx.hdr) return null;
  return {
    ctx: {
      sh: statusCtx.sheet,
      hdr: statusCtx.hdr,
      colCompany: statusCtx.hdr.indexOf('Company') + 1,
      colLocation: statusCtx.hdr.indexOf('Location') + 1,
      colStatus: statusCtx.col.status + 1,
      colAssigned: statusCtx.col.assigned + 1,
      colReqHours: statusCtx.hdr.indexOf('Total audit time in hours') + 1,
      colDatePlanned: statusCtx.col.planned + 1,
      colJson: statusCtx.col.json + 1
    },
    rowIndex: statusCtx.rowIndex,
    row: statusCtx.row,
    company: statusCtx.hdr.indexOf('Company') >= 0 ? statusCtx.row[statusCtx.hdr.indexOf('Company')] : '',
    location: statusCtx.hdr.indexOf('Location') >= 0 ? statusCtx.row[statusCtx.hdr.indexOf('Location')] : '',
    status: String(statusCtx.status || '').trim(),
    requiredHours: statusCtx.hdr.indexOf('Total audit time in hours') >= 0 ? Number(statusCtx.row[statusCtx.hdr.indexOf('Total audit time in hours')] || 0) : 0
  };
}

function loadContext_(sh) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = function(name) { return hdr.indexOf(name) + 1; };

  return {
    sh: sh,
    hdr: hdr,
    colCompany: col('Company'),
    colLocation: col('Location'),
    colStatus: col('Status'),
    colAssigned: col('Assigned to'),
    colReqHours: col('Total audit time in hours'),
    colDatePlanned: col('Date - Planned'),
    colJson: col('Planning JSON')
  };
}

function findAudit_(ctx, auditId) {
  var sh = ctx.sh;
  var last = sh.getLastRow();
  if (last < 2) return null;

  var hdr = ctx.hdr;
  var colAI = hdr.indexOf('Audit ID') + 1;
  if (colAI <= 0) return null;

  var vals = sh.getRange(2, colAI, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(auditId)) {
      var rowIndex = i + 2;
      var row = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];

      return {
        ctx: ctx,
        rowIndex: rowIndex,
        row: row,
        company: row[ctx.colCompany - 1],
        location: row[ctx.colLocation - 1],
        status: String(row[ctx.colStatus - 1] || '').trim(),
        requiredHours: Number(row[ctx.colReqHours - 1] || 0)
      };
    }
  }
  return null;
}

function normalizeBlocks_(blocks) {
  var out = [];
  var hard = [];

  if (!blocks || !blocks.length) {
    hard.push({ date: null, reason: 'No blocks provided' });
    return { blocks: out, hard: hard };
  }

  blocks.forEach(function(b, i) {
    if (!b || !b.date || !b.start || !b.end) {
      hard.push({ date: b ? b.date : null, reason: 'Invalid block #' + (i + 1) });
      return;
    }
    var h = hours_(b.start, b.end);
    if (h <= 0) {
      hard.push({ date: b.date, reason: 'End <= start in block #' + (i + 1) });
      return;
    }
    out.push({
      date: b.date,
      start: b.start,
      end: b.end,
      hours: h
    });
  });

  return { blocks: out, hard: hard };
}

function checkHardConflicts_(ctx, rowInfo, blocks, auditorOwner, currentAuditId) {
  var hard = [];
  var sh = ctx.sh;
  var last = sh.getLastRow();
  if (last < 2) return hard;

  var colA = ctx.colAssigned;
  var colS = ctx.colStatus;
  var colJ = ctx.colJson;
  var colAI = ctx.hdr.indexOf('Audit ID') + 1;

  var existing = {};
  var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  rows.forEach(function(r, i) {
    var idx = i + 2;
    if (idx === rowInfo.rowIndex) return;
    if (String(r[colA - 1] || '').trim() !== String(auditorOwner || '').trim()) return;

    var otherAuditId = colAI > 0 ? String(r[colAI - 1] || '').trim() : '';
    if (currentAuditId && otherAuditId === String(currentAuditId).trim()) return;

    var st = String(r[colS - 1] || '').trim();
    if (st === 'Rejected' || st === 'Cancelled') return;

    var raw = r[colJ - 1];
    if (!raw) return;

    var js = null;
    try { js = JSON.parse(raw); } catch (e) {}
    if (!js || !js.blocks) return;

    js.blocks.forEach(function(b) {
      if (!existing[b.date]) existing[b.date] = [];
      existing[b.date].push(b);
    });
  });

  var newByDay = {};
  blocks.forEach(function(b) {
    if (!newByDay[b.date]) newByDay[b.date] = [];
    newByDay[b.date].push(b);
  });

  Object.keys(newByDay).forEach(function(d) {
    var n = newByDay[d];
    var e = existing[d] || [];

    var count = (e.length ? 1 : 0) + 1;
    if (count > 2) {
      hard.push({ date: d, reason: 'More than 2 audits for auditor on this day' });
    }

    n.forEach(function(nb) {
      e.forEach(function(ob) {
        if (overlap_(nb, ob)) {
          hard.push({ date: d, reason: 'Time overlap with existing audit' });
        }
      });
    });
  });

  return hard;
}

function checkSoftConflicts_(ctx, rowInfo, blocks, auditorOwner, opts) {
  opts = opts || {};
  var soft = [];
  var hard = [];

  blocks.forEach(function(b) {
    var wd = weekday_(b.date);
    var weekend = (wd === 'Sa' || wd === 'Su');

    if (weekend && !opts.allowWeekend) {
      hard.push({ date: b.date, reason: 'Weekend not allowed' });
    } else if (weekend && opts.allowWeekend) {
      soft.push({ date: b.date, reason: 'Weekend' });
    }
  });

  return { soft: soft, hard: hard };
}

function hours_(s, e) {
  var sm = toMin_(s), em = toMin_(e);
  return (sm != null && em != null && em > sm) ? (em - sm) / 60 : 0;
}

function toMin_(t) {
  var p = String(t).split(':');
  if (p.length !== 2) return null;
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function overlap_(a, b) {
  var s1 = toMin_(a.start), e1 = toMin_(a.end);
  var s2 = toMin_(b.start), e2 = toMin_(b.end);
  if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
  if (e1 <= s2 || e2 <= s1) return false;
  return true;
}

function weekday_(ds) {
  var p = String(ds).split('-');
  if (p.length !== 3) return null;
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()];
}

function failHard_(arr) {
  return {
    success: false,
    message: 'Planning failed',
    plannedHours: 0,
    requiredHours: 0,
    softConflicts: [],
    hardConflicts: arr,
    newStatus: null
  };
}

function fail_(msg) {
  return failHard_([{ date: null, reason: msg }]);
}
