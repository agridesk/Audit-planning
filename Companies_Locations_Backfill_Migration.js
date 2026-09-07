/**
 * Companies_Locations_Backfill_Migration_V2.gs
 *
 * STRICT SAFE migration
 *
 * Goal:
 * - make Locations_JSON the durable source of truth
 * - mirror HQ into legacy fields ONLY when source is trustworthy
 *
 * Safety rules:
 * - use Locations_JSON when valid
 * - else use Slot_Templates only when it contains a real HQ/location payload
 * - else SKIP the row
 * - never mass-backfill from legacy H/K blindly
 * - create Company_UID only for rows actually migrated
 */

function COMP_migrateLocationsJsonToLegacyMirrors_V2_DRYRUN() {
  return COMP_migrateLocationsJsonToLegacyMirrors_V2_(false);
}

function COMP_migrateLocationsJsonToLegacyMirrors_V2_APPLY() {
  return COMP_migrateLocationsJsonToLegacyMirrors_V2_(true);
}

function COMP_migrateLocationsJsonToLegacyMirrors_V2_(applyChanges) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Companies');
  if (!sh) throw new Error('Companies sheet not found.');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { success:true, apply:!!applyChanges, scanned:0, changed:0, skipped:0, message:'Companies sheet has no data rows.' };
  }

  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0] || [];
  var map = COMP_MIG2_getHeaderMap_(headers);

  var cCompany       = COMP_MIG2_requireHeader_(map, ['Company']);
  var cLocation      = COMP_MIG2_requireHeader_(map, ['Location']);
  var cGps           = COMP_MIG2_requireHeader_(map, ['GPS-data', 'GPS data', 'GPS']);
  var cLocCount      = COMP_MIG2_requireHeader_(map, ['Locations_to_plan', 'Locations to plan']);
  var cCompanyUid    = COMP_MIG2_findHeader_(map, ['Company_UID', 'Company UID', 'UID']);
  var cSlotTpl       = COMP_MIG2_findHeader_(map, ['Slot_Templates', 'Slot Templates']);
  var cLocationsJson = COMP_MIG2_requireHeader_(map, ['Locations_JSON', 'Locations JSON']);

  var scanned = 0;
  var changed = 0;
  var skipped = 0;
  var preview = [];
  var skippedPreview = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r] || [];
    if (COMP_MIG2_rowIsEmpty_(row)) continue;
    scanned++;

    var company = COMP_MIG2_cleanText_(row[cCompany]);
    var legacyLocation = COMP_MIG2_cleanText_(row[cLocation]);
    var legacyGps = COMP_MIG2_cleanText_(row[cGps]);
    var rawJson = COMP_MIG2_cleanText_(row[cLocationsJson]);
    var rawSlotTemplates = cSlotTpl >= 0 ? COMP_MIG2_cleanText_(row[cSlotTpl]) : '';

    var resolved = COMP_MIG2_resolveLocationsSource_(rawJson, rawSlotTemplates, legacyLocation, legacyGps);
    if (!resolved.safe) {
      skipped++;
      if (skippedPreview.length < 25) {
        skippedPreview.push({
          rowNumber: r + 1,
          company: company,
          reason: resolved.reason,
          sourceUsed: resolved.source
        });
      }
      continue;
    }

    var locations = resolved.locations || [];
    var hq = COMP_MIG2_findHQ_(locations);
    if (!hq || !COMP_MIG2_hasMeaningfulHq_(hq)) {
      skipped++;
      if (skippedPreview.length < 25) {
        skippedPreview.push({
          rowNumber: r + 1,
          company: company,
          reason: 'Resolved source has no meaningful HQ payload',
          sourceUsed: resolved.source
        });
      }
      continue;
    }

    var finalLocationsJson = JSON.stringify(locations);
    var finalSlotTemplates = JSON.stringify({
      locations: locations.map(function(loc){
        return {
          code: loc.code,
          label: loc.name,
          gps: loc.gps,
          comment: loc.comment
        };
      }),
      slots: []
    });
    var finalLocCount = String(COMP_MIG2_countActiveLocations_(locations));
    var finalUid = cCompanyUid >= 0 ? (COMP_MIG2_cleanText_(row[cCompanyUid]) || COMP_MIG2_makeUid_()) : '';

    var patch = { rowNumber:r + 1, company:company, sourceUsed:resolved.source, fields:{} };
    var rowChanged = false;

    if (COMP_MIG2_cleanText_(row[cLocation]) !== String(hq.name || '')) {
      patch.fields.location = String(hq.name || '');
      rowChanged = true;
    }
    if (COMP_MIG2_cleanText_(row[cGps]) !== String(hq.gps || '')) {
      patch.fields.gps = String(hq.gps || '');
      rowChanged = true;
    }
    if (COMP_MIG2_cleanText_(row[cLocCount]) !== finalLocCount) {
      patch.fields.locationsToPlan = finalLocCount;
      rowChanged = true;
    }
    if (COMP_MIG2_cleanText_(row[cLocationsJson]) !== finalLocationsJson) {
      patch.fields.locationsJson = finalLocationsJson;
      rowChanged = true;
    }
    if (cSlotTpl >= 0 && COMP_MIG2_cleanText_(row[cSlotTpl]) !== finalSlotTemplates) {
      patch.fields.slotTemplates = finalSlotTemplates;
      rowChanged = true;
    }
    if (cCompanyUid >= 0 && COMP_MIG2_cleanText_(row[cCompanyUid]) !== finalUid) {
      patch.fields.companyUid = finalUid;
      rowChanged = true;
    }

    if (!rowChanged) continue;

    changed++;
    if (preview.length < 25) preview.push(patch);

    if (applyChanges) {
      if (patch.fields.location !== undefined) sh.getRange(r + 1, cLocation + 1).setValue(patch.fields.location);
      if (patch.fields.gps !== undefined) sh.getRange(r + 1, cGps + 1).setValue(patch.fields.gps);
      if (patch.fields.locationsToPlan !== undefined) sh.getRange(r + 1, cLocCount + 1).setValue(patch.fields.locationsToPlan);
      if (patch.fields.locationsJson !== undefined) sh.getRange(r + 1, cLocationsJson + 1).setValue(patch.fields.locationsJson);
      if (cSlotTpl >= 0 && patch.fields.slotTemplates !== undefined) sh.getRange(r + 1, cSlotTpl + 1).setValue(patch.fields.slotTemplates);
      if (cCompanyUid >= 0 && patch.fields.companyUid !== undefined) sh.getRange(r + 1, cCompanyUid + 1).setValue(patch.fields.companyUid);
    }
  }

  SpreadsheetApp.flush();

  Logger.log('=== COMPANIES LOCATIONS MIGRATION V2 ===');
  Logger.log('Mode: ' + (applyChanges ? 'APPLY' : 'DRYRUN'));
  Logger.log('Scanned rows: ' + scanned);
  Logger.log('Changed rows: ' + changed);
  Logger.log('Skipped rows: ' + skipped);
  Logger.log('Changed preview: ' + JSON.stringify(preview, null, 2));
  Logger.log('Skipped preview: ' + JSON.stringify(skippedPreview, null, 2));

  return {
    success: true,
    apply: !!applyChanges,
    scanned: scanned,
    changed: changed,
    skipped: skipped,
    preview: preview,
    skippedPreview: skippedPreview,
    message: applyChanges
      ? ('Applied strict migration for ' + changed + ' Companies rows. Skipped ' + skipped + ' rows.')
      : ('Strict dry run completed. ' + changed + ' rows would change; ' + skipped + ' rows would be skipped.')
  };
}



