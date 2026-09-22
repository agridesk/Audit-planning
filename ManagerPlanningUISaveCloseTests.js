/***********************************************************************
 * FILE: ManagerPlanningUISaveCloseTests.js
 * BUILD: 2026-09-22_AMS03_TOOLKIT_SAVE_CLOSE_TESTS_R1
 * Read-only source-contract acceptance for Planning Toolkit Save & Close.
 ***********************************************************************/
var AMS03_TOOLKIT_SAVE_CLOSE_TEST_BUILD = '2026-09-22_AMS03_TOOLKIT_SAVE_CLOSE_TESTS_R1';

function RUN_AMS03_TOOLKIT_SAVE_CLOSE_ACCEPTANCE() {
  var errors = [];
  var gates = {};
  var shell = '';
  var partial = '';
  var boot = '';

  try { shell = HtmlService.createHtmlOutputFromFile('ManagerPlanningV5UI').getContent(); }
  catch (e0) { errors.push('Cannot read ManagerPlanningV5UI: ' + String(e0 && e0.message ? e0.message : e0)); }
  try { partial = HtmlService.createHtmlOutputFromFile('ManagerPlanningUI_save_close').getContent(); }
  catch (e1) { errors.push('Cannot read ManagerPlanningUI_save_close: ' + String(e1 && e1.message ? e1.message : e1)); }
  try { boot = HtmlService.createHtmlOutputFromFile('ManagerPlanningUI_boot').getContent(); }
  catch (e2) { errors.push('Cannot read ManagerPlanningUI_boot: ' + String(e2 && e2.message ? e2.message : e2)); }

  gates.partialIncludedAfterBoot = shell.indexOf("createHtmlOutputFromFile('ManagerPlanningUI_boot')") >= 0 &&
    shell.indexOf("createHtmlOutputFromFile('ManagerPlanningUI_save_close')") > shell.indexOf("createHtmlOutputFromFile('ManagerPlanningUI_boot')");
  gates.wrapsOnlyPostSaveSuccessState = partial.indexOf('v5ShowPostSaveStayOpenState_') >= 0 &&
    partial.indexOf('var original = v5ShowPostSaveStayOpenState_') >= 0 &&
    partial.indexOf('original.apply(this, arguments)') >= 0;
  gates.openerSignalledBeforeClose = partial.indexOf('postCloseRequest_();') >= 0 &&
    partial.indexOf("type: 'PLANNING_TOOLKIT_CLOSE_REQUEST_V5'") >= 0;
  gates.hostCloseAttemptPresent = partial.indexOf('google.script.host.close') >= 0;
  gates.windowCloseAttemptPresent = partial.indexOf('window.close()') >= 0;
  gates.manualFallbackPresent = partial.indexOf("btn.textContent = 'Close planning'") >= 0 &&
    partial.indexOf('ensureFallback_') >= 0;
  gates.saveSuccessStillSignalsOpener = boot.indexOf("localStorage.setItem('V5_PLANNING_SAVED_PAYLOAD'") >= 0 &&
    boot.indexOf('v5PostToOpener_(__savedPayload)') >= 0;
  gates.noBusinessWriteRpcIntroduced = partial.indexOf('google.script.run') < 0 && partial.indexOf('mpRpcCall_') < 0;
  gates.noStatusMutationIntroduced = partial.indexOf('StatusMachine') < 0 && partial.indexOf('setValue(') < 0;
  gates.readOnly = true;

  Object.keys(gates).forEach(function (k) {
    if (gates[k] !== true) errors.push('Gate failed: ' + k);
  });

  var out = {
    success: errors.length === 0,
    build: AMS03_TOOLKIT_SAVE_CLOSE_TEST_BUILD,
    readOnly: true,
    writesPerformed: false,
    gates: gates,
    errors: errors
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
