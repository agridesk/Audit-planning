// FILE: AMS03_ManagerPlanningSaveUiAcceptance.js
// BUILD: 2026-09-24_AMS03_MANAGER_PLANNING_SAVE_UI_ACCEPTANCE_R1
// PURPOSE: Static regression gate for Manager Planning save -> Pending acceptance UI coherence.

function RUN_AMS03_MANAGER_PLANNING_SAVE_UI_ACCEPTANCE() {
  var results = [];
  function gate(name, ok, detail) {
    results.push({ name:name, ok:!!ok, detail:detail || '' });
  }
  function read_(name) {
    return HtmlService.createHtmlOutputFromFile(name).getContent();
  }

  var toolkit = read_('ManagerPlanningUI_boot');
  var manager = read_('ManagerV5UI');

  gate('saveEventCarriesCanonicalStatus', toolkit.indexOf("newStatus:status") >= 0, 'Planning save event carries backend newStatus.');
  gate('saveEventCarriesActorRole', toolkit.indexOf("actorRole:String(V5_ROLE || '').toUpperCase()") >= 0, 'Manager/Auditor role is explicit in refresh event.');
  gate('managerReceivesPostMessage', manager.indexOf("data.type !== 'PLANNING_SAVED_V5'") >= 0, 'Opener postMessage path present.');
  gate('managerReceivesStorageFallback', manager.indexOf("event.key !== 'V5_PLANNING_SAVED_PAYLOAD'") >= 0, 'Cross-window storage fallback present.');
  gate('microRefreshWritesStatus', manager.indexOf('row.status = newStatus;') >= 0, 'Micro refresh applies canonical status.');
  gate('microRefreshPersistsWarmCache', manager.indexOf("localStorage.setItem('m5_singleGridCache_open'") >= 0, 'Post-save status survives warm-cache repaint.');
  gate('enrichmentProtectsSavedStatus', manager.indexOf("m5_normStatus_(r.status) === 'Pending Planning'") >= 0 && manager.indexOf('__m5ProtectedSaved') >= 0, 'Stale enrichment cannot downgrade freshly saved status.');

  var failed = results.filter(function(x){ return !x.ok; });
  var out = {
    ok: failed.length === 0,
    build: '2026-09-24_AMS03_MANAGER_PLANNING_SAVE_UI_ACCEPTANCE_R1',
    passed: results.length - failed.length,
    total: results.length,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
