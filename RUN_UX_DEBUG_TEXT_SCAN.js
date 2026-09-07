/***********************************************************************
 * FILE: RUN_UX_DEBUG_TEXT_SCAN.gs
 * BUILD: 2026-05-14_UX_DEBUG_TEXT_SCAN_R1
 *
 * PURPOSE
 * - Scans Apps Script project source files for visible/debug UX text risks.
 * - Focuses on HTML/UI files, but also reports risky GS strings.
 * - Writes compact results to sheet: UX_Debug_Text_Scan.
 * - Does not modify source code.
 * - Does not touch lifecycle/status/availability/planning/notification queue.
 *
 * REQUIRED
 * - appsscript.json must include:
 *   https://www.googleapis.com/auth/script.projects
 * - Apps Script API must be enabled in the linked Google Cloud project.
 *
 * RUNNER
 * - RUN_UX_DEBUG_TEXT_SCAN()
 ***********************************************************************/

var UX_DEBUG_SCAN_BUILD = '2026-05-14_UX_DEBUG_TEXT_SCAN_R1';
var UX_DEBUG_SCAN_REPORT_SHEET = 'UX_Debug_Text_Scan';

function RUN_UX_DEBUG_TEXT_SCAN() {
  var result = UX_debugScanProjectSource_();
  UX_debugScanWriteReport_(result);
  Logger.log(JSON.stringify({
    ok: result.ok,
    build: result.build,
    filesScanned: result.filesScanned,
    findings: result.findings.length,
    blockers: result.summary.BLOCKER || 0,
    warnings: result.summary.WARNING || 0,
    infos: result.summary.INFO || 0,
    reportSheet: UX_DEBUG_SCAN_REPORT_SHEET,
    error: result.error || ''
  }, null, 2));
  return result;
}

function UX_debugScanProjectSource_() {
  var out = {
    ok: true,
    build: UX_DEBUG_SCAN_BUILD,
    generatedAt: new Date().toISOString(),
    scriptId: ScriptApp.getScriptId(),
    filesScanned: 0,
    findings: [],
    summary: {},
    error: ''
  };

  var content;
  try {
    content = UX_debugScanGetProjectContent_(out.scriptId);
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err);
    return out;
  }

  var files = content && content.files ? content.files : [];
  var rules = UX_debugScanRules_();

  for (var f = 0; f < files.length; f++) {
    var file = files[f] || {};
    var name = String(file.name || '').trim();
    var type = String(file.type || '').trim();
    var source = String(file.source || '');
    if (!name || !source) continue;

    var isHtml = type === 'HTML' || /\.html$/i.test(name);
    var isServer = type === 'SERVER_JS' || /\.(gs|js)$/i.test(name);
    if (!isHtml && !isServer) continue;

    out.filesScanned++;
    var lines = source.split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i] || '';
      var trimmed = line.trim();
      if (!trimmed) continue;
      if (UX_debugScanIgnoreLine_(trimmed)) continue;

      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        if (!rule.re.test(line)) continue;

        var severity = rule.severity;
        if (isServer && severity === 'BLOCKER') severity = 'WARNING';
        if (isServer && rule.uiOnly === true) continue;

        out.findings.push({
          severity: severity,
          file: name,
          type: type,
          line: i + 1,
          rule: rule.code,
          message: rule.message,
          snippet: UX_debugScanCompactSnippet_(line)
        });
        out.summary[severity] = (out.summary[severity] || 0) + 1;
      }
    }
  }

  out.findings.sort(function(a, b) {
    var rank = { BLOCKER: 1, WARNING: 2, INFO: 3 };
    return (rank[a.severity] || 9) - (rank[b.severity] || 9) ||
      String(a.file).localeCompare(String(b.file)) ||
      Number(a.line || 0) - Number(b.line || 0);
  });

  return out;
}

function UX_debugScanGetProjectContent_(scriptId) {
  var url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/content';
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  var code = Number(res.getResponseCode());
  var body = String(res.getContentText() || '');
  if (code < 200 || code >= 300) {
    throw new Error('Apps Script source read failed HTTP ' + code + ': ' + body.slice(0, 1200));
  }
  return JSON.parse(body);
}

