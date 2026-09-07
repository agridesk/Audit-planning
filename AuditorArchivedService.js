/** FILE: AuditorArchivedService.gs
 * BUILD: AUDITOR_ARCHIVED_SERVICE_RICHSCOPES_CACHE_20260413_0932
 *
 * PURPOSE
 * Single source of truth for Archived Auditor rows.
 *
 * RULES
 * - Source sheet: "Log realized audits"
 * - Include only rows with Status = COMPLETED
 * - Email-only matching
 * - Email source priority:
 *   1) "Auditor email" / "Auditor Email" / "Email" / "E-mail"
 *   2) "Auditor" ONLY if it already contains an email
 * - NO name mapping
 * - NO Auditors-sheet identity resolution
 *
 * IMPROVEMENTS
 * - Uses the same rich scope extraction helper as active grid
 * - Adds server-side cache for archived rows per auditor email
 */

function ArchivedV5_GetRowsForAuditorEmail(email) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return { success:true, rows:[], warning:"Missing auditor email" };

  var cacheKey = 'AUD_V5_ARCHIVED|' + email;
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.rows)) {
        parsed.cacheHit = true;
        return parsed;
      }
    }
  } catch (eCacheGet) {}

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Log realized audits");
  if (!sh) return { success:true, rows:[], warning:"Missing sheet 'Log realized audits' (archived view empty)" };

  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return { success:true, rows:[] };

  var hdr = data[0].map(function(x){ return String(x || "").trim(); });
  var H = auditorV5_headerIndex_(hdr);

  var idxAuditId        = H(["Audit ID","Audit Id","AuditID","AuditId","auditId","Audit UID","Audit_UID","AuditUID","Audit Id (V5)","Audit ID (V5)"]);
  var idxCompany        = H(["Company","Company name","Client"]);
  var idxStatus         = H(["Status"]);
  var idxAuditorEmail   = H(["Auditor email","Auditor Email","Email","E-mail"]);
  var idxAuditor        = H(["Auditor"]);
  var idxExecutedOn     = H(["Date planned","Date Planned","Planned date","Date","First planned day","Date - Planned"]);
  var idxCompletedDate  = H(["Date completed","Date Completed","Completed date","Completion date"]);
  var idxHoursPlanned   = H(["Hours planned","Planned hours","Planned Hours","Hours Planned"]);
  var idxHoursDedicated = H(["Hours dedicated","Hours Dedicated","Hours_dedicated","Dedicated hours"]);
  var idxToBePlanned    = H(["Hours to be planned","Hours To Be Planned","To be planned","To Be Planned"]);
  var idxLocation       = H(["Location","Site","Audit location"]);
  var idxGps            = H(["GPS","Gps","LatLong","Lat/Long"]);

  if (idxStatus < 0) {
    return { success:true, rows:[], warning:"Archived view: required column 'Status' missing in Log realized audits" };
  }

  var companyInfo = auditorV5_buildCompaniesLookup_();
  var rows = [];

  function looksLikeEmail_(v) {
    return String(v || "").trim().indexOf("@") > -1;
  }

  function fmtDate_(v) {
    try {
      return auditorV5_formatDateYYYYMMDD_(v) || String(v || "").trim();
    } catch (e) {
      return String(v || "").trim();
    }
  }

  function resolveArchivedEmail_(row) {
    var emailVal = idxAuditorEmail >= 0 ? String(row[idxAuditorEmail] || "").trim().toLowerCase() : "";
    if (emailVal && looksLikeEmail_(emailVal)) return emailVal;

    var auditorVal = idxAuditor >= 0 ? String(row[idxAuditor] || "").trim().toLowerCase() : "";
    if (auditorVal && looksLikeEmail_(auditorVal)) return auditorVal;

    return "";
  }

  for (var r = 1; r < data.length; r++) {
    var row = data[r];

    var statusRaw = String(idxStatus >= 0 ? row[idxStatus] : "").trim();
    var status = statusRaw.toUpperCase();
    if (status !== "COMPLETED") continue;

    var rowEmail = resolveArchivedEmail_(row);
    if (!rowEmail) continue;
    if (rowEmail !== email) continue;

    var auditId = idxAuditId >= 0 ? String(row[idxAuditId] || "").trim() : "";
    if (!auditId) auditId = "LOGROW_" + String(r + 1);

    var company = idxCompany >= 0 ? String(row[idxCompany] || "").trim() : "";
    var ci = (companyInfo.byName && companyInfo.byName[String(company).toLowerCase()]) || { locs:1, gps:"", location:"", region:"" };

    var location = idxLocation >= 0 ? String(row[idxLocation] || "").trim() : "";
    if (!location) location = String(ci.location || "").trim();
    if (String(location).toUpperCase() === "HQ") location = "";

    var gps = idxGps >= 0 ? String(row[idxGps] || "").trim() : "";
    if (!gps) gps = ci.gps || "";

    var executedOn = idxExecutedOn >= 0 ? fmtDate_(row[idxExecutedOn]) : "";
    var completedDate = idxCompletedDate >= 0 ? fmtDate_(row[idxCompletedDate]) : "";
    var toBePlanned = idxToBePlanned >= 0 ? String(row[idxToBePlanned] || "").trim() : "";
    var plannedHours = idxHoursPlanned >= 0 ? String(row[idxHoursPlanned] || "").trim() : "";
    var hoursDedicated = idxHoursDedicated >= 0 ? String(row[idxHoursDedicated] || "").trim() : "";

    var scopesPack = auditorV5_extractScopesForRow_(hdr, row);
    var scopes = scopesPack && scopesPack.scopes ? scopesPack.scopes : [];
    var scopesText = scopesPack && scopesPack.scopesText ? scopesPack.scopesText : "";

    rows.push({
      auditId: auditId,
      company: company,
      locs: ci.locs || 1,
      location: location,
      gps: gps,
      scopes: scopes,
      scopesText: scopesText,
      executedOn: executedOn,
      plannedDates: executedOn,
      toBePlanned: toBePlanned,
      plannedHours: plannedHours,
      hoursDedicated: hoursDedicated,
      completedDate: completedDate,
      selfPlanning: "",
      status: status,
      readOnly: true,
      companyLocation: String(ci.location || "").trim(),
      companyRegion: String(ci.region || "").trim(),
      planningWindow: "",
      allowSelfPlanning: "",
      totalAuditDays: "",
      plannedTooltip: ""
    });
  }

  var out = { success:true, rows: rows };
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(out), 300);
  } catch (eCachePut) {}
  return out;
}

function ArchivedV5_DiagForAuditorEmail(email) {
  email = String(email || "").trim().toLowerCase();
  var res = ArchivedV5_GetRowsForAuditorEmail(email);
  var rows = (res && res.rows && Array.isArray(res.rows)) ? res.rows : [];
  var out = {
    success: true,
    email: email,
    cacheHit: !!(res && res.cacheHit),
    archivedCount: rows.length,
    preview: rows.slice(0, 10).map(function(r, i){
      return {
        n: i + 1,
        auditId: r.auditId || "",
        company: r.company || "",
        scopesText: r.scopesText || "",
        executedOn: r.executedOn || "",
        completedDate: r.completedDate || "",
        plannedHours: r.plannedHours || "",
        hoursDedicated: r.hoursDedicated || ""
      };
    })
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ArchivedV5_DiagForRombouts() {
  return ArchivedV5_DiagForAuditorEmail("romboutsrwj@gmail.com");
}
