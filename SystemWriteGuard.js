// FILE: SystemWriteGuard.gs
// BUILD: 2026-04-28_SYSTEM_WRITE_GUARD_FAIL_CLOSED
// PURPOSE:
//   Central fail-closed DEV/PROD write guard for all business write entrypoints.
//   Additive file. Does not perform writes itself.
//
// GOVERNANCE:
//   - PROD allows writes.
//   - DEV blocks by default.
//   - DEV can allow writes only when System_Config explicitly permits it.
//   - Missing System_Config or missing config helpers => FAIL CLOSED.
//   - TEST_PREFIX_ONLY requires auditId to start with DEV_ALLOWED_AUDIT_PREFIX.
//
// MANUAL TEST FUNCTIONS:
//   - SYS_WRITE_GUARD_TEST_BLOCK
//   - SYS_WRITE_GUARD_TEST_TEST_PREFIX
//   - SYS_WRITE_GUARD_DIAGNOSTICS

var SYS_WRITE_GUARD_BUILD = '2026-04-28_SYSTEM_WRITE_GUARD_FAIL_CLOSED';

function SYS_ENFORCE_WRITE_ALLOWED(actionName, auditId) {
  var decision = SYS_WRITE_GUARD_DECIDE_(actionName, auditId);

  if (!decision.allowed) {
    throw new Error(decision.message || 'Write blocked by SystemWriteGuard');
  }

  return decision;
}

function SYS_REQUIRE_WRITE_ALLOWED(actionName, auditId) {
  return SYS_ENFORCE_WRITE_ALLOWED(actionName, auditId);
}

function SYS_IS_WRITE_ALLOWED(actionName, auditId) {
  try {
    SYS_ENFORCE_WRITE_ALLOWED(actionName, auditId);
    return true;
  } catch (e) {
    return false;
  }
}

function SYS_WRITE_GUARD_RESULT(actionName, auditId) {
  var decision = SYS_WRITE_GUARD_DECIDE_(actionName, auditId);

  if (decision.allowed) {
    return {
      success: true,
      ok: true,
      allowed: true,
      env: decision.env,
      action: decision.action,
      auditId: decision.auditId,
      mode: decision.mode,
      build: SYS_WRITE_GUARD_BUILD
    };
  }

  return {
    success: false,
    ok: false,
    allowed: false,
    code: decision.code || 'WRITE_BLOCKED',
    message: decision.message || 'Write blocked by SystemWriteGuard',
    env: decision.env,
    action: decision.action,
    auditId: decision.auditId,
    mode: decision.mode,
    build: SYS_WRITE_GUARD_BUILD
  };
}

function SYS_WRITE_GUARD_DECIDE_(actionName, auditId) {
  var action = String(actionName || 'WRITE').trim().toUpperCase();
  var id = String(auditId || '').trim();

  var unavailable = SYS_WRITE_GUARD_CONFIG_UNAVAILABLE_(action, id);
  if (unavailable) return unavailable;

  var cfg = SYS_getConfig_();
  var env = String(SYS_getEnv_() || '').trim().toUpperCase();

  if (env === 'PROD') {
    return {
      allowed: true,
      env: env,
      action: action,
      auditId: id,
      mode: 'PROD',
      message: 'PROD write allowed.'
    };
  }

  if (env !== 'DEV') {
    return {
      allowed: false,
      env: env || 'UNKNOWN',
      action: action,
      auditId: id,
      mode: 'UNKNOWN',
      code: 'INVALID_ENV',
      message: 'Write blocked: ENV must be DEV or PROD.'
    };
  }

  var allowDevWrites = SYS_WRITE_GUARD_BOOL_(cfg.ALLOW_DEV_WRITES);
  var mode = String(cfg.DEV_WRITE_MODE || 'BLOCK').trim().toUpperCase();
  var prefix = String(cfg.DEV_ALLOWED_AUDIT_PREFIX || 'TEST_').trim();

  if (!allowDevWrites) {
    return {
      allowed: false,
      env: env,
      action: action,
      auditId: id,
      mode: mode || 'BLOCK',
      code: 'DEV_WRITE_BLOCKED',
      message: 'DEV write blocked: ALLOW_DEV_WRITES is not TRUE.'
    };
  }

  if (!mode || mode === 'BLOCK') {
    return {
      allowed: false,
      env: env,
      action: action,
      auditId: id,
      mode: 'BLOCK',
      code: 'DEV_WRITE_BLOCKED',
      message: 'DEV write blocked: DEV_WRITE_MODE = BLOCK.'
    };
  }

  if (mode === 'TEST_PREFIX_ONLY') {
    if (!id) {
      return {
        allowed: false,
        env: env,
        action: action,
        auditId: id,
        mode: mode,
        code: 'DEV_WRITE_BLOCKED',
        message: 'DEV write blocked: missing auditId for TEST_PREFIX_ONLY.'
      };
    }

    if (prefix && id.indexOf(prefix) !== 0) {
      return {
        allowed: false,
        env: env,
        action: action,
        auditId: id,
        mode: mode,
        code: 'DEV_WRITE_BLOCKED',
        message: 'DEV write blocked: auditId must start with ' + prefix + '.'
      };
    }

    return {
      allowed: true,
      env: env,
      action: action,
      auditId: id,
      mode: mode,
      message: 'DEV write allowed for test-prefix audit.'
    };
  }

  if (mode === 'ALLOW') {
    return {
      allowed: true,
      env: env,
      action: action,
      auditId: id,
      mode: mode,
      message: 'DEV write allowed because DEV_WRITE_MODE = ALLOW.'
    };
  }

  return {
    allowed: false,
    env: env,
    action: action,
    auditId: id,
    mode: mode,
    code: 'DEV_WRITE_BLOCKED',
    message: 'DEV write blocked: unsupported DEV_WRITE_MODE = ' + mode + '.'
  };
}