function UX_debugScanRules_() {
  return [
    {
      code: 'VISIBLE_DEBUG_WORD',
      severity: 'BLOCKER',
      uiOnly: true,
      re: /\b(DEBUG|DIAGNOSTIC|DIAGNOSTICS|TRACE|STACK|STACKTRACE)\b/i,
      message: 'Visible technical/debug wording risk.'
    },
    {
      code: 'VISIBLE_DEV_WORD',
      severity: 'WARNING',
      uiOnly: true,
      re: /\b(DEV|TEST MODE|TEST_TO_SELF|DRY_RUN|SENT_DEV_REDIRECT)\b/i,
      message: 'Visible DEV/test wording risk; must be hidden in PROD.'
    },
    {
      code: 'CONSOLE_LOG',
      severity: 'WARNING',
      uiOnly: false,
      re: /console\.(log|warn|error|debug|trace)\s*\(/i,
      message: 'Console logging found; verify not exposed to users and remove noisy production logs.'
    },
    {
      code: 'JSON_STRINGIFY_VISIBLE',
      severity: 'WARNING',
      uiOnly: true,
      re: /JSON\.stringify\s*\(/i,
      message: 'JSON.stringify in UI source; often causes visible technical output.'
    },
    {
      code: 'RAW_ERROR_ASSIGNMENT',
      severity: 'BLOCKER',
      uiOnly: true,
      re: /\.(innerText|textContent|innerHTML)\s*=\s*(err|error|e)(\.|\s|;|$)/i,
      message: 'Raw error object/message may be shown to user.'
    },
    {
      code: 'ALERT_RAW_ERROR',
      severity: 'WARNING',
      uiOnly: true,
      re: /alert\s*\(\s*(err|error|e)(\.|\s|\)|\+)/i,
      message: 'Raw technical alert may be shown to user.'
    },
    {
      code: 'LOGGER_UI_REFERENCE',
      severity: 'INFO',
      uiOnly: true,
      re: /\bLogger\b|Execution log|Apps Script|ScriptApp|UrlFetchApp/i,
      message: 'Technical Apps Script wording in UI file; verify this is not visible in PROD.'
    },
    {
      code: 'ENV_BANNER_REFERENCE',
      severity: 'INFO',
      uiOnly: true,
      re: /envBanner|ENV_BANNER|environment banner|EnvironmentGuard|runtimeEnv|isDev|isProd/i,
      message: 'Environment banner/reference found; verify PROD renders cleanly.'
    },
    {
      code: 'PLACEHOLDER_OR_MOCK',
      severity: 'WARNING',
      uiOnly: false,
      re: /\b(MOCK|PLACEHOLDER|TODO|FIXME|REPLACE_WITH|dummy|sample)\b/i,
      message: 'Mock/placeholder wording found; verify not part of production UX.'
    }
  ];
}

function UX_debugScanIgnoreLine_(line) {
  if (/^\/\//.test(line)) return true;
  if (/^\*/.test(line)) return true;
  if (/^\/\*/.test(line)) return true;
  if (/Logger\.log\s*\(/.test(line)) return true;
  if (/var\s+.*BUILD\s*=/.test(line)) return true;
  if (/BUILD:/.test(line)) return true;
  return false;
}

function UX_debugScanCompactSnippet_(line) {
  var s = String(line || '').replace(/\s+/g, ' ').trim();
  if (s.length > 220) return s.slice(0, 217) + '...';
  return s;
}

function UX_debugScanWriteReport_(result) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(UX_DEBUG_SCAN_REPORT_SHEET);
  if (!sh) sh = ss.insertSheet(UX_DEBUG_SCAN_REPORT_SHEET);
  sh.clearContents();

  var rows = [[
    'GeneratedAt',
    'Build',
    'Severity',
    'File',
    'Type',
    'Line',
    'Rule',
    'Message',
    'Snippet'
  ]];

  var findings = result && result.findings ? result.findings : [];
  for (var i = 0; i < findings.length; i++) {
    var f = findings[i];
    rows.push([
      result.generatedAt || '',
      result.build || UX_DEBUG_SCAN_BUILD,
      f.severity || '',
      f.file || '',
      f.type || '',
      f.line || '',
      f.rule || '',
      f.message || '',
      f.snippet || ''
    ]);
  }

  if (rows.length === 1) {
    rows.push([result.generatedAt || '', result.build || UX_DEBUG_SCAN_BUILD, 'OK', '', '', '', '', 'No UX debug text findings.', '']);
  }

  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, rows[0].length);
}
