/***********************************************************************
 * FILE: SystemWriteGuardAllowAllAcceptance.js
 * BUILD: 2026-09-22_AMS03_SYSTEM_WRITE_GUARD_ALLOW_ALL_ACCEPTANCE_R1
 * PURPOSE: Read-only acceptance for DEV_WRITE_MODE=ALLOW_ALL compatibility.
 ***********************************************************************/
var AMS03_WRITE_GUARD_ALLOW_ALL_BUILD = '2026-09-22_AMS03_SYSTEM_WRITE_GUARD_ALLOW_ALL_ACCEPTANCE_R1';

function RUN_AMS03_SYSTEM_WRITE_GUARD_ALLOW_ALL_ACCEPTANCE() {
  var out = {
    success: true,
    build: AMS03_WRITE_GUARD_ALLOW_ALL_BUILD,
    readOnly: true,
    writesPerformed: false,
    env: '',
    config: {},
    decisions: {},
    gates: {},
    errors: []
  };

  try {
    if (typeof SYS_getConfig_ !== 'function') throw new Error('Missing SYS_getConfig_');
    if (typeof SYS_getEnv_ !== 'function') throw new Error('Missing SYS_getEnv_');
    if (typeof SYS_WRITE_GUARD_DECIDE_ !== 'function') throw new Error('Missing SYS_WRITE_GUARD_DECIDE_');

    var cfg = SYS_getConfig_();
    var env = String(SYS_getEnv_() || '').trim().toUpperCase();
    var mode = String(cfg.DEV_WRITE_MODE || '').trim().toUpperCase();
    var allow = String(cfg.ALLOW_DEV_WRITES || '').trim().toUpperCase();
    var prefix = String(cfg.DEV_ALLOWED_AUDIT_PREFIX || '').trim();

    out.env = env;
    out.config = {
      ALLOW_DEV_WRITES: allow,
      DEV_WRITE_MODE: mode,
      DEV_ALLOWED_AUDIT_PREFIX: prefix
    };

    var testId = (prefix || 'AUD_TEST_') + 'AMS03_WRITE_GUARD_PROBE';
    var testDecision = SYS_WRITE_GUARD_DECIDE_('AMS03_ACCEPTANCE_TEST', testId);
    var realDecision = SYS_WRITE_GUARD_DECIDE_('AMS03_ACCEPTANCE_REAL', 'AUD_REAL_PROBE');

    out.decisions.testAudit = testDecision;
    out.decisions.realAudit = realDecision;

    out.gates.devRuntime = env === 'DEV';
    out.gates.allowDevWritesEnabled = ['TRUE','YES','1','Y'].indexOf(allow) >= 0;
    out.gates.currentModeSupported = ['BLOCK','TEST_PREFIX_ONLY','ALLOW','ALLOW_ALL'].indexOf(mode) >= 0;
    out.gates.testAuditAllowedWhenConfigured = !out.gates.allowDevWritesEnabled || mode === 'BLOCK' ? !testDecision.allowed : !!testDecision.allowed;
    out.gates.allowAllAccepted = mode !== 'ALLOW_ALL' || (!!testDecision.allowed && !!realDecision.allowed);
    out.gates.readOnly = true;

    Object.keys(out.gates).forEach(function(k) {
      if (!out.gates[k]) out.errors.push('Gate failed: ' + k);
    });
    out.success = out.errors.length === 0;
  } catch (e) {
    out.success = false;
    out.errors.push(String(e && e.message ? e.message : e));
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