function SYS_WRITE_GUARD_CONFIG_UNAVAILABLE_(action, auditId) {
  var missing = [];

  if (typeof SYS_getConfig_ !== 'function') missing.push('SYS_getConfig_');
  if (typeof SYS_getEnv_ !== 'function') missing.push('SYS_getEnv_');

  if (!missing.length) return null;

  return {
    allowed: false,
    env: 'UNKNOWN',
    action: String(action || 'WRITE').trim().toUpperCase(),
    auditId: String(auditId || '').trim(),
    mode: 'FAIL_CLOSED',
    code: 'SYSTEM_CONFIG_UNAVAILABLE',
    message: 'Write blocked: System_Config helpers unavailable: ' + missing.join(', ')
  };
}

function SYS_WRITE_GUARD_BOOL_(value) {
  var s = String(value || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function SYS_WRITE_GUARD_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: SYS_WRITE_GUARD_BUILD,
    generatedAt: new Date().toISOString(),
    configAvailable: false,
    env: 'UNKNOWN',
    cfg: {},
    decisions: {},
    warnings: [],
    errors: []
  };

  try {
    out.configAvailable = (typeof SYS_getConfig_ === 'function' && typeof SYS_getEnv_ === 'function');

    if (!out.configAvailable) {
      out.ok = false;
      out.errors.push('System_Config helpers unavailable. Guard will fail closed.');
    } else {
      var cfg = SYS_getConfig_();
      out.env = String(SYS_getEnv_() || '').trim().toUpperCase();
      out.cfg = {
        ENV: String(cfg.ENV || ''),
        ALLOW_DEV_WRITES: String(cfg.ALLOW_DEV_WRITES || ''),
        DEV_WRITE_MODE: String(cfg.DEV_WRITE_MODE || ''),
        DEV_ALLOWED_AUDIT_PREFIX: String(cfg.DEV_ALLOWED_AUDIT_PREFIX || '')
      };
    }

    out.decisions.realAudit = SYS_WRITE_GUARD_DECIDE_('DIAG_REAL_AUDIT', 'AUD_REAL_SAMPLE');
    out.decisions.testAudit = SYS_WRITE_GUARD_DECIDE_('DIAG_TEST_AUDIT', 'TEST_SAMPLE');

    if (out.env === 'DEV' && out.decisions.realAudit.allowed) {
      out.warnings.push('Real audit writes are allowed in DEV. Use only intentionally.');
    }

    if (out.env === 'DEV' && !out.decisions.testAudit.allowed) {
      out.warnings.push('TEST_ audit writes are blocked in DEV. This is safe but limits testing.');
    }

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.message ? e.message : e));
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}

function SYS_WRITE_GUARD_TEST_BLOCK() {
  var result = SYS_WRITE_GUARD_RESULT('TEST_BLOCK', 'AUD_REAL_SAMPLE');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function SYS_WRITE_GUARD_TEST_TEST_PREFIX() {
  var result = SYS_WRITE_GUARD_RESULT('TEST_PREFIX', 'TEST_SAMPLE');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
