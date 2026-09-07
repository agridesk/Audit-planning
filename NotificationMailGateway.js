// FILE: NotificationMailGateway.gs
// BUILD: 2026-05-12_NOTIFICATION_MAIL_GATEWAY_RESEND
// PURPOSE:
//   Central outbound mail transport for all notifications.
//   Replaces direct GmailApp sending with provider-based API delivery.
//
// PROVIDER:
//   RESEND via UrlFetchApp -> https://api.resend.com/emails
//
// GOVERNANCE:
//   - NotificationSender remains queue/digest owner.
//   - Weekly manager/auditor runners remain content builders.
//   - This file owns external mail transport only.
//   - Secrets are read from Script Properties, never from sheets.
//   - Fails closed when provider/API key/from identity is missing.
//
// REQUIRED SCRIPT PROPERTY:
//   RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxxxxxxx
//   Alternative accepted key name: NOTIFICATION_RESEND_API_KEY
//
// SETTINGS USED:
//   Notification_Settings / NotificationConfig:
//     DEFAULT_FROM_EMAIL = planning@agriqa.es
//     DEFAULT_FROM_NAME  = Agri Quality Assurance – Audit Planning
//     DEFAULT_REPLY_TO   = planning@agriqa.es
//     MAIL_PROVIDER      = RESEND       (optional; default RESEND)
//
// VERSION NOTE:
//   Full replacement/addition file. No GmailApp dependency.

var NMG_BUILD = '2026-05-14_NOTIFICATION_MAIL_GATEWAY_RESEND_PROD_CLEAN_R1';
var NMG_DEFAULT_PROVIDER = 'RESEND';
var NMG_DEFAULT_FROM_EMAIL = 'planning@agriqa.es';
var NMG_DEFAULT_FROM_NAME = 'Agri Quality Assurance – Audit Planning';
var NMG_RESEND_ENDPOINT = 'https://api.resend.com/emails';

function NotificationMailGateway_SendEmail(to, subject, textBody, options, context) {
  return NMG_sendEmail_(to, subject, textBody, options, context);
}

function NMG_sendEmail_(to, subject, textBody, options, context) {
  options = options || {};
  context = context || {};

  var provider = NMG_getProvider_();
  if (provider !== 'RESEND') {
    throw new Error('NotificationMailGateway: unsupported MAIL_PROVIDER=' + provider + '. Expected RESEND.');
  }

  var identity = NMG_getSenderIdentity_();
  if (!identity.fromEmail) {
    throw new Error('NotificationMailGateway: DEFAULT_FROM_EMAIL is missing.');
  }

  var recipients = NMG_normalizeRecipients_(to);
  if (!recipients.length) {
    throw new Error('NotificationMailGateway: recipient is missing.');
  }

  var apiKey = NMG_getResendApiKey_();
  if (!apiKey) {
    throw new Error('NotificationMailGateway: missing Script Property RESEND_API_KEY or NOTIFICATION_RESEND_API_KEY.');
  }

  var payload = {
    from: NMG_formatFrom_(identity.fromName, identity.fromEmail),
    to: recipients,
    subject: String(subject || '').trim(),
    text: String(textBody || '')
  };

  var html = String(options.htmlBody || '').trim();
  if (html) payload.html = html;

  var replyTo = String(options.replyTo || identity.replyTo || identity.fromEmail || '').trim();
  if (replyTo) payload.reply_to = replyTo;

  var cc = NMG_normalizeRecipients_(options.cc || '');
  if (cc.length) payload.cc = cc;

  var bcc = NMG_normalizeRecipients_(options.bcc || '');
  if (bcc.length) payload.bcc = bcc;

  var attachments = NMG_convertAttachments_(options.attachments || []);
  if (attachments.length) payload.attachments = attachments;

  return NMG_sendViaResend_(payload, context);
}