/***************************************************************************************
 * Companies import preparation helpers
 * Purpose:
 * - after Excel import, fill missing Company_UID values
 * - first-fill Locations_JSON from legacy Location + GPS-data when Locations_JSON is empty
 * - keep existing Company_UID and existing Locations_JSON untouched
 ***************************************************************************************/

function COMPANIES_importPrepFromExcel_DRYRUN() {
  return COMPANIES_importPrepFromExcel_(false);
}

function COMPANIES_importPrepFromExcel_APPLY() {
  return COMPANIES_importPrepFromExcel_(true);
}

function COMPANIES_importPrepFromExcel_(applyChanges) {
  var uidResult = COMPANIES_fillMissingCompanyUIDs_(applyChanges);
  var locResult = COMPANIES_firstFillLocationsJsonFromLegacyGps_(applyChanges);
  return {
    success: true,
    apply: !!applyChanges,
    uid: uidResult,
    locationsJson: locResult,
    message: applyChanges
      ? 'Companies import prep applied.'
      : 'Companies import prep dry run completed.'
  };
}

function COMPANIES_fillMissingCompanyUIDs_DRYRUN() {
  return COMPANIES_fillMissingCompanyUIDs_(false);
}

function COMPANIES_fillMissingCompanyUIDs_APPLY() {
  return COMPANIES_fillMissingCompanyUIDs_(true);
}

