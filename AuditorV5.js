// BUILD: AUDITORV5_GS_LEGACY_GRID_DISABLED_20260118_104502
// NOTE: This file previously defined AuditorV5_GetAuditorGrid, which collided with AuditorV5Backend.gs.
// That collision caused '100 audits' when Session email was empty (assigned.indexOf('') matches all).
// The legacy grid endpoint has been renamed to AuditorV5_GetAuditorGrid_LEGACY_DISABLED.

// AuditorV5Backend.gs
// FIX: Auditor visibility based strictly on 'Assigned' column
// Timestamp: 20260104_140832

// NOTE: This file replaces previous AuditorV5Backend.gs versions.
// It aligns Auditor visibility with Manager UI rules.

function AuditorV5_GetAuditorGrid_LEGACY_DISABLED(opts) {
  opts = opts || {};
  var view = opts.view || 'active';

  var email = auditorV5_getActiveEmail_();
  var auditorName = auditorV5_getAuditorNameByEmail_(email);

  var sh = SpreadsheetApp.getActive().getSheetByName('Audit Planning');
  if (!sh) return { rows: [] };

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { rows: [] };

  var headers = values[0].map(String);
  function H(names){
    for (var i=0;i<headers.length;i++){
      for (var j=0;j<names.length;j++){
        if (headers[i] === names[j]) return i;
      }
    }
    return -1;
  }

  var idxAssigned = H(['Assigned']);
  var idxCompany  = H(['Company']);
  var idxStatus   = H(['Status']);

  var rows = [];

  for (var r=1;r<values.length;r++){
    var row = values[r];

    var assigned = idxAssigned>=0 ? String(row[idxAssigned]||'').trim().toLowerCase() : '';
var aName = String(auditorName||'').trim().toLowerCase();
var aMail = String(email||'').trim().toLowerCase();
if (assigned.indexOf(aName) === -1 && assigned.indexOf(aMail) === -1) {
      continue;
    }

    rows.push({
      auditId: r,
      company: idxCompany>=0 ? row[idxCopany] : '',
      status: idxStatus>=0 ? row[idxStatus] : '',
      assigned: row[idxAssigned]
    });
  }

  return { rows: rows };
}

// Helpers
function auditorV5_getActiveEmail__LEGACY_DISABLED(){
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch(e){
    return '';
  }
}

function auditorV5_getAuditorNameByEmail__LEGACY_DISABLED(email){
  var sh = SpreadsheetApp.getActive().getSheetByName('Auditors');
  if (!sh) return '';
  var vals = sh.getDataRange().getValues();
  for (var i=1;i<vals.length;i++){
    if (String(vals[i][1]).toLowerCase() === email.toLowerCase()){
      return String(vals[i][0]);
    }
  }
  return '';
}
function AuditorV5_Diag_RuntimeRow_TEST111_Days() {
  var req = {
    view: "active",
    auditorEmail: "romboutsrwj@gmail.com",
    noCache: true,
    diag: true
  };

  var res = AuditorV5_GetAuditorGrid(req);
  var rows = (res && res.rows) ? res.rows : [];

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].auditId || '').trim() === 'TEST111') {
      Logger.log(JSON.stringify(rows[i], null, 2));
      return rows[i];
    }
  }

  Logger.log("TEST111 NOT FOUND");
  return null;
}