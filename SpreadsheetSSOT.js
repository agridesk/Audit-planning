/***************************************
 * FILE: SSOT.gs
 * PURPOSE:
 *   Single Source of Truth spreadsheet resolver for the WebApp.
 *
 * SAFE CONSOLIDATION OF:
 *   - V5_SSOT.gs
 *   - V5_SetSSOT_Property.gs
 *
 * COMPATIBILITY:
 *   Existing V5_* function names are kept as aliases so existing files
 *   do not break.
 ***************************************/

var SSOT_PROP_KEY = 'V5_SSOT_SPREADSHEET_ID';

/**
 * Return the configured SSOT spreadsheet.
 *
 * WebApp-safe:
 * - first uses Script Property V5_SSOT_SPREADSHEET_ID
 * - falls back to active spreadsheet only in editor-bound context
 */
function SSOT_getSs_() {
  var id = '';
  try {
    id = String(PropertiesService.getScriptProperties()
      .getProperty(SSOT_PROP_KEY) || '').trim();
  } catch (e) {}

  if (id) return SpreadsheetApp.openById(id);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  throw new Error('SSOT spreadsheet not configured. Set Script Property ' + SSOT_PROP_KEY);
}

/**
 * Return a sheet by name from the configured SSOT spreadsheet.
 */
function SSOT_getSheet_(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('Missing sheet name');

  var ss = SSOT_getSs_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

/**
 * Set the SSOT spreadsheet id.
 *
 * Use manually from Apps Script editor when needed.
 */
function SSOT_setSsotId_(spreadsheetId) {
  spreadsheetId = String(spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('Missing spreadsheetId');

  PropertiesService.getScriptProperties()
    .setProperty(SSOT_PROP_KEY, spreadsheetId);

  return { ok: true, spreadsheetId: spreadsheetId };
}

/**
 * Optional diagnostic helper.
 */
function SSOT_healthcheck_() {
  try {
    var ss = SSOT_getSs_();
    return {
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      propKey: SSOT_PROP_KEY
    };
  } catch (e) {
    return {
      ok: false,
      propKey: SSOT_PROP_KEY,
      error: String(e && e.message ? e.message : e)
    };
  }
}


/***************************************
 * BACKWARD-COMPATIBLE V5 ALIASES
 * Keep these until all callers are migrated.
 ***************************************/

var V5_SSOT_PROP_KEY = SSOT_PROP_KEY;

function V5_SSOT_getSs_() {
  return SSOT_getSs_();
}

function V5_SSOT_getSheet_(name) {
  return SSOT_getSheet_(name);
}

function V5_SSOT_setSsotId_(spreadsheetId) {
  return SSOT_setSsotId_(spreadsheetId);
}

/**
 * Legacy one-time setter name from V5_SetSSOT_Property.gs.
 */
function V5_setSsotIdOnce_(spreadsheetId) {
  return SSOT_setSsotId_(spreadsheetId);
}