function COMPANIES_fillMissingCompanyUIDs_(applyChanges) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Companies');
  if (!sh) throw new Error('Companies sheet not found.');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { success:true, apply:!!applyChanges, scanned:0, changed:0, skipped:0, preview:[] };
  }

  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0] || [];
  var map = COMP_MIG2_getHeaderMap_(headers);
  var cCompany = COMP_MIG2_requireHeader_(map, ['Company']);
  var cCompanyUid = COMP_MIG2_requireHeader_(map, ['Company_UID', 'Company UID', 'UID']);

  var scanned = 0;
  var changed = 0;
  var skipped = 0;
  var preview = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r] || [];
    if (COMP_MIG2_rowIsEmpty_(row)) continue;
    scanned++;

    var company = COMP_MIG2_cleanText_(row[cCompany]);
    var currentUid = COMP_MIG2_cleanText_(row[cCompanyUid]);
    if (!company) {
      skipped++;
      continue;
    }
    if (currentUid) continue;

    var newUid = COMP_MIG2_makeUid_();
    changed++;
    if (preview.length < 25) {
      preview.push({ rowNumber:r + 1, company:company, companyUid:newUid });
    }
    if (applyChanges) {
      sh.getRange(r + 1, cCompanyUid + 1).setValue(newUid);
    }
  }

  SpreadsheetApp.flush();
  Logger.log(JSON.stringify({
    task:'COMPANIES_fillMissingCompanyUIDs',
    apply:!!applyChanges,
    scanned:scanned,
    changed:changed,
    skipped:skipped,
    preview:preview
  }, null, 2));

  return { success:true, apply:!!applyChanges, scanned:scanned, changed:changed, skipped:skipped, preview:preview };
}

function COMPANIES_firstFillLocationsJsonFromLegacyGps_DRYRUN() {
  return COMPANIES_firstFillLocationsJsonFromLegacyGps_(false);
}

function COMPANIES_firstFillLocationsJsonFromLegacyGps_APPLY() {
  return COMPANIES_firstFillLocationsJsonFromLegacyGps_(true);
}

