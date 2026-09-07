/***********************************************************************
 * AUDIT_TIME_V5_FINAL_HEADER_STRICT.GS
 ***********************************************************************/

var AT_SHEET = 'Audit planning';
var CS_SHEET = 'Config_Scopes';

function AuditTimeV5_RebuildTotalHours() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(AT_SHEET);
  var cs = ss.getSheetByName(CS_SHEET);

  if (!sh) throw new Error('Missing sheet: ' + AT_SHEET);
  if (!cs) throw new Error('Missing sheet: ' + CS_SHEET);

  var data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error('Audit planning empty');

  var headers = data[0].map(h => String(h || '').trim().toLowerCase());

  var idxTotal = headers.indexOf('total audit time in hours');
  if (idxTotal === -1) throw new Error('Missing column: Total audit time in hours');

  var csData = cs.getDataRange().getValues();
  var csHeaders = csData[0];

  var idxSlot = csHeaders.indexOf('SlotKey');
  var idxDefault = csHeaders.indexOf('Default_hours');

  var defaultMap = {};
  for (var i = 1; i < csData.length; i++) {
    defaultMap[csData[i][idxSlot]] = Number(csData[i][idxDefault]) || 0;
  }

  var output = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var total = 0;

    for (var c = 0; c < data[0].length; c++) {
      var h = data[0][c];
      if (!/^SCOPE_\d+$/.test(h)) continue;
      if (String(row[c]).toLowerCase() !== 'x') continue;

      var durIdx = data[0].indexOf('Duration ' + h);
      var override = durIdx >= 0 ? Number(row[durIdx]) : 0;

      total += override || defaultMap[h] || 0;
    }

    output.push([total]);
  }

  sh.getRange(2, idxTotal + 1, output.length, 1).setValues(output);

  Logger.log('Rebuild OK');
}

function AuditTimeV5_DiagnoseByAuditId(auditId) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(AT_SHEET);
  var cs = ss.getSheetByName(CS_SHEET);

  var data = sh.getDataRange().getValues();
  var headers = data[0];

  var idxAudit = headers.indexOf('Audit ID');
  var idxTotal = headers.map(h => String(h).toLowerCase().trim()).indexOf('total audit time in hours');

  var csData = cs.getDataRange().getValues();
  var csHeaders = csData[0];

  var idxSlot = csHeaders.indexOf('SlotKey');
  var idxDefault = csHeaders.indexOf('Default_hours');

  var defaultMap = {};
  for (var i = 1; i < csData.length; i++) {
    defaultMap[csData[i][idxSlot]] = Number(csData[i][idxDefault]) || 0;
  }

  for (var r = 1; r < data.length; r++) {
    if (data[r][idxAudit] != auditId) continue;

    var row = data[r];
    var breakdown = [];
    var total = 0;

    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (!/^SCOPE_\d+$/.test(h)) continue;
      if (String(row[c]).toLowerCase() !== 'x') continue;

      var durIdx = headers.indexOf('Duration ' + h);
      var override = durIdx >= 0 ? Number(row[durIdx]) : 0;
      var def = defaultMap[h] || 0;

      var used = override || def;

      breakdown.push({
        scope: h,
        override: override || null,
        default: def,
        used: used,
        source: override ? 'override' : 'default'
      });

      total += used;
    }

    var result = {
      auditId: auditId,
      calculatedTotal: total,
      existingValue: idxTotal >= 0 ? row[idxTotal] : null,
      breakdown: breakdown
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  throw new Error('Audit not found');
}
