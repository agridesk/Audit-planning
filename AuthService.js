// =====================================================
// V5_AUTH_MVP.gs — Identification & Trusted Mail (MVP)
// BUILD: V5_AUTH_MVP_R4_FAIL_LOUD_MAIL_DELIVERY_20260527
//
// Fix scope:
// - OTP no longer uses CacheService as source of truth.
// - OTP stored in sheet Auth_Login_Codes with expiry, used/revoked state.
// - Input code is normalized by stripping all non-digits before verification.
// - Resend throttle prevents accidental overwriting / multiple-code confusion.
// - Last 2 active OTPs are accepted until expiry to prevent delayed-mail races.
// - Login code mail is more branded and less bare/spam-like.
// - LoginV5 endpoints are integrated in this file; separate V5_AUTH_Endpoints.gs can be removed after deploy.
// - Mail gateway result is validated fail-loud; OTP is usable only after accepted send result.
// - Auth_Login_Codes stores mail status/result for diagnostics and prevents stale throttling.
//
// Existing contracts preserved:
// - Public API: V5_AUTH.requestLoginCode(email)
// - Public API: V5_AUTH.verifyLoginCode(email, code, role, remember, deviceId, deviceInfo)
// - Token sheet: Auditor_Tokens with Device_Fingerprint aliases.
// =====================================================