function COMPANIES_firstFillLocationsJsonFromLegacyGps_(applyChanges) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Companies');
  if (!sh) throw new Error('Companies sheet not found.');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { success:true, apply:!!applyChanges, scanned:0, changed:0, skipped:0, invalidGps:0, preview:[] };
  }

  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0] || [];
  var map = COMP_MIG2_getHeaderMap_(headers);

  var cCompany = COMP_MIG2_requireHeader_(map, ['Company']);
  var cLocation = COMP_MIG2_requireHeader_(map, ['Location']);
  var cGps = COMP_MIG2_requireHeader_(map, ['GPS-data', 'GPS data', 'GPS']);
  var cLocCount = COMP_MIG2_findHeader_(map, ['Locations_to_plan', 'Locations to plan']);
  var cLocationsJson = COMP_MIG2_requireHeader_(map, ['Locations_JSON', 'Locations JSON']);
  var cSlotTpl = COMP_MIG2_findHeader_(map, ['Slot_Templates', 'Slot Templates']);

  var scanned = 0;
  var changed = 0;
  var skipped = 0;
  var invalidGps = 0;
  var preview = [];
  var skippedPreview = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r] || [];
    if (COMP_MIG2_rowIsEmpty_(row)) continue;
    scanned++;

    var company = COMP_MIG2_cleanText_(row[cCompany]);
    var existingLocationsJson = COMP_MIG2_cleanText_(row[cLocationsJson]);
    if (!company) {
      skipped++;
      continue;
    }
    if (existingLocationsJson) {
      skipped++;
      continue;
    }

    var location = COMP_MIG2_cleanText_(row[cLocation]) || 'HQ';
    var rawGps = COMP_MIG2_cleanText_(row[cGps]);
    var parsedGps = COMP_MIG2_parseGpsAny_(rawGps);
    if (!parsedGps.valid) {
      invalidGps++;
      skipped++;
      if (skippedPreview.length < 25) {
        skippedPreview.push({ rowNumber:r + 1, company:company, gps:rawGps, reason:parsedGps.issue });
      }
      continue;
    }

    var gps = parsedGps.value;
    var locations = [
      { code:'HQ', name:location, gps:gps, comment:'', active:true },
      { code:'S1', name:'', gps:'', comment:'', active:false },
      { code:'S2', name:'', gps:'', comment:'', active:false },
      { code:'S3', name:'', gps:'', comment:'', active:false },
      { code:'S4', name:'', gps:'', comment:'', active:false }
    ];
    var locationsJson = JSON.stringify(locations);
    var slotTemplates = JSON.stringify({
      locations: locations.map(function(loc){
        return { code:loc.code, label:loc.name, gps:loc.gps, comment:loc.comment };
      }),
      slots: []
    });

    changed++;
    if (preview.length < 25) {
      preview.push({ rowNumber:r + 1, company:company, location:location, gps:gps });
    }

    if (applyChanges) {
      sh.getRange(r + 1, cLocationsJson + 1).setValue(locationsJson);
      if (cLocCount >= 0) sh.getRange(r + 1, cLocCount + 1).setValue('1');
      if (cSlotTpl >= 0) sh.getRange(r + 1, cSlotTpl + 1).setValue(slotTemplates);
    }
  }

  SpreadsheetApp.flush();
  Logger.log(JSON.stringify({
    task:'COMPANIES_firstFillLocationsJsonFromLegacyGps',
    apply:!!applyChanges,
    scanned:scanned,
    changed:changed,
    skipped:skipped,
    invalidGps:invalidGps,
    preview:preview,
    skippedPreview:skippedPreview
  }, null, 2));

  return {
    success:true,
    apply:!!applyChanges,
    scanned:scanned,
    changed:changed,
    skipped:skipped,
    invalidGps:invalidGps,
    preview:preview,
    skippedPreview:skippedPreview
  };
}

