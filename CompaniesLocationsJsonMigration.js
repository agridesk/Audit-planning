// CompaniesLocationsJsonMigration.gs
// One-time migration: Companies!H Location + Companies!K GPS-data -> Companies!V Locations_JSON
// Safe:
// - Does NOT overwrite existing valid HQ label/gps unless FORCE_OVERWRITE = true.
// - Creates/normalizes object format: { locations:[...], slots:[] }
// - HQ = column H label + column K gps.
// - S1-S4 are preserved if already present; otherwise created empty.

function migrateCompaniesGpsDataToLocationsJson_HQ() {
  var CONFIG = {
    SHEET_NAME: 'Companies',
    START_ROW: 2,

    COL_LOCATION_H: 8,        // H = Location
    COL_GPS_K: 11,            // K = GPS-data
    COL_LOCATIONS_JSON_V: 22, // V = Locations_JSON

    FORCE_OVERWRITE: true,
    DRY_RUN: false
  };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error('Sheet not found: ' + CONFIG.SHEET_NAME);

  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.START_ROW) {
    Logger.log('No data rows.');
    return { success: true, scanned: 0, updated: 0, skipped: 0, invalidGps: 0 };
  }

  var numRows = lastRow - CONFIG.START_ROW + 1;
  var lastCol = Math.max(sh.getLastColumn(), CONFIG.COL_LOCATIONS_JSON_V);
  var values = sh.getRange(CONFIG.START_ROW, 1, numRows, lastCol).getValues();

  var writes = [];
  var scanned = 0;
  var updated = 0;
  var skipped = 0;
  var invalidGps = 0;

  values.forEach(function(row, idx) {
    var rowNumber = CONFIG.START_ROW + idx;
    var locationH = clean_(row[CONFIG.COL_LOCATION_H - 1]);
    var gpsK = clean_(row[CONFIG.COL_GPS_K - 1]);
    var rawJson = clean_(row[CONFIG.COL_LOCATIONS_JSON_V - 1]);

    if (rowIsEmpty_(row)) return;
    scanned++;

    if (!locationH && !gpsK && !rawJson) {
      skipped++;
      return;
    }

    var gpsOk = isValidGps_(gpsK);
    if (gpsK && !gpsOk) {
      invalidGps++;
      Logger.log('Invalid GPS at row ' + rowNumber + ': ' + gpsK);
    }

    var obj = parseLocationsObject_(rawJson);
    var locs = normalizeLocations_(obj.locations || []);
    var hq = findByCode_(locs, 'HQ');

    if (!hq) {
      hq = { code: 'HQ', label: '', gps: '', comment: '', active: true };
      locs.unshift(hq);
    }

    var before = JSON.stringify({ locations: locs, slots: Array.isArray(obj.slots) ? obj.slots : [] });

    var shouldWriteLabel = CONFIG.FORCE_OVERWRITE || !clean_(hq.label || hq.name);
    var shouldWriteGps = CONFIG.FORCE_OVERWRITE || !clean_(hq.gps);

    if (shouldWriteLabel && locationH) hq.label = locationH;
    if (shouldWriteGps && gpsK && gpsOk) hq.gps = gpsK;

    hq.code = 'HQ';
    hq.active = true;
    hq.comment = clean_(hq.comment);

    var finalObj = {
      locations: normalizeLocations_(locs),
      slots: Array.isArray(obj.slots) ? obj.slots : []
    };
    var after = JSON.stringify(finalObj);

    if (after !== before || rawJson !== after) {
      writes.push({ row: rowNumber, value: after });
      updated++;
    } else {
      skipped++;
    }
  });

  if (!CONFIG.DRY_RUN) {
    writes.forEach(function(w) {
      sh.getRange(w.row, CONFIG.COL_LOCATIONS_JSON_V).setValue(w.value);
    });
  }

  var result = {
    success: true,
    dryRun: CONFIG.DRY_RUN,
    scanned: scanned,
    updated: updated,
    skipped: skipped,
    invalidGps: invalidGps
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function parseLocationsObject_(raw) {
  var s = clean_(raw);
  if (!s) return { locations: [], slots: [] };

  try {
    var parsed = JSON.parse(s);

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.locations)) {
      return {
        locations: parsed.locations,
        slots: Array.isArray(parsed.slots) ? parsed.slots : []
      };
    }

    if (Array.isArray(parsed)) {
      return { locations: parsed, slots: [] };
    }
  } catch (e) {}

  return { locations: [], slots: [] };
}

function normalizeLocations_(locations) {
  var byCode = {};
  (Array.isArray(locations) ? locations : []).forEach(function(loc) {
    if (!loc) return;
    var code = clean_(loc.code).toUpperCase();
    if (!code) return;
    if (['HQ', 'S1', 'S2', 'S3', 'S4'].indexOf(code) === -1) return;

    byCode[code] = {
      code: code,
      label: clean_(loc.label || loc.name),
      gps: clean_(loc.gps),
      comment: clean_(loc.comment),
      active: code === 'HQ' ? true : !!loc.active
    };
  });

  return ['HQ', 'S1', 'S2', 'S3', 'S4'].map(function(code) {
    return byCode[code] || {
      code: code,
      label: '',
      gps: '',
      comment: '',
      active: code === 'HQ'
    };
  });
}

function findByCode_(locations, code) {
  code = clean_(code).toUpperCase();
  for (var i = 0; i < locations.length; i++) {
    if (clean_(locations[i].code).toUpperCase() === code) return locations[i];
  }
  return null;
}

function isValidGps_(gps) {
  var s = clean_(gps);
  if (!s) return false;
  var parts = s.split(',');
  if (parts.length < 2) return false;

  var lat = Number(clean_(parts[0]));
  var lng = Number(clean_(parts[1]));

  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function rowIsEmpty_(row) {
  for (var i = 0; i < row.length; i++) {
    if (clean_(row[i])) return false;
  }
  return true;
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}
