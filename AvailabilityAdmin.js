// Admin_Availability_Core.gs
// Admin helpers for Auditor Availability duplicates audit/cleanup
// SAFE: audit is read-only; cleanup requires apply:true.

function V5_admin_auditAvailabilityDuplicates_(options) {
  var opt = options || {};
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Auditor Availability');
  if (!sh) throw new Error('Sheet "Auditor Availability" not found');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:true, message:'No data rows', keys:0, dups:0, items:[] };

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(h){ return String(h||'').trim(); });
  var headersLc = headers.map(function(h){ return String(h||'').trim().toLowerCase().replace(/[_\s]+/g,' '); });

  function col_(names){
    for (var i=0;i<names.length;i++){
      var n = String(names[i]).toLowerCase().replace(/[_\s]+/g,' ');
      var ix = headersLc.indexOf(n);
      if (ix >= 0) return ix;
    }
    return -1;
  }

  var cDate = col_(['date','date iso','dateiso','date iso']);
  var cEmail = col_(['auditor email','auditor_email','auditor e-mail','email','e-mail']);
  var cAvail = col_(['available','availability','avail']);
  var cSource = col_(['source']);
  var cStatus1 = col_(['status 1','status_1','state 1','state_1']);
  var cID1 = col_(['audit id 1','audit_id_1','audit_id1']);
  var cID2 = col_(['audit id 2','audit_id_2','audit_id2']);
  var cUpdated = col_(['last updated','last_updated','updated','updated at','timestamp']);

  if (cDate < 0 || cEmail < 0) throw new Error('Missing required headers: Date / Auditor_Email');

  // Use display values for robust date normalization (handles Date objects + locale strings)
  var n = lastRow - 1;
  var dateDisp = sh.getRange(2, cDate+1, n, 1).getDisplayValues();
  var emailVals = sh.getRange(2, cEmail+1, n, 1).getValues();

  function toISO_(v){
    if (v == null || v === '') return '';
    var s = String(v).trim();
    if (s.charAt(0) === "'") s = s.slice(1).trim();
    var m1 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return m1[0];
    var m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m2) {
      var dd = ('0' + m2[1]).slice(-2);
      var mm = ('0' + m2[2]).slice(-2);
      return m2[3] + '-' + mm + '-' + dd;
    }
    return '';
  }

  // Group rows by (DateISO|email)
  var groups = {}; // key -> {iso,email,rows:[]}
  for (var i=0;i<n;i++){
    var iso = toISO_(dateDisp[i][0]);
    var em = String(emailVals[i][0]||'').trim().toLowerCase();
    if (!iso || !em) continue;
    var key = iso + '|' + em;
    if (!groups[key]) groups[key] = { key:key, iso:iso, email:em, rows:[] };
    groups[key].rows.push(i + 2); // sheet row number
  }

  var items = [];
  var dupCount = 0;

  Object.keys(groups).sort().forEach(function(k){
    var g = groups[k];
    if (g.rows.length <= 1) return;
    dupCount++;

    // Pull details per row (single-row reads; fine for admin)
    var detail = g.rows.map(function(rn){
      var row = sh.getRange(rn, 1, 1, lastCol).getValues()[0];
      return {
        row: rn,
        available: (cAvail>=0)? String(row[cAvail]||'').trim() : '',
        source: (cSource>=0)? String(row[cSource]||'').trim() : '',
        status1: (cStatus1>=0)? String(row[cStatus1]||'').trim() : '',
        audit1: (cID1>=0)? String(row[cID1]||'').trim() : '',
        audit2: (cID2>=0)? String(row[cID2]||'').trim() : '',
        lastUpdated: (cUpdated>=0)? String(row[cUpdated]||'').trim() : ''
      };
    });

    items.push({ key:g.key, iso:g.iso, email:g.email, rows:g.rows.slice(), detail:detail });
  });

  return {
    ok:true,
    keys:Object.keys(groups).length,
    dups:dupCount,
    items: items
  };
}

function V5_admin_cleanupAvailabilityDuplicates_(options) {
  var opt = options || {};
  var apply = !!opt.apply; // default false (dry-run)
  var maxRounds = opt.maxRounds || 5;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Auditor Availability');
    if (!sh) throw new Error('Sheet "Auditor Availability" not found');

    function pickWinnerRow_(detailList){
      // Rule 1: hard booked wins
      for (var i=0;i<detailList.length;i++){
        if (detailList[i].audit1 || detailList[i].audit2) return detailList[i].row;
      }
      // Rule 2: NO wins
      for (var j=0;j<detailList.length;j++){
        if (String(detailList[j].available).toUpperCase() === 'NO') return detailList[j].row;
      }
      // Rule 3: CALENDAR_OVERRIDE wins
      for (var k=0;k<detailList.length;k++){
        if (String(detailList[k].source).toUpperCase() === 'CALENDAR_OVERRIDE') return detailList[k].row;
      }
      // Rule 4: newest lastUpdated (best effort)
      var best = detailList[0].row;
      var bestTs = String(detailList[0].lastUpdated || '');
      for (var m=1;m<detailList.length;m++){
        var ts = String(detailList[m].lastUpdated || '');
        if (ts > bestTs) { bestTs = ts; best = detailList[m].row; }
      }
      return best;
    }

    if (!apply) {
      var audit0 = V5_admin_auditAvailabilityDuplicates_({});
      if (!audit0.ok) return audit0;
      var actions0 = (audit0.items || []).map(function(item){
        var keep = pickWinnerRow_(item.detail);
        var del = item.rows.filter(function(r){ return r !== keep; });
        return { key:item.key, keep:keep, del:del };
      });
      return { ok:true, apply:false, duplicates:(audit0.items||[]).length, actions:actions0 };
    }

    var totalDeleted = 0;
    var failures = [];
    var rounds = 0;

    while (rounds < maxRounds) {
      rounds++;

      var audit = V5_admin_auditAvailabilityDuplicates_({});
      if (!audit.ok) return audit;

      var items = audit.items || [];
      if (!items.length) {
        return { ok:true, apply:true, rounds:rounds, duplicates:0, deleted:totalDeleted, failures:failures };
      }

      var toDelete = [];
      items.forEach(function(item){
        var keep = pickWinnerRow_(item.detail);
        item.rows.forEach(function(rn){
          if (rn !== keep) toDelete.push(rn);
        });
      });

      toDelete.sort(function(a,b){ return b-a; }); // global descending

      var deletedThisRound = 0;
      toDelete.forEach(function(rn){
        try {
          sh.deleteRow(rn);
          deletedThisRound++;
        } catch (e) {
          failures.push({ row: rn, msg: String(e && e.message ? e.message : e) });
        }
      });

      totalDeleted += deletedThisRound;

      if (deletedThisRound === 0) {
        return {
          ok: false,
          apply: true,
          rounds: rounds,
          message: 'No rows deleted but duplicates remain. Likely protection or concurrent writes.',
          remainingDuplicates: items.length,
          deleted: totalDeleted,
          failures: failures
        };
      }
    }

    var auditEnd = V5_admin_auditAvailabilityDuplicates_({});
    return {
      ok: true,
      apply: true,
      rounds: rounds,
      remainingDuplicates: (auditEnd.items || []).length,
      deleted: totalDeleted,
      failures: failures
    };

  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