function COMP_MIG2_parseGpsAny_(raw) {
  var s = COMP_MIG2_cleanText_(raw);
  if (!s) return { valid:false, value:'', issue:'EMPTY_GPS' };

  var decimal = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (decimal) {
    return COMP_MIG2_validateGpsNumbers_(Number(decimal[1]), Number(decimal[2]));
  }

  var dms = s.match(/(\d+(?:\.\d+)?)\s*[°º]\s*(\d+(?:\.\d+)?)\s*['’]\s*(\d+(?:\.\d+)?)\s*(?:["”])?\s*([NS])\s+(-?\d+(?:\.\d+)?)\s*[°º]\s*(\d+(?:\.\d+)?)\s*['’]\s*(\d+(?:\.\d+)?)\s*(?:["”])?\s*([EW])/i);
  if (dms) {
    var lat = COMP_MIG2_dmsToDecimal_(Number(dms[1]), Number(dms[2]), Number(dms[3]), dms[4]);
    var lng = COMP_MIG2_dmsToDecimal_(Number(dms[5]), Number(dms[6]), Number(dms[7]), dms[8]);
    return COMP_MIG2_validateGpsNumbers_(lat, lng);
  }

  return { valid:false, value:'', issue:'INVALID_GPS_FORMAT' };
}

function COMP_MIG2_dmsToDecimal_(degrees, minutes, seconds, hemisphere) {
  var n = Math.abs(degrees) + (Math.abs(minutes) / 60) + (Math.abs(seconds) / 3600);
  var h = String(hemisphere || '').toUpperCase();
  if (h === 'S' || h === 'W') n = -n;
  return n;
}

function COMP_MIG2_validateGpsNumbers_(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return { valid:false, value:'', issue:'INVALID_GPS_NUMBER' };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { valid:false, value:'', issue:'GPS_OUT_OF_RANGE' };
  var value = String(Math.round(lat * 10000000) / 10000000) + ', ' + String(Math.round(lng * 10000000) / 10000000);
  return { valid:true, value:value, issue:'' };
}

function COMP_MIG2_resolveLocationsSource_(rawLocationsJson, rawSlotTemplates, legacyLocation, legacyGps) {
  var fromJson = COMP_MIG2_parseLocationsJson_(rawLocationsJson);
  if (fromJson.valid) {
    var normalizedJson = COMP_MIG2_normalizeLocations_(fromJson.value, legacyLocation, legacyGps);
    return {
      safe: true,
      source: 'Locations_JSON',
      reason: '',
      locations: normalizedJson
    };
  }

  var fromSlotTemplates = COMP_MIG2_parseSlotTemplates_(rawSlotTemplates);
  if (fromSlotTemplates.valid) {
    var normalizedSlot = COMP_MIG2_normalizeLocations_(fromSlotTemplates.value, legacyLocation, legacyGps);
    var hq = COMP_MIG2_findHQ_(normalizedSlot);
    if (COMP_MIG2_hasMeaningfulHq_(hq)) {
      return {
        safe: true,
        source: 'Slot_Templates',
        reason: '',
        locations: normalizedSlot
      };
    }
    return {
      safe: false,
      source: 'Slot_Templates',
      reason: 'Slot_Templates present but HQ payload is empty/generic',
      locations: []
    };
  }

  return {
    safe: false,
    source: 'None',
    reason: 'No valid Locations_JSON or trustworthy Slot_Templates found',
    locations: []
  };
}

function COMP_MIG2_parseLocationsJson_(raw) {
  var s = COMP_MIG2_cleanText_(raw);
  if (!s) return { valid:false, value:[] };
  try {
    var parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return { valid:false, value:[] };
    var hasRecognizedCode = parsed.some(function(loc){ return !!COMP_MIG2_normLocationCode_(loc && loc.code); });
    return { valid: hasRecognizedCode, value: parsed };
  } catch (e) {
    return { valid:false, value:[] };
  }
}

function COMP_MIG2_parseSlotTemplates_(raw) {
  var s = COMP_MIG2_cleanText_(raw);
  if (!s) return { valid:false, value:[] };
  try {
    var parsed = JSON.parse(s);
    var locations = parsed && Array.isArray(parsed.locations) ? parsed.locations : [];
    if (!locations.length) return { valid:false, value:[] };
    return {
      valid: true,
      value: locations.map(function(loc){
        return {
          code: loc.code,
          name: loc.name || loc.label || '',
          gps: loc.gps || '',
          comment: loc.comment || '',
          active: (String(loc.code || '').toUpperCase() === 'HQ') ? true : true
        };
      })
    };
  } catch (e) {
    return { valid:false, value:[] };
  }
}

function COMP_MIG2_normalizeLocations_(locations, fallbackLocation, fallbackGps) {
  var byCode = {};
  (Array.isArray(locations) ? locations : []).forEach(function(loc) {
    var code = COMP_MIG2_normLocationCode_(loc && loc.code);
    if (!code) return;
    byCode[code] = {
      code: code,
      name: COMP_MIG2_cleanText_(loc && (loc.name || loc.label)),
      gps: COMP_MIG2_cleanText_(loc && loc.gps),
      comment: COMP_MIG2_cleanText_(loc && loc.comment),
      active: code === 'HQ' ? true : COMP_MIG2_isActive_(loc && loc.active)
    };
  });

  if (!byCode.HQ) {
    byCode.HQ = {
      code: 'HQ',
      name: COMP_MIG2_cleanText_(fallbackLocation),
      gps: COMP_MIG2_cleanText_(fallbackGps),
      comment: '',
      active: true
    };
  } else {
    byCode.HQ.active = true;
    if (!byCode.HQ.name && fallbackLocation) byCode.HQ.name = COMP_MIG2_cleanText_(fallbackLocation);
    if (!byCode.HQ.gps && fallbackGps) byCode.HQ.gps = COMP_MIG2_cleanText_(fallbackGps);
  }

  return ['HQ','S1','S2','S3','S4'].map(function(code){
    return byCode[code] || {
      code: code,
      name: '',
      gps: '',
      comment: '',
      active: code === 'HQ'
    };
  });
}

function COMP_MIG2_findHQ_(locations) {
  var arr = Array.isArray(locations) ? locations : [];
  for (var i = 0; i < arr.length; i++) {
    if (String(arr[i].code || '') === 'HQ') return arr[i];
  }
  return null;
}

function COMP_MIG2_hasMeaningfulHq_(hq) {
  if (!hq) return false;
  var name = COMP_MIG2_cleanText_(hq.name);
  var gps = COMP_MIG2_cleanText_(hq.gps);
  if (name) return true;
  if (gps) return true;
  return false;
}

function COMP_MIG2_countActiveLocations_(locations) {
  var n = (Array.isArray(locations) ? locations : []).filter(function(x){ return !!(x && x.active); }).length;
  return n < 1 ? 1 : n;
}

function COMP_MIG2_normLocationCode_(code) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  if (c === 'HQ') return 'HQ';
  if (/^S[1-4]$/.test(c)) return c;
  if (/^SEC[-_ ]?([1-4])$/.test(c)) return 'S' + RegExp.$1;
  return '';
}

function COMP_MIG2_isActive_(v) {
  return !(v === false || String(v).toLowerCase() === 'false' || String(v).trim() === '0');
}

function COMP_MIG2_getHeaderMap_(headers) {
  var map = {};
  (headers || []).forEach(function(h, i){
    var key = COMP_MIG2_normHeader_(h);
    if (key) map[key] = i;
  });
  return map;
}

function COMP_MIG2_normHeader_(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function COMP_MIG2_findHeader_(map, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = map[COMP_MIG2_normHeader_(aliases[i])];
    if (idx === 0 || idx) return idx;
  }
  return -1;
}

function COMP_MIG2_requireHeader_(map, aliases) {
  var idx = COMP_MIG2_findHeader_(map, aliases);
  if (idx < 0) throw new Error('Missing required Companies header: ' + aliases.join(' / '));
  return idx;
}

function COMP_MIG2_rowIsEmpty_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] == null ? '' : row[i]).trim() !== '') return false;
  }
  return true;
}

function COMP_MIG2_cleanText_(v) {
  return String(v == null ? '' : v).trim();
}

function COMP_MIG2_makeUid_() {
  return Utilities.getUuid();
}
