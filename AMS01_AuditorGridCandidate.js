/**
 * FILE: AMS01_AuditorGridCandidate.js
 * BUILD: AMS01_AUDITOR_GRID_CANDIDATE_20260907_R1
 * PURPOSE:
 *   Read-only candidate for Auditor Portal active grid.
 *   Preserves the current grid contract while replacing the cold Companies
 *   overflow-index route with one targeted Companies sheet read.
 *
 * SAFETY:
 *   - No business-data writes.
 *   - No canonical endpoint replacement.
 *   - Planning JSON remains planning truth.
 */

var AMS01_AUDITOR_GRID_CANDIDATE_BUILD = 'AMS01_AUDITOR_GRID_CANDIDATE_20260907_R1';

function AMS01_AuditorCompaniesForNames_(wantedNames) {
  var t0 = Date.now();
  var wanted = {};
  (wantedNames || []).forEach(function(v){
    var k = String(v || '').trim().toLowerCase();
    if (k) wanted[k] = true;
  });
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName('Companies');
  var out = { byName:{}, source:'AMS01_TARGETED_COMPANIES', perf:{ serverMs:0, rowsRead:0, rowsReturned:0 } };
  if (!sh) return out;

  var values = sh.getDataRange().getValues();
  out.perf.rowsRead = Math.max(0, values.length - 1);
  if (!values.length) { out.perf.serverMs = Date.now() - t0; return out; }
  var hdr = values[0].map(function(x){ return String(x || '').trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxCompany = H(['Company','Company name','Name']);
  var idxUid = H(['Company_UID','Company UID','CompanyUID']);
  var idxLocation = H(['Location','LOCATION']);
  var idxRegion = H(['Region','REGION']);
  var idxCountry = H(['Country']);
  var idxLocs = H(['Locations_to_plan','Locations to plan','Locs']);
  var idxGps = H(['GPS-data','GPS','GPS HQ','HQ GPS','LatLong','Latitude/Longitude','GPS location','GPS Location']);
  var idxContact = H(['Contactperson','Contact person','Contact','Contactpersoon naam','Contact name']);
  var idxEmail = H(['Contactperson e-mail','Contactperson email','Contact e-mail','Contact email','Contactpersoon email']);
  var idxPhone = H(['Contactperson phone','Contact phone','Phone','Contactpersoon telefoon']);
  var idxComments = H(['Comments','Comment']);
  var idxTz = H(['Time zone','Timezone']);
  var idxLang = H(['Language communication',' Language communication']);
  var idxNwd = H(['Audit planning limitations - days','Audit planning limitations days','Non working days','Non-working days','Planning limitations - days']);
  var idxHours = H(['Audit planning limitations - hours','Audit planning limitations hours','Hours working','Working hours','Planning limitations - hours']);
  var idxLocJson = H(['Locations_JSON','Locations JSON','LocationsJSON']);

  for (var r=1; r<values.length; r++) {
    var row = values[r] || [];
    var name = idxCompany >= 0 ? String(row[idxCompany] || '').trim() : '';
    if (!name) continue;
    var key = name.toLowerCase();
    if (Object.keys(wanted).length && !wanted[key]) continue;
    var locsN = idxLocs >= 0 ? Number(row[idxLocs]) : 1;
    if (!(locsN > 0)) locsN = 1;
    out.byName[key] = {
      companyUid:idxUid >= 0 ? String(row[idxUid] || '').trim() : '',
      locs:locsN,
      gps:idxGps >= 0 ? String(row[idxGps] || '').trim() : '',
      location:idxLocation >= 0 ? String(row[idxLocation] || '').trim() : '',
      region:idxRegion >= 0 ? String(row[idxRegion] || '').trim() : '',
      country:idxCountry >= 0 ? String(row[idxCountry] || '').trim() : '',
      contactName:idxContact >= 0 ? String(row[idxContact] || '').trim() : '',
      contactEmail:idxEmail >= 0 ? String(row[idxEmail] || '').trim() : '',
      contactPhone:idxPhone >= 0 ? String(row[idxPhone] || '').trim() : '',
      comments:idxComments >= 0 ? String(row[idxComments] || '').trim() : '',
      timeZone:idxTz >= 0 ? String(row[idxTz] || '').trim() : '',
      languageCommunication:idxLang >= 0 ? String(row[idxLang] || '').trim() : '',
      nonWorkingDays:idxNwd >= 0 ? String(row[idxNwd] || '').trim() : '',
      hoursWorking:idxHours >= 0 ? String(row[idxHours] || '').trim() : '',
      locationsJson:idxLocJson >= 0 ? String(row[idxLocJson] || '').trim() : ''
    };
  }
  out.perf.rowsReturned = Object.keys(out.byName).length;
  out.perf.serverMs = Date.now() - t0;
  return out;
}

function AMS01_RunAuditorCompaniesCandidate() {
  var auditorEmail = 'david@agriqa.es';
  var ss = auditorV5_getSs_();
  var maps = auditorV5_buildAuditorMaps_();
  var auditorName = String((maps.emailToName && maps.emailToName[auditorEmail]) || '').trim().toLowerCase();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:'Missing Audit planning' };
  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function(x){ return String(x || '').trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var iCompany = H(['Company','Company name','Client']);
  var iAssigned = H(['Assigned to']);
  var iPre = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
  var iStatus = H(['Status']);
  var wanted = {};
  for (var r=1; r<data.length; r++) {
    var row = data[r] || [];
    var assigned = iAssigned >= 0 ? String(row[iAssigned] || '').trim().toLowerCase() : '';
    var pre = iPre >= 0 ? String(row[iPre] || '').trim().toLowerCase() : '';
    var match = (assigned === auditorEmail || assigned === auditorName || (!assigned && (pre === auditorEmail || pre === auditorName)));
    if (!match) continue;
    var st = iStatus >= 0 ? String(row[iStatus] || '').trim().toUpperCase().replace(/\s+/g,'_') : '';
    if (['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].indexOf(st) < 0) continue;
    var c = iCompany >= 0 ? String(row[iCompany] || '').trim() : '';
    if (c) wanted[c.toLowerCase()] = true;
  }

  var names = Object.keys(wanted);
  var tOld = Date.now();
  var oldRes = auditorV5_buildCompaniesLookupForNames_(names);
  var oldMs = Date.now() - tOld;
  var tNew = Date.now();
  var newRes = AMS01_AuditorCompaniesForNames_(names);
  var newMs = Date.now() - tNew;

  function normalize_(pack) {
    var src = (pack && pack.byName) || {};
    var out = {};
    Object.keys(src).sort().forEach(function(k){
      var c = src[k] || {};
      out[k] = {
        companyUid:String(c.companyUid || '').trim(),
        locs:Number(c.locs || c.locationsCount || 1) || 1,
        gps:String(c.gps || c.gpsData || '').trim(),
        location:String(c.location || '').trim(),
        region:String(c.region || '').trim(),
        country:String(c.country || '').trim(),
        contactName:String(c.contactName || '').trim(),
        contactEmail:String(c.contactEmail || '').trim(),
        contactPhone:String(c.contactPhone || '').trim(),
        comments:String(c.comments || '').trim(),
        timeZone:String(c.timeZone || '').trim(),
        languageCommunication:String(c.languageCommunication || '').trim(),
        nonWorkingDays:String(c.nonWorkingDays || '').trim(),
        hoursWorking:String(c.hoursWorking || '').trim()
      };
    });
    return out;
  }

  var oldNorm = normalize_(oldRes);
  var newNorm = normalize_(newRes);
  var diffs = [];
  names.forEach(function(k){
    if (JSON.stringify(oldNorm[k] || null) !== JSON.stringify(newNorm[k] || null)) diffs.push(k);
  });
  var out = {
    build:AMS01_AUDITOR_GRID_CANDIDATE_BUILD,
    auditorEmail:auditorEmail,
    wantedCompanies:names.length,
    oldMs:oldMs,
    candidateMs:newMs,
    improvementMs:oldMs-newMs,
    semanticEqual:diffs.length === 0,
    diffCompanies:diffs.slice(0,20),
    oldSource:oldRes && oldRes.source,
    candidatePerf:newRes && newRes.perf
  };
  Logger.log('[AMS01_AUDITOR_COMPANIES_CANDIDATE] ' + JSON.stringify(out));
  return out;
}