var V5_AUTH = (function () {
  var CFG = {
    SHEET_AUDITORS: "Auditors",
    SHEET_TOKENS: "Auditor_Tokens",
    SHEET_LOGIN_CODES: "Auth_Login_Codes",
    OTP_TTL_SECONDS: 10 * 60,
    OTP_RESEND_THROTTLE_SECONDS: 45,
    OTP_MAX_ACTIVE_CODES: 2,
    TRUST_DAYS: 14,
    SESSION_HOURS: 2,
    APP_NAME: "Agri Quality Assurance – Audit Management System"
  };

  // ---------------- SSOT RESOLVER (WebApp-safe) ----------------
  // Script property: V5_SSOT_SPREADSHEET_ID
  // In WebApp context, SpreadsheetApp.getActive() is NOT reliable.
  function V5_AUTH_getSs_() {
    var id = "";
    try {
      id = String(PropertiesService.getScriptProperties().getProperty("V5_SSOT_SPREADSHEET_ID") || "").trim();
    } catch (e) {}
    if (id) return SpreadsheetApp.openById(id);

    // Editor-only fallback
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;

    throw new Error("SSOT spreadsheet not configured. Set Script Property V5_SSOT_SPREADSHEET_ID");
  }

  // ---------------- PUBLIC API ----------------

  function requestLoginCode(email) {
    email = normEmail_(email);

    var user = findUserByEmail_(email);
    if (!user) return { ok: false, error: "UNKNOWN_EMAIL" };

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var now = new Date();
      var throttle = getRecentActiveOtpForThrottle_(email, user.role, now);
      if (throttle && throttle.remainingSeconds > 0) {
        return {
          ok: true,
          role: user.role,
          throttled: true,
          reusedExisting: true,
          retryAfterSeconds: throttle.remainingSeconds,
          mailStatus: "ACCEPTED_RECENT",
          message: "A login code was already sent recently. Use the latest email or wait before requesting a new code."
        };
      }

      var otp = random6Digits_();
      var pending = storeOtp_(email, user.role, otp, now, "PENDING", "");

      try {
        var mailResult = sendLoginCodeMail_(email, otp);
        var delivery = normalizeMailGatewayResult_(mailResult);
        if (!delivery.ok) {
          markOtpMailFailed_(pending.rowNumber, delivery);
          return {
            ok: false,
            role: user.role,
            error: "LOGIN_CODE_MAIL_NOT_ACCEPTED",
            mailStatus: delivery.status,
            mailError: delivery.error || "Mail gateway did not confirm acceptance"
          };
        }

        markOtpMailAccepted_(pending.rowNumber, delivery);
        pruneOldOtpsForEmailRole_(email, user.role, now);

        return {
          ok: true,
          role: user.role,
          throttled: false,
          mailStatus: delivery.status,
          mailProviderId: delivery.providerId || ""
        };
      } catch (mailErr) {
        var deliveryErr = normalizeMailGatewayException_(mailErr);
        markOtpMailFailed_(pending.rowNumber, deliveryErr);
        return {
          ok: false,
          role: user.role,
          error: "LOGIN_CODE_MAIL_SEND_FAILED",
          mailStatus: deliveryErr.status,
          mailError: deliveryErr.error
        };
      }
    } finally {
      try { lock.releaseLock(); } catch (e2) {}
    }
  }

  function sendLoginCodeMail_(email, otp) {
    var ttlMinutes = Math.floor(CFG.OTP_TTL_SECONDS / 60);
    var subject = "Agri Quality Assurance secure login code";
    var textBody = [
      "Agri Quality Assurance - Audit Management System",
      "Secure portal access",
      "",
      "Your login code is: " + otp,
      "",
      "This code is valid for " + ttlMinutes + " minutes.",
      "If you requested more than one code, use the most recent email.",
      "",
      "This is an automated security email for access to the Agri Quality Assurance Audit Management System.",
      "If you did not request this code, you can ignore this email.",
      "",
      "Agri Quality Assurance"
    ].join("\n");

    var htmlBody = [
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Secure login code for the Agri Quality Assurance Audit Management System.</div>',
      '<div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">',
      '  <div style="max-width:560px;margin:0 auto;padding:24px;">',
      '    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">',
      '      <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">',
      '        <div style="font-size:17px;font-weight:700;line-height:1.25;">Agri Quality Assurance</div>',
      '        <div style="font-size:13px;color:#cbd5e1;margin-top:3px;">Audit Management System</div>',
      '      </div>',
      '      <div style="padding:22px;">',
      '        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;">Use the following verification code to sign in:</p>',
      '        <div style="font-size:32px;font-weight:800;letter-spacing:7px;margin:18px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;text-align:center;color:#0f172a;">' + htmlEscape_(otp) + '</div>',
      '        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;">This code is valid for <strong>' + ttlMinutes + ' minutes</strong>.</p>',
      '        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#64748b;">If you requested more than one code, use the most recent email. Older codes may stop working after newer requests.</p>',
      '        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#64748b;">This is an automated security email for access to the Agri Quality Assurance Audit Management System.</p>',
      '        <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">If you did not request this code, you can ignore this email.</p>',
      '      </div>',
      '    </div>',
      '    <div style="font-size:11px;color:#6b7280;text-align:center;margin-top:12px;">Agri Quality Assurance · Secure portal access</div>',
      '  </div>',
      '</div>'
    ].join("");

    if (typeof NotificationMailGateway_SendEmail !== "function") {
      throw new Error("NotificationMailGateway_SendEmail is missing; login code mail cannot be sent.");
    }

    return NotificationMailGateway_SendEmail(
      String(email),
      subject,
      textBody,
      { htmlBody: htmlBody },
      { type: "LOGIN_CODE", email: String(email) }
    );
  }

  function normalizeMailGatewayResult_(res) {
    var raw = safeJson_(res);

    // Some legacy gateways return nothing after a successful send.
    // Accepting undefined preserves compatibility, but logged diagnostics will show LEGACY_NO_RESPONSE.
    if (typeof res === "undefined" || res === null) {
      return { ok: true, status: "ACCEPTED_LEGACY_NO_RESPONSE", providerId: "", raw: raw };
    }

    if (res === true) return { ok: true, status: "ACCEPTED_TRUE", providerId: "", raw: raw };
    if (res === false) return { ok: false, status: "REJECTED_FALSE", error: "Gateway returned false", raw: raw };

    if (typeof res === "string") {
      var trimmed = String(res || "").trim();
      if (trimmed) return { ok: true, status: "ACCEPTED_STRING", providerId: trimmed, raw: raw };
      return { ok: false, status: "REJECTED_EMPTY_STRING", error: "Gateway returned empty string", raw: raw };
    }

    if (typeof res === "object") {
      var statusCode = Number(res.status || res.statusCode || res.code || 0);
      var hasError = !!(res.error || res.errors || res.message && String(res.message).toLowerCase().indexOf("error") >= 0);

      if (res.ok === false || res.success === false || res.accepted === false || statusCode >= 400 || hasError) {
        return {
          ok: false,
          status: "REJECTED_GATEWAY_RESPONSE",
          error: String(res.error || res.errors || res.message || ("HTTP/status " + statusCode) || "Gateway rejected email"),
          raw: raw
        };
      }

      if (res.ok === true || res.success === true || res.accepted === true || res.id || res.messageId || res.emailId || (statusCode >= 200 && statusCode < 300)) {
        return {
          ok: true,
          status: "ACCEPTED_GATEWAY_RESPONSE",
          providerId: String(res.id || res.messageId || res.emailId || ""),
          raw: raw
        };
      }

      // Unknown object means the gateway responded, but not with a contract we can trust.
      return {
        ok: false,
        status: "REJECTED_UNRECOGNIZED_GATEWAY_RESPONSE",
        error: "Mail gateway returned an unrecognized response contract",
        raw: raw
      };
    }

    return { ok: false, status: "REJECTED_UNKNOWN_GATEWAY_RESPONSE", error: "Unknown mail gateway response", raw: raw };
  }

  function normalizeMailGatewayException_(err) {
    return {
      ok: false,
      status: "SEND_EXCEPTION",
      error: err && err.message ? String(err.message) : String(err || "Unknown mail send exception"),
      raw: safeJson_(err)
    };
  }


  function verifyLoginCode(email, code, role, remember, deviceId, deviceInfo) {
    email = normEmail_(email);
    role = normRole_(role);
    code = normOtpCode_(code);

    var user = findUserByEmail_(email);
    if (!user || user.role !== role) return { ok: false, error: "ROLE_OR_EMAIL_INVALID" };
    if (!code || !/^\d{6}$/.test(code)) return { ok: false, error: "INVALID_CODE_FORMAT" };

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var otpResult = verifyOtp_(email, role, code);
      if (!otpResult.ok) return { ok: false, error: otpResult.error || "INVALID_OR_EXPIRED_CODE" };
      markOtpUsedAndRevokeSiblings_(email, role, otpResult.rowNumber);
    } finally {
      try { lock.releaseLock(); } catch (eLock) {}
    }

    deviceId = String(deviceId || "").trim();
    if (!deviceId) return { ok: false, error: "MISSING_DEVICE_ID" };

    var now = new Date();
    var rawToken = generateToken_();
    var tokenHash = sha256Hex_(rawToken);
    var deviceHash = sha256Hex_(deviceId);

    var tokenType, expiresAt;
    if (remember === true) {
      tokenType = "TRUSTED_14D";
      expiresAt = new Date(now.getTime() + CFG.TRUST_DAYS * 24 * 60 * 60 * 1000);
    } else {
      tokenType = "SESSION_2H";
      expiresAt = new Date(now.getTime() + CFG.SESSION_HOURS * 60 * 60 * 1000);
    }

    revokePreviousForDevice_(email, role, deviceHash);
    appendTokenRow_(email, role, tokenHash, tokenType, deviceHash, String(deviceInfo || ""), now, expiresAt);

    return {
      ok: true,
      role: role,
      trusted: (remember === true),
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      tokenType: tokenType
    };
  }

  function validateTrustedToken(email, role, rawToken, deviceId) {
    email = normEmail_(email);
    role = normRole_(role);

    rawToken = String(rawToken || "").trim();
    deviceId = String(deviceId || "").trim();
    if (!rawToken) return { ok: false, error: "NO_TOKEN" };
    if (!deviceId) return { ok: false, error: "MISSING_DEVICE_ID" };

    var tokenHash = sha256Hex_(rawToken);
    var deviceHash = sha256Hex_(deviceId);

    var sh = V5_AUTH_getSs_().getSheetByName(CFG.SHEET_TOKENS);
    if (!sh) return { ok: false, error: "TOKENS_SHEET_MISSING" };

    var values = sh.getDataRange().getValues();
    if (values.length < 2) return { ok: false, error: "TOKEN_NOT_FOUND" };

    var idx = TOKENS__idxValues_(values[0]);
    var now = new Date();

    for (var r = 1; r < values.length; r++) {
      var row = values[r];

      if (
        normEmail_(row[idx.Email]) === email &&
        normRole_(row[idx.Role]) === role &&
        String(row[idx.Token_Hash] || "") === tokenHash
      ) {
        if (isRevoked_(row[idx.Revoked])) return { ok: false, error: "TOKEN_REVOKED" };

        var exp = new Date(row[idx.Expires_At]);
        if (isNaN(exp.getTime()) || exp < now) return { ok: false, error: "TOKEN_EXPIRED" };

        var storedDeviceHash = String(row[idx.Device_Fingerprint] || "");
        if (storedDeviceHash && storedDeviceHash !== deviceHash) return { ok: false, error: "DEVICE_MISMATCH" };

        var colMap = TOKENS__getHeaderIndexMap_(sh);
        var lastUsedCol1 = TOKENS__requireHeader_(colMap, ["Last_Used_At"]) + 1;
        sh.getRange(r + 1, lastUsedCol1).setValue(now);

        return { ok: true };
      }
    }

    return { ok: false, error: "TOKEN_NOT_FOUND" };
  }

  // ---------------- INTERNALS: USERS ----------------

  function findUserByEmail_(email) {
    var sh = V5_AUTH_getSs_().getSheetByName(CFG.SHEET_AUDITORS);
    if (!sh) throw new Error("Missing sheet: " + CFG.SHEET_AUDITORS);

    var values = sh.getDataRange().getValues();
    if (values.length < 2) return null;

    var header = values[0];
    var emailCol = findHeader_(header, ["Email", "E-mail"]);
    var roleCol = findHeader_(header, ["Role"]);
    var activeCol = findHeader_(header, ["Active"]);

    if (emailCol === -1 || roleCol === -1) {
      throw new Error("Auditors sheet missing Email/Role headers.");
    }

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (normEmail_(row[emailCol]) === email) {
        var active = (activeCol === -1) ? "YES" : String(row[activeCol] || "").toUpperCase();
        if (activeCol !== -1 && active !== "YES") return null;
        return { email: email, role: normRole_(row[roleCol]) };
      }
    }
    return null;
  }

  // ---------------- INTERNALS: OTP SHEET ----------------

  function OTP__headers_() {
    return [
      "Email",
      "Role",
      "Code_Hash",
      "Created_At",
      "Expires_At",
      "Used_At",
      "Revoked",
      "Send_Count",
      "Last_Sent_At",
      "Request_Id",
      "Mail_Status",
      "Mail_Result_JSON",
      "Mail_Error",
      "Mail_Accepted_At",
      "Mail_Provider_Id"
    ];
  }

  function OTP__getSheet_() {
    var ss = V5_AUTH_getSs_();
    var sh = ss.getSheetByName(CFG.SHEET_LOGIN_CODES);
    if (!sh) {
      sh = ss.insertSheet(CFG.SHEET_LOGIN_CODES);
      sh.getRange(1, 1, 1, OTP__headers_().length).setValues([OTP__headers_()]);
      try { sh.setFrozenRows(1); } catch (e) {}
    }
    if (sh.getLastRow() < 1) {
      sh.getRange(1, 1, 1, OTP__headers_().length).setValues([OTP__headers_()]);
      try { sh.setFrozenRows(1); } catch (e2) {}
    }
    OTP__ensureHeaders_(sh);
    return sh;
  }

  function OTP__ensureHeaders_(sh) {
    var required = OTP__headers_();
    var lastCol = Math.max(1, sh.getLastColumn());
    var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var map = {};
    for (var i = 0; i < header.length; i++) {
      var key = String(header[i] || "").trim();
      if (key) map[key] = i;
    }
    var changed = false;
    for (var j = 0; j < required.length; j++) {
      if (!(required[j] in map)) {
        header.push(required[j]);
        changed = true;
      }
    }
    if (changed) sh.getRange(1, 1, 1, header.length).setValues([header]);
  }

  function OTP__idxValues_(headerRow) {
    var map = {};
    for (var i = 0; i < headerRow.length; i++) {
      var key = String(headerRow[i] || "").trim();
      if (key) map[key] = i;
    }
    function must(name) {
      if (name in map) return map[name];
      throw new Error("Auth_Login_Codes missing required header: " + name);
    }
    function opt(name) {
      return (name in map) ? map[name] : -1;
    }
    return {
      Email: must("Email"),
      Role: must("Role"),
      Code_Hash: must("Code_Hash"),
      Created_At: must("Created_At"),
      Expires_At: must("Expires_At"),
      Used_At: must("Used_At"),
      Revoked: must("Revoked"),
      Send_Count: must("Send_Count"),
      Last_Sent_At: must("Last_Sent_At"),
      Request_Id: must("Request_Id"),
      Mail_Status: opt("Mail_Status"),
      Mail_Result_JSON: opt("Mail_Result_JSON"),
      Mail_Error: opt("Mail_Error"),
      Mail_Accepted_At: opt("Mail_Accepted_At"),
      Mail_Provider_Id: opt("Mail_Provider_Id")
    };
  }

  function otpHash_(email, role, otp) {
    return sha256Hex_(normEmail_(email) + "|" + normRole_(role) + "|" + normOtpCode_(otp));
  }

  function storeOtp_(email, role, otp, now, mailStatus, mailResultJson) {
    var sh = OTP__getSheet_();
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var idx = OTP__idxValues_(header);
    var row = new Array(sh.getLastColumn()).fill("");
    var createdAt = now || new Date();
    var expiresAt = new Date(createdAt.getTime() + CFG.OTP_TTL_SECONDS * 1000);

    row[idx.Email] = normEmail_(email);
    row[idx.Role] = normRole_(role);
    row[idx.Code_Hash] = otpHash_(email, role, otp);
    row[idx.Created_At] = createdAt;
    row[idx.Expires_At] = expiresAt;
    row[idx.Used_At] = "";
    row[idx.Revoked] = false;
    row[idx.Send_Count] = 1;
    row[idx.Last_Sent_At] = createdAt;
    row[idx.Request_Id] = Utilities.getUuid();
    if (idx.Mail_Status >= 0) row[idx.Mail_Status] = mailStatus || "PENDING";
    if (idx.Mail_Result_JSON >= 0) row[idx.Mail_Result_JSON] = mailResultJson || "";
    if (idx.Mail_Error >= 0) row[idx.Mail_Error] = "";
    if (idx.Mail_Accepted_At >= 0) row[idx.Mail_Accepted_At] = "";
    if (idx.Mail_Provider_Id >= 0) row[idx.Mail_Provider_Id] = "";

    sh.appendRow(row);
    return { rowNumber: sh.getLastRow() };
  }

  function markOtpMailAccepted_(rowNumber, delivery) {
    updateOtpMailState_(rowNumber, "ACCEPTED", delivery || {});
  }

  function markOtpMailFailed_(rowNumber, delivery) {
    updateOtpMailState_(rowNumber, "SEND_FAILED", delivery || {});
    try {
      var sh = OTP__getSheet_();
      var idx = OTP__idxValues_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
      if (idx.Revoked >= 0) sh.getRange(rowNumber, idx.Revoked + 1).setValue(true);
    } catch (e) {}
  }

  function updateOtpMailState_(rowNumber, status, delivery) {
    var sh = OTP__getSheet_();
    var idx = OTP__idxValues_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
    if (idx.Mail_Status >= 0) sh.getRange(rowNumber, idx.Mail_Status + 1).setValue(status);
    if (idx.Mail_Result_JSON >= 0) sh.getRange(rowNumber, idx.Mail_Result_JSON + 1).setValue(String(delivery.raw || safeJson_(delivery)).substring(0, 45000));
    if (idx.Mail_Error >= 0) sh.getRange(rowNumber, idx.Mail_Error + 1).setValue(String(delivery.error || "").substring(0, 5000));
    if (idx.Mail_Accepted_At >= 0 && status === "ACCEPTED") sh.getRange(rowNumber, idx.Mail_Accepted_At + 1).setValue(new Date());
    if (idx.Mail_Provider_Id >= 0) sh.getRange(rowNumber, idx.Mail_Provider_Id + 1).setValue(String(delivery.providerId || ""));
  }


  function getRecentActiveOtpForThrottle_(email, role, now) {
    var sh = OTP__getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return null;

    var idx = OTP__idxValues_(values[0]);
    var latestLastSent = null;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (normEmail_(row[idx.Email]) !== email) continue;
      if (normRole_(row[idx.Role]) !== role) continue;
      if (isRevoked_(row[idx.Revoked])) continue;
      if (row[idx.Used_At]) continue;
      if (idx.Mail_Status >= 0) {
        var mailStatus = String(row[idx.Mail_Status] || "").trim();
        if (mailStatus !== "ACCEPTED") continue;
      }

      var exp = new Date(row[idx.Expires_At]);
      if (isNaN(exp.getTime()) || exp < now) continue;

      var lastSent = new Date(row[idx.Last_Sent_At] || row[idx.Created_At]);
      if (isNaN(lastSent.getTime())) continue;
      if (!latestLastSent || lastSent > latestLastSent) latestLastSent = lastSent;
    }

    if (!latestLastSent) return null;
    var elapsedSeconds = Math.floor((now.getTime() - latestLastSent.getTime()) / 1000);
    var remaining = CFG.OTP_RESEND_THROTTLE_SECONDS - elapsedSeconds;
    return remaining > 0 ? { remainingSeconds: remaining } : null;
  }

  function pruneOldOtpsForEmailRole_(email, role, now) {
    var sh = OTP__getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return;

    var idx = OTP__idxValues_(values[0]);
    var active = [];
    var revokedCol1 = idx.Revoked + 1;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (normEmail_(row[idx.Email]) !== email) continue;
      if (normRole_(row[idx.Role]) !== role) continue;
      if (isRevoked_(row[idx.Revoked])) continue;
      if (row[idx.Used_At]) continue;
      if (idx.Mail_Status >= 0) {
        var mailStatus = String(row[idx.Mail_Status] || "").trim();
        if (mailStatus !== "ACCEPTED") continue;
      }

      var exp = new Date(row[idx.Expires_At]);
      if (isNaN(exp.getTime()) || exp < now) {
        sh.getRange(r + 1, revokedCol1).setValue(true);
        continue;
      }

      var createdAt = new Date(row[idx.Created_At]);
      active.push({ rowNumber: r + 1, createdAt: isNaN(createdAt.getTime()) ? new Date(0) : createdAt });
    }

    active.sort(function (a, b) { return b.createdAt.getTime() - a.createdAt.getTime(); });
    for (var i = CFG.OTP_MAX_ACTIVE_CODES; i < active.length; i++) {
      sh.getRange(active[i].rowNumber, revokedCol1).setValue(true);
    }
  }

  function verifyOtp_(email, role, otp) {
    var sh = OTP__getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return { ok: false, error: "INVALID_OR_EXPIRED_CODE" };

    var idx = OTP__idxValues_(values[0]);
    var now = new Date();
    var targetHash = otpHash_(email, role, otp);
    var sawExpired = false;
    var sawEmailRole = false;

    for (var r = values.length - 1; r >= 1; r--) {
      var row = values[r];
      if (normEmail_(row[idx.Email]) !== email) continue;
      if (normRole_(row[idx.Role]) !== role) continue;
      sawEmailRole = true;
      if (isRevoked_(row[idx.Revoked])) continue;
      if (row[idx.Used_At]) continue;
      if (idx.Mail_Status >= 0) {
        var mailStatus = String(row[idx.Mail_Status] || "").trim();
        if (mailStatus !== "ACCEPTED") continue;
      }

      var exp = new Date(row[idx.Expires_At]);
      if (isNaN(exp.getTime()) || exp < now) {
        sawExpired = true;
        continue;
      }

      if (String(row[idx.Code_Hash] || "") === targetHash) {
        return { ok: true, rowNumber: r + 1 };
      }
    }

    if (sawEmailRole && sawExpired) return { ok: false, error: "INVALID_OR_EXPIRED_CODE" };
    return { ok: false, error: "INVALID_OR_EXPIRED_CODE" };
  }

  function markOtpUsedAndRevokeSiblings_(email, role, usedRowNumber) {
    var sh = OTP__getSheet_();
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return;

    var idx = OTP__idxValues_(values[0]);
    var now = new Date();
    var usedAtCol1 = idx.Used_At + 1;
    var revokedCol1 = idx.Revoked + 1;

    for (var r = 1; r < values.length; r++) {
      var rowNumber = r + 1;
      var row = values[r];
      if (normEmail_(row[idx.Email]) !== email) continue;
      if (normRole_(row[idx.Role]) !== role) continue;
      if (rowNumber === usedRowNumber) {
        sh.getRange(rowNumber, usedAtCol1).setValue(now);
        sh.getRange(rowNumber, revokedCol1).setValue(true);
      } else if (!row[idx.Used_At] && !isRevoked_(row[idx.Revoked])) {
        sh.getRange(rowNumber, revokedCol1).setValue(true);
      }
    }
  }

  // ---------------- INTERNALS: TOKENS ----------------

  function revokePreviousForDevice_(email, role, deviceHash) {
    var sh = V5_AUTH_getSs_().getSheetByName(CFG.SHEET_TOKENS);
    if (!sh) throw new Error("Missing sheet: " + CFG.SHEET_TOKENS);

    var values = sh.getDataRange().getValues();
    if (values.length < 2) return;

    var idx = TOKENS__idxValues_(values[0]);
    var colMap = TOKENS__getHeaderIndexMap_(sh);

    var revokedCol1 = TOKENS__requireHeader_(colMap, ["Revoked"]) + 1;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (
        normEmail_(row[idx.Email]) === email &&
        normRole_(row[idx.Role]) === role &&
        String(row[idx.Device_Fingerprint] || "") === deviceHash &&
        !isRevoked_(row[idx.Revoked])
      ) {
        sh.getRange(r + 1, revokedCol1).setValue(true);
      }
    }
  }

  function appendTokenRow_(email, role, tokenHash, tokenType, deviceHash, deviceInfo, createdAt, expiresAt) {
    var sh = V5_AUTH_getSs_().getSheetByName(CFG.SHEET_TOKENS);
    if (!sh) throw new Error("Missing sheet: " + CFG.SHEET_TOKENS);
    if (sh.getLastRow() < 1) throw new Error("Auditor_Tokens has no header row.");

    var colMap = TOKENS__getHeaderIndexMap_(sh);

    // Validate required headers (with aliases where needed)
    var cEmail = TOKENS__requireHeader_(colMap, ["Email"]);
    var cRole = TOKENS__requireHeader_(colMap, ["Role"]);
    var cTokenHash = TOKENS__requireHeader_(colMap, ["Token_Hash"]);
    var cTokenType = TOKENS__requireHeader_(colMap, ["Token_Type"]);
    var cDeviceFp = TOKENS__requireHeader_(colMap, ["Device_Fingerprint", "Device_Fingerprin", "Device_Fingerprint_Hash"]);
    var cDeviceInfo = TOKENS__requireHeader_(colMap, ["Device_Info"]);
    var cCreated = TOKENS__requireHeader_(colMap, ["Created_At"]);
    var cExpires = TOKENS__requireHeader_(colMap, ["Expires_At"]);
    var cLastUsed = TOKENS__requireHeader_(colMap, ["Last_Used_At"]);
    var cRevoked = TOKENS__requireHeader_(colMap, ["Revoked"]);

    var row = new Array(sh.getLastColumn()).fill("");

    row[cEmail] = email;
    row[cRole] = role;
    row[cTokenHash] = tokenHash;
    row[cTokenType] = tokenType;
    row[cDeviceFp] = deviceHash;
    row[cDeviceInfo] = deviceInfo;

    row[cCreated] = createdAt;
    row[cExpires] = expiresAt;
    row[cLastUsed] = createdAt;

    row[cRevoked] = false;

    sh.appendRow(row);
  }

  // ---- Token sheet helpers (header-based, alias-aware) ----

  function TOKENS__getHeaderIndexMap_(sh) {
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    for (var i = 0; i < header.length; i++) {
      var key = String(header[i] || "").trim();
      if (key) map[key] = i;
    }
    return map;
  }

  function TOKENS__requireHeader_(map, names) {
    for (var i = 0; i < names.length; i++) {
      if (names[i] in map) return map[names[i]];
    }
    throw new Error("Auditor_Tokens missing required header: " + names[0]);
  }

  function TOKENS__idxValues_(headerRow) {
    var map = {};
    for (var i = 0; i < headerRow.length; i++) {
      var key = String(headerRow[i] || "").trim();
      if (key) map[key] = i;
    }
    function mustAny(names) {
      for (var j = 0; j < names.length; j++) {
        if (names[j] in map) return map[names[j]];
      }
      throw new Error("Auditor_Tokens missing required header: " + names[0]);
    }
    return {
      Email: mustAny(["Email"]),
      Role: mustAny(["Role"]),
      Token_Hash: mustAny(["Token_Hash"]),
      Token_Type: mustAny(["Token_Type"]),
      Device_Fingerprint: mustAny(["Device_Fingerprint", "Device_Fingerprin", "Device_Fingerprint_Hash"]),
      Device_Info: mustAny(["Device_Info"]),
      Created_At: mustAny(["Created_At"]),
      Expires_At: mustAny(["Expires_At"]),
      Last_Used_At: mustAny(["Last_Used_At"]),
      Revoked: mustAny(["Revoked"])
    };
  }

  // ---------------- INTERNALS: GENERIC ----------------

  function random6Digits_() {
    var n = Math.floor(Math.random() * 1000000);
    var s = String(n);
    while (s.length < 6) s = "0" + s;
    return s;
  }

  function generateToken_() {
    var t = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    return t.substring(0, 64);
  }

  function sha256Hex_(s) {
    var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s || ""), Utilities.Charset.UTF_8);
    return raw.map(function (b) {
      var v = (b < 0 ? b + 256 : b);
      var h = v.toString(16);
      return (h.length === 1 ? "0" + h : h);
    }).join("");
  }

  function normEmail_(v) {
    return String(v || "").trim().toLowerCase();
  }

  function normOtpCode_(v) {
    return String(v || "").replace(/\D/g, "").trim();
  }

  function normRole_(v) {
    var s = String(v || "").trim().toLowerCase();
    if (s === "auditor") return "Auditor";
    if (s === "manager") return "Manager";
    return String(v || "").trim();
  }

  function htmlEscape_(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }


  function safeJson_(v) {
    try {
      return JSON.stringify(v == null ? null : v);
    } catch (e) {
      try { return String(v); } catch (e2) { return ""; }
    }
  }

  function findHeader_(header, candidates) {
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i] || "").trim();
      for (var j = 0; j < candidates.length; j++) {
        if (h === candidates[j]) return i;
      }
    }
    return -1;
  }

  function isRevoked_(v) {
    if (v === true) return true;
    var s = String(v || "").trim().toUpperCase();
    return (s === "YES" || s === "TRUE");
  }

  function validateTrustedTokenByRole(rawToken, role, deviceId) {
    role = normRole_(role);
    rawToken = String(rawToken || "").trim();
    deviceId = String(deviceId || "").trim();
    if (!rawToken) return { ok: false, error: "NO_TOKEN" };
    if (!deviceId) return { ok: false, error: "MISSING_DEVICE_ID" };
    if (!role) return { ok: false, error: "MISSING_ROLE" };

    var tokenHash = sha256Hex_(rawToken);
    var deviceHash = sha256Hex_(deviceId);

    var sh = V5_AUTH_getSs_().getSheetByName(CFG.SHEET_TOKENS);
    if (!sh) return { ok: false, error: "TOKENS_SHEET_MISSING" };

    var values = sh.getDataRange().getValues();
    if (values.length < 2) return { ok: false, error: "TOKEN_NOT_FOUND" };

    var idx = TOKENS__idxValues_(values[0]);
    var now = new Date();

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (
        normRole_(row[idx.Role]) === role &&
        String(row[idx.Token_Hash] || "") === tokenHash
      ) {
        if (isRevoked_(row[idx.Revoked])) return { ok: false, error: "TOKEN_REVOKED" };

        var exp = new Date(row[idx.Expires_At]);
        if (isNaN(exp.getTime()) || exp < now) return { ok: false, error: "TOKEN_EXPIRED" };

        var storedDeviceHash = String(row[idx.Device_Fingerprint] || "");
        if (storedDeviceHash && storedDeviceHash !== deviceHash) return { ok: false, error: "DEVICE_MISMATCH" };

        var canonicalEmail = normEmail_(row[idx.Email]);
        if (!canonicalEmail) return { ok: false, error: "TOKEN_EMAIL_EMPTY" };

        var colMap = TOKENS__getHeaderIndexMap_(sh);
        var lastUsedCol1 = TOKENS__requireHeader_(colMap, ["Last_Used_At"]) + 1;
        sh.getRange(r + 1, lastUsedCol1).setValue(now);

        return {
          ok: true,
          email: canonicalEmail,
          role: role
        };
      }
    }

    return { ok: false, error: "TOKEN_NOT_FOUND" };
  }

  return {
    requestLoginCode: requestLoginCode,
    verifyLoginCode: verifyLoginCode,
    validateTrustedToken: validateTrustedToken,
    validateTrustedTokenByRole: validateTrustedTokenByRole
  };
})();

