function RUN_DIAG() {
  var auditId = "AUD_Poleplants_HQ_1777531729465_66";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Audit planning");
  var data = sh.getDataRange().getValues();
  var hdr = data[0];

  var colAI = hdr.indexOf("Audit ID");
  var colJSON = hdr.indexOf("Planning JSON");
  var colDatePlanned = hdr.indexOf("Date - Planned");

  var row = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colAI]) === auditId) {
      row = data[i];
      break;
    }
  }

  if (!row) {
    Logger.log("❌ Audit not found");
    return;
  }

  var jsonRaw = row[colJSON];
  var json = {};
  try {
    json = JSON.parse(jsonRaw);
  } catch(e) {}

  var blocks = (json && json.blocks) ? json.blocks : [];
  var jsonDate = blocks.length ? blocks[0].date : "NONE";

  Logger.log("===== DIAG =====");
  Logger.log("Sheet Date - Planned: " + row[colDatePlanned]);
  Logger.log("Planning JSON date: " + jsonDate);
  Logger.log("Full JSON: " + jsonRaw);
}