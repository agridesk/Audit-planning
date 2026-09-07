/**
 * FILE: AMS01_AuditorGridCandidate.js
 * BUILD: AMS01_AUDITOR_GRID_CANDIDATE_20260907_R2
 * PURPOSE:
 *   Read-only candidates for Auditor Portal active-grid hot paths.
 *   1) One targeted Companies read, preserving canonical location semantics.
 *   2) Planning JSON summary parser with one timezone resolution per run.
 *
 * SAFETY:
 *   - No business-data writes.
 *   - No canonical endpoint replacement.
 *   - Planning JSON remains planning truth.
 */

var AMS01_AUDITOR_GRID_CANDIDATE_BUILD = 'AMS01_AUDITOR_GRID_CANDIDATE_20260907_R2';

function AMS01_AuditorCompaniesForNames_(wantedNames) {
  var t0 = Date.now();
  var wanted = {};
  (wantedNames || []).forEach(function(v){
    var k = String(v || '').trim().toLowerCase();
    if (k) wanted[k] = true;
  });

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName('Companies');
  var out = { byName:{}, source:'AMS01_TARGETED_COMPANIES_R2', perf:{ serverMs:0, rowsRead:0, rowsReturned:0 } };
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

  var hasWanted = Object.keys(wanted).length > 0;
  for (var r=1; r<values.length; r++) {
    var row = values[r] || [];
    var name = idxCompany >= 0 ? String(row[idxCompany] || '').trim() : '';
    if (!name) continue;
    var key = name.toLowerCase();
    if (hasWanted && !wanted[key]) continue;

    var legacyLocation = idxLocation >= 0 ? String(row[idxLocation] || '').trim() : '';
    var legacyGps = idxGps >= 0 ? String(row[idxGps] || '').trim() : '';
    var rawLocations = idxLocJson >= 0 ? String(row[idxLocJson] || '').trim() : '';
    var locSummary = null;
    try {
      if (typeof CompaniesIndex_parseLocationSummary_ === 'function') {
        locSummary = CompaniesIndex_parseLocationSummary_(rawLocations, legacyLocation, legacyGps);
      }
    } catch (eLoc) {}
    locSummary = locSummary || {};

    var locsN = Number(locSummary.activeLocationsCount || locSummary.locationsCount || (idxLocs >= 0 ? row[idxLocs] : 1));
    if (!(locsN > 0)) locsN = 1;

    out.byName[key] = {
      companyUid:idxUid >= 0 ? String(row[idxUid] || '').trim() : '',
      locs:locsN,
      gps:String(locSummary.hqGps || legacyGps || '').trim(),
      location:String(locSummary.hqLabel || legacyLocation || '').trim(),
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
      locationsJson:rawLocations,
      locationsSummary:locSummary
    };
  }

  out.perf.rowsReturned = Object.keys(out.byName).length;
  out.perf.serverMs = Date.now() - t0;
  return out;
}

function AMS01_extractPlannedSummaryFast_(planningJsonCell, tz) {
  var out = { plannedDates:'', plannedHours:'', plannedTooltip:'', _firstDateObj:null };
  if (!planningJsonCell) return out;

  var obj = null;
  try { obj = (typeof planningJsonCell === 'string') ? JSON.parse(planningJsonCell) : planningJsonCell; }
  catch (e) { return out; }
  if (!obj) return out;

  tz = String(tz || '').trim() || 'Europe/Amsterdam';

  function clean_(v) { return String(v == null ? '' : v).trim(); }
  function firstValue_(node, keys) {
    if (!node || typeof node !== 'object') return '';
    for (var i=0; i<keys.length; i++) {
      var k = keys[i];
      if (node[k] !== null && node[k] !== undefined && clean_(node[k]) !== '') return node[k];
    }
    return '';
  }
  function normTime_(v) {
    var s = clean_(v);
    if (!s) return '';
    var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m ? (('0' + Number(m[1])).slice(-2) + ':' + m[2]) : s;
  }
  function parseDate_(v) {
    if (v === null || v === undefined || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return new Date(v.getTime());
    var s = clean_(v);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function timeToMinutes_(v) {
    var s = normTime_(v);
    var m = s.match(/^(\d{2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  }
  function directHours_(root) {
    var keys = ['totalPlannedHours','plannedHours','hoursPlanned','totalHours','TotalPlannedHours','PlannedHours','HoursPlanned'];
    for (var i=0; i<keys.length; i++) {
      var v = root && root[keys[i]];
      if (v === null || v === undefined || v === '') continue;
      var n = Number(v);
      if (isFinite(n) && n > 0) return String(Math.round(n * 100) / 100);
      var s = clean_(v);
      if (s) return s;
    }
    return '';
  }

  var blocks = [];
  var seen = {};
  function pushBlock_(dateVal, startVal, endVal) {
    var dObj = parseDate_(dateVal);
    if (!dObj) return;
    var dateKey = Utilities.formatDate(dObj, tz, 'yyyy-MM-dd');
    var st = normTime_(startVal);
    var en = normTime_(endVal);
    var key = dateKey + '|' + st + '|' + en;
    if (seen[key]) return;
    seen[key] = true;
    blocks.push({ date:dateKey, start:st, end:en, _dateObj:dObj });
  }
  function visit_(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) { for (var i=0; i<node.length; i++) visit_(node[i]); return; }
    if (typeof node !== 'object') return;

    var dateVal = firstValue_(node, ['date','day','iso','dateIso','auditDate','plannedDate','Date','Day']);
    var startVal = firstValue_(node, ['start','from','startTime','timeFrom','Start','From','StartTime']);
    var endVal = firstValue_(node, ['end','to','endTime','timeTo','End','To','EndTime']);
    if (dateVal) pushBlock_(dateVal, startVal, endVal);

    var childKeys = ['blocks','slots','days','segments','selections','selectedDays','plannedDays','plannedDates','items','planning','Planning','Blocks','Slots','Days'];
    for (var k=0; k<childKeys.length; k++) {
      var child = node[childKeys[k]];
      if (child !== null && child !== undefined) visit_(child);
    }
  }

  visit_(obj);
  blocks.sort(function(a,b){
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
  });

  var dayMap = {}, dayKeys = [], totalMin = 0, lines = [], first = null;
  for (var i=0; i<blocks.length; i++) {
    var b = blocks[i] || {};
    if (!dayMap[b.date]) { dayMap[b.date] = true; dayKeys.push(b.date); }
    if (!first || b._dateObj < first) first = b._dateObj;
    var sm = timeToMinutes_(b.start), em = timeToMinutes_(b.end);
    if (isFinite(sm) && isFinite(em) && em > sm) totalMin += (em-sm);
    var line = b.date;
    if (b.start && b.end) line += ' ' + b.start + '-' + b.end;
    else if (b.start) line += ' ' + b.start;
    else if (b.end) line += ' ' + b.end;
    if (line) lines.push(line);
  }

  dayKeys.sort();
  if (dayKeys.length) {
    out._firstDateObj = first || parseDate_(dayKeys[0]);
    out.plannedDates = dayKeys[0] + (dayKeys.length > 1 ? ' (+' + (dayKeys.length-1) + ')' : '');
  }
  if (lines.length) out.plannedTooltip = lines.join('\n');
  out.plannedHours = totalMin > 0 ? String(Math.round((totalMin/60)*4)/4) : directHours_(obj);
  return out;
}

function AMS01_RunAuditorCompaniesCandidate() {
  var ctx = AMS01_AuditorGridFixture_('david@agriqa.es');
  if (!ctx.success) return ctx;
  var names = Object.keys(ctx.wantedCompanies);

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

  var oldNorm = normalize_(oldRes), newNorm = normalize_(newRes), diffs = [];
  names.forEach(function(k){ if (JSON.stringify(oldNorm[k] || null) !== JSON.stringify(newNorm[k] || null)) diffs.push(k); });
  var out = {
    build:AMS01_AUDITOR_GRID_CANDIDATE_BUILD,
    auditorEmail:ctx.auditorEmail,
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

function AMS01_RunPlanningSummaryCandidate() {
  var ctx = AMS01_AuditorGridFixture_('david@agriqa.es');
  if (!ctx.success) return ctx;
  var tz = '';
  try { tz = auditorV5_getTz_(); } catch (eTz) { tz = 'Europe/Amsterdam'; }

  var oldMs = 0, newMs = 0, checked = 0, diffs = [];
  for (var i=0; i<ctx.matched.length; i++) {
    var item = ctx.matched[i];
    var js = item.planningJson;
    if (!js) continue;
    checked++;
    var t0 = Date.now();
    var oldRes = auditorV5_extractPlannedSummary_(js);
    oldMs += Date.now() - t0;
    t0 = Date.now();
    var newRes = AMS01_extractPlannedSummaryFast_(js, tz);
    newMs += Date.now() - t0;

    function norm_(x) {
      x = x || {};
      return {
        plannedDates:String(x.plannedDates || ''),
        plannedHours:String(x.plannedHours || ''),
        plannedTooltip:String(x.plannedTooltip || '')
      };
    }
    if (JSON.stringify(norm_(oldRes)) !== JSON.stringify(norm_(newRes))) {
      diffs.push({ auditId:item.auditId, old:norm_(oldRes), candidate:norm_(newRes) });
    }
  }

  var out = {
    build:AMS01_AUDITOR_GRID_CANDIDATE_BUILD,
    auditorEmail:ctx.auditorEmail,
    checked:checked,
    oldMs:oldMs,
    candidateMs:newMs,
    improvementMs:oldMs-newMs,
    semanticEqual:diffs.length === 0,
    diffs:diffs.slice(0,10)
  };
  Logger.log('[AMS01_AUDITOR_PLANNING_CANDIDATE] ' + JSON.stringify(out));
  return out;
}

function AMS01_AuditorGridFixture_(auditorEmail) {
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  var ss = auditorV5_getSs_();
  var maps = auditorV5_buildAuditorMaps_();
  var auditorName = String((maps.emailToName && maps.emailToName[auditorEmail]) || '').trim().toLowerCase();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:'Missing Audit planning' };
  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function(x){ return String(x || '').trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var iAuditId = H(['Audit ID','Audit Id','AuditID','AuditId']);
  var iCompany = H(['Company','Company name','Client']);
  var iAssigned = H(['Assigned to']);
  var iPre = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
  var iStatus = H(['Status']);
  var iPlanning = H(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
  var wanted = {}, matched = [];

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
    matched.push({
      auditId:iAuditId >= 0 ? String(row[iAuditId] || '').trim() : '',
      company:c,
      status:st,
      planningJson:iPlanning >= 0 ? row[iPlanning] : ''
    });
  }

  return { success:true, auditorEmail:auditorEmail, auditorName:auditorName, wantedCompanies:wanted, matched:matched };
}
