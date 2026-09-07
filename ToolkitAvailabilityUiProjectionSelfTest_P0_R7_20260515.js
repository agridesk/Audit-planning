/**
 * ToolkitAvailabilityUiProjectionSelfTest_P0_R7_20260515.gs
 * Purpose: test the UI visual-owner rule before pasting UI changes.
 *
 * Run in Apps Script:
 *   RUN_TOOLKIT_AVAILABILITY_UI_R7_SELFTEST()
 *
 * This is a pure diagnostic. It does not read/write Sheets and does not mutate cache.
 */

function RUN_TOOLKIT_AVAILABILITY_UI_R7_SELFTEST() {
  var build = '2026-05-15_TOOLKIT_AVAIL_UI_R7_VISUAL_OWNER_SELFTEST';

  function hasPlannedAuditContextForUi_(iv) {
    if (!iv) return false;
    var company = String(iv.company || '').trim();
    var source = String(iv.source || '').toUpperCase();
    var reason = String(iv.reason || '').toUpperCase();
    var auditId = String(iv.auditId || '').trim();
    return !!company || !!auditId || source.indexOf('PLANNING_JSON') >= 0 || reason.indexOf('PLANNING JSON') >= 0 || reason.indexOf('OCCUPIED') >= 0;
  }

  function dedupeIntervalsForUi_(intervals) {
    var map = {};
    (intervals || []).forEach(function(iv) {
      if (!iv || !isFinite(iv.startMin) || !isFinite(iv.endMin) || iv.endMin <= iv.startMin) return;
      var company = String(iv.company || '').trim();
      var source = String(iv.source || '').trim();
      var auditId = String(iv.auditId || '').trim();
      var planned = hasPlannedAuditContextForUi_(iv);
      var key = String(iv.startMin) + '|' + String(iv.endMin) + '|' + company + '|' + (planned ? 'planned' : 'availability');
      var prev = map[key];
      if (!prev) {
        map[key] = Object.assign({}, iv, { company: company, source: source, auditId: auditId, plannedAuditUi: planned });
        return;
      }
      if (!prev.company && company) prev.company = company;
      if (!prev.auditId && auditId) prev.auditId = auditId;
      if (!prev.source && source) prev.source = source;
      prev.plannedAuditUi = !!(prev.plannedAuditUi || planned);
      prev.hard = (prev.hard !== false) || (iv.hard !== false);
    });
    return Object.keys(map).map(function(k) { return map[k]; }).sort(function(a,b) {
      return a.startMin - b.startMin || a.endMin - b.endMin || String(a.company || '').localeCompare(String(b.company || ''));
    });
  }

  function getVisualIntervalsForUi_(intervals) {
    var raw = (intervals || []).filter(function(iv) {
      return iv && isFinite(iv.startMin) && isFinite(iv.endMin) && iv.endMin > iv.startMin;
    });
    var planned = raw.filter(hasPlannedAuditContextForUi_);
    return dedupeIntervalsForUi_(planned.length ? planned : raw);
  }

  function label_(iv) {
    function hm(m) {
      var h = Math.floor(m / 60);
      var mm = m % 60;
      return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
    }
    return hm(iv.startMin) + '-' + hm(iv.endMin) + (iv.company ? ' | ' + iv.company : '');
  }

  var fixture_2026_07_15 = [
    { startMin: 510, endMin: 1050, hard: true, company: '', source: '', reason: '' },
    { startMin: 510, endMin: 750, hard: true, company: 'Poleplants', source: 'PLANNING_JSON_OVERLAY', reason: 'Occupied from Planning JSON' },
    { startMin: 840, endMin: 1140, hard: true, company: 'Vivers Salvat S.L.', source: 'PLANNING_JSON_OVERLAY', reason: 'Occupied from Planning JSON' }
  ];

  var fixture_2026_07_13 = [
    { startMin: 510, endMin: 990, hard: true, company: '', source: '', reason: '' },
    { startMin: 510, endMin: 990, hard: true, company: 'Valencia Plant Export', source: 'PLANNING_JSON_OVERLAY', reason: 'Occupied from Planning JSON' }
  ];

  var res15 = getVisualIntervalsForUi_(fixture_2026_07_15).map(label_);
  var res13 = getVisualIntervalsForUi_(fixture_2026_07_13).map(label_);

  var expected15 = ['08:30-12:30 | Poleplants', '14:00-19:00 | Vivers Salvat S.L.'];
  var expected13 = ['08:30-16:30 | Valencia Plant Export'];

  var ok15 = JSON.stringify(res15) === JSON.stringify(expected15);
  var ok13 = JSON.stringify(res13) === JSON.stringify(expected13);

  var out = {
    ok: !!(ok15 && ok13),
    build: build,
    purpose: 'Pure UI projection self-test; no sheet/cache mutation.',
    case_2026_07_15: { ok: ok15, actual: res15, expected: expected15 },
    case_2026_07_13: { ok: ok13, actual: res13, expected: expected13 }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
