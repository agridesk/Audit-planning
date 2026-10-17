/**
 * Rotation 2.0 Config_Scopes schema-only migration.
 * DEV only. Preview is read-only; Apply adds missing policy headers only.
 * No rotation maximum, applicability, add-on rule or +1 permission is guessed.
 * Apply is explicitly invoked; never called at runtime.
 */
var ROTATION20_POLICY_HEADERS = Object.freeze([
  'Rotation_Applies',
  'Rotation_Normal_Maximum',
  'Rotation_Plus_One_Permitted'
]);
function ConfigScopesRotation20_Preview() { return ConfigScopesRotation20_run_(false); }
function ConfigScopesRotation20_Apply() { return ConfigScopesRotation20_run_(true); }
function ConfigScopesRotation20_run_(apply) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ROTATION20_NO_ACTIVE_SPREADSHEET');
  var sh = ss.getSheetByName('Config_Scopes');
  if (!sh) throw new Error('ROTATION20_CONFIG_SCOPES_MISSING');
  var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var key = function(x) { return String(x == null ? '' : x).trim().toLowerCase().replace(/\s|_|-/g,''); };
  var counts = {};
  headers.forEach(function(h) { var k=key(h); if(k) counts[k]=(counts[k]||0)+1; });
  if (Object.keys(counts).some(function(k){return counts[k]>1;})) throw new Error('ROTATION20_DUPLICATE_CONFIG_HEADER');
  if (counts.slotkey!==1||counts.scopecode!==1) throw new Error('ROTATION20_CONFIG_IDENTITY_HEADERS_MISSING');
  var missing = ROTATION20_POLICY_HEADERS.filter(function(h){return !counts[key(h)];});
  var first = headers.length + 1;
  if (apply && missing.length) {
    sh.getRange(1, first, 1, missing.length).setValues([missing]);
    if (typeof ConfigScopes_ClearCache==='function') ConfigScopes_ClearCache();
  }
  return {ok:true,applied:!!apply,addedHeaders:missing,requiresBusinessPolicyPopulation:true,firstNewColumn:first};
}