// Global wrapper for UI calls.
// Source of truth for current app identity = token + device + role.
function V5_AUTH_RESOLVE_IDENTITY(role, token, deviceId) {
  return V5_AUTH.validateTrustedTokenByRole(token, role, deviceId);
}


// =====================================================
// V5_AUTH_Endpoints.gs — integrated endpoints for LoginV5.html
// BUILD: V5_AUTH_ENDPOINTS_INTEGRATED_R3_20260526
//
// After this file is deployed, the separate V5_AUTH_Endpoints.gs file
// can be removed to avoid duplicate endpoint ownership.
// =====================================================

function V5_requestLoginCode(email) {
  return V5_AUTH.requestLoginCode(email);
}

function V5_verifyLoginCode(email, code, role, remember, deviceId, deviceInfo) {
  return V5_AUTH.verifyLoginCode(email, code, role, remember, deviceId, deviceInfo);
}

function V5_ping() {
  return {
    ok: true,
    serverTimeISO: new Date().toISOString(),
    execUrl: ScriptApp.getService().getUrl(),
    build: "V5_AUTH_MVP_R4_FAIL_LOUD_MAIL_DELIVERY_20260527"
  };
}

function RUN_V5_AUTH_OTP_STORE_DIAG() {
  var ss = (function () {
    var id = "";
    try { id = String(PropertiesService.getScriptProperties().getProperty("V5_SSOT_SPREADSHEET_ID") || "").trim(); } catch (e) {}
    if (id) return SpreadsheetApp.openById(id);
    return SpreadsheetApp.getActiveSpreadsheet();
  })();
  var sh = ss.getSheetByName("Auth_Login_Codes");
  return {
    ok: true,
    sheetExists: !!sh,
    sheetName: "Auth_Login_Codes",
    rows: sh ? sh.getLastRow() : 0,
    columns: sh ? sh.getLastColumn() : 0,
    build: "V5_AUTH_MVP_R4_FAIL_LOUD_MAIL_DELIVERY_20260527"
  };
}