function NMG_sendViaResend_(payload, context) {
  var apiKey = NMG_getResendApiKey_();
  var res;
  try {
    res = UrlFetchApp.fetch(NMG_RESEND_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (eFetch) {
    throw new Error('NotificationMailGateway Resend fetch failed: ' + String(eFetch && eFetch.message ? eFetch.message : eFetch));
  }

  var code = Number(res.getResponseCode());
  var body = String(res.getContentText() || '');
  var parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch (eParse) { parsed = null; }

  if (code < 200 || code >= 300) {
    throw new Error('NotificationMailGateway Resend send failed HTTP ' + code + ': ' + body.slice(0, 1000));
  }

  return {
    ok: true,
    provider: 'RESEND',
    statusCode: code,
    id: parsed && parsed.id ? String(parsed.id) : '',
    to: payload.to,
    from: payload.from,
    subject: payload.subject,
    attachments: payload.attachments ? payload.attachments.length : 0,
    context: context || {}
  };
}

function NMG_getProvider_() {
  var raw = NMG_getSetting_('MAIL_PROVIDER', '') || NMG_getSetting_('NOTIFICATION_MAIL_PROVIDER', '') || NMG_DEFAULT_PROVIDER;
  return String(raw || '').trim().toUpperCase() || NMG_DEFAULT_PROVIDER;
}

function NMG_getSenderIdentity_() {
  var settings = {};
  try {
    if (typeof NotificationConfig_GetSenderSettings === 'function') {
      settings = NotificationConfig_GetSenderSettings() || {};
    }
  } catch (e) { settings = {}; }

  var fromEmail = String(
    settings.DEFAULT_FROM_EMAIL ||
    NMG_getSetting_('DEFAULT_FROM_EMAIL', '') ||
    (typeof NotificationConfig_GetDefaultFromEmail === 'function' ? NotificationConfig_GetDefaultFromEmail() : '') ||
    NMG_DEFAULT_FROM_EMAIL ||
    ''
  ).trim();

  var fromName = String(
    settings.DEFAULT_FROM_NAME ||
    NMG_getSetting_('DEFAULT_FROM_NAME', '') ||
    (typeof NotificationConfig_GetDefaultFromName === 'function' ? NotificationConfig_GetDefaultFromName() : '') ||
    NMG_DEFAULT_FROM_NAME ||
    ''
  ).trim();

  var replyTo = String(
    settings.DEFAULT_REPLY_TO ||
    NMG_getSetting_('DEFAULT_REPLY_TO', '') ||
    fromEmail ||
    ''
  ).trim();

  return {
    provider: NMG_getProvider_(),
    fromEmail: fromEmail,
    fromName: fromName,
    replyTo: replyTo
  };
}

function NMG_getSetting_(key, fallback) {
  key = String(key || '').trim();
  if (!key) return fallback;
  try {
    if (typeof NotificationConfig_GetSetting === 'function') {
      var v = NotificationConfig_GetSetting(key, fallback);
      if (v !== null && typeof v !== 'undefined' && String(v).trim() !== '') return v;
    }
  } catch (e1) {}
  try {
    if (typeof SYS_getConfig_ === 'function') {
      var cfg = SYS_getConfig_() || {};
      if (cfg.hasOwnProperty(key) && String(cfg[key] || '').trim() !== '') return cfg[key];
    }
  } catch (e2) {}
  return fallback;
}

function NMG_getResendApiKey_() {
  var keys = ['RESEND_API_KEY', 'NOTIFICATION_RESEND_API_KEY'];
  try {
    var props = PropertiesService.getScriptProperties();
    for (var i = 0; i < keys.length; i++) {
      var v = String(props.getProperty(keys[i]) || '').trim();
      if (v) return v;
    }
  } catch (e) {}
  return '';
}

function NMG_formatFrom_(name, email) {
  email = String(email || '').trim();
  name = String(name || '').trim();
  if (!name) return email;
  return name.replace(/[<>]/g, '').trim() + ' <' + email + '>';
}

function NMG_normalizeRecipients_(value) {
  if (Array.isArray(value)) {
    return value.map(function(x) { return String(x || '').trim(); }).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map(function(x) { return String(x || '').trim(); })
    .filter(Boolean);
}

function NMG_convertAttachments_(attachments) {
  var out = [];
  attachments = attachments || [];
  for (var i = 0; i < attachments.length; i++) {
    var a = attachments[i];
    if (!a) continue;

    try {
      if (a.getBytes && a.getName) {
        out.push({
          filename: String(a.getName() || ('attachment-' + i)).trim(),
          content: Utilities.base64Encode(a.getBytes()),
          content_type: String(a.getContentType ? a.getContentType() : 'application/octet-stream')
        });
        continue;
      }
    } catch (eBlob) {}

    if (a.filename && a.content) {
      out.push({
        filename: String(a.filename || ('attachment-' + i)).trim(),
        content: String(a.content || ''),
        content_type: String(a.content_type || a.contentType || 'application/octet-stream')
      });
    }
  }
  return out;
}

function RUN_NOTIFICATIONMAILGATEWAY_DIAGNOSTICS() {
  var identity = NMG_getSenderIdentity_();
  var apiKey = NMG_getResendApiKey_();
  var out = {
    ok: true,
    build: NMG_BUILD,
    provider: NMG_getProvider_(),
    endpoint: NMG_RESEND_ENDPOINT,
    identity: identity,
    scriptProperties: {
      resendApiKeyPresent: !!apiKey,
      resendApiKeyPrefix: apiKey ? apiKey.slice(0, 5) + '…' : ''
    },
    activeEnv: (typeof SYS_getEnv_ === 'function' ? SYS_getEnv_() : ''),
    notificationMode: (typeof SYS_getResolvedNotificationMode_ === 'function' ? SYS_getResolvedNotificationMode_() : ''),
    errors: []
  };

  if (out.provider !== 'RESEND') out.errors.push('MAIL_PROVIDER must be RESEND.');
  if (!identity.fromEmail) out.errors.push('DEFAULT_FROM_EMAIL missing.');
  if (!apiKey) out.errors.push('Script Property RESEND_API_KEY missing.');

  out.ok = out.errors.length === 0;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
