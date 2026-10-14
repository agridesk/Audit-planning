// Authentication 2.0 isolated source-contract regression checks.
// Run from repository root: node tests/auth-login-2-0-contract.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const login = fs.readFileSync(path.join(root, 'LoginV5.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'AuthService.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'EntryV5.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'EntryBootstrapV5.html'), 'utf8');
const cloudRun = fs.readFileSync(path.join(root, 'cloudrun/transport-proof/server-r4.js'), 'utf8');

const cases = [
  ['Auditor defaults to Grid 2.0', () => assert.match(login, /return r === "Auditor" \? "auditorgrid2" : "manager"/)],
  ['OTP submit remains six digits', () => assert.ok(login.includes('if (!/^\\d{6}$/.test(code))'))],
  ['OTP verification is bound to code request email', () => assert.match(login, /email !== __requestedEmail/)],
  ['Stale send callbacks are ignored', () => assert.equal((login.match(/requestId !== __sendRequestId/g) || []).length, 3)],
  ['Duplicate OTP sends prevented', () => assert.match(login, /if \(__sendInFlight\) return/)],
  ['OTP device validated before code consumed', () => {
    const fn = auth.slice(auth.indexOf('function verifyLoginCode('), auth.indexOf('function validateTrustedToken('));
    assert.ok(fn.indexOf('MISSING_DEVICE_ID') < fn.indexOf('verifyOtp_('));
  }],
  ['Redirect debug UI does not display token-bearing target', () => assert.match(login, /if \(targetDbg\) targetDbg\.textContent = ""/)],
  ['Backend DEV bypass has runtime guard', () => assert.match(entry, /if \(!V5_ENTRY_isDevEnv_\(\)\) return false/)],
  ['DEV Manager normal tokens use canonical validation', () => {
    assert.doesNotMatch(entry, /runtimeEnv === 'DEV' && action === 'manager' && expectedRole === 'Manager' && !V5_ENTRY_isTestBypass_/);
    assert.match(entry, /V5_AUTH\.validateTrustedTokenByRole\(token, expectedRole, device\)/);
  }],
  ['Existing bootstrap validates with canonical service', () => assert.match(bootstrap, /V5_ENTRY_resolve\(ctx\)/)],
  ['Cloud Run already uses secure session cookie', () => {
    assert.match(cloudRun, /HttpOnly; Secure; SameSite=Lax/);
    assert.match(cloudRun, /\/api\/v1\/session\/exchange/);
  }],
  ['Cloud Run does not exceed legacy token expiry (migration gate)', () => {
    assert.match(cloudRun, /legacyTokenExpiresAt/);
    assert.match(cloudRun, /boundedSessionExpiry\(now,SESSION_TTL_SECONDS,identity\.legacyTokenExpiresAt\)/);
    assert.match(cloudRun, /legacyTokenExpiresAt:exp/);
    assert.match(cloudRun, /session\.exp-Math\.floor\(Date\.now\(\)\/1000\)/);
  }],
  ['Incomplete OTP session response fails closed', () => {
    assert.match(login, /if \(!res\.token \|\| !res\.expiresAt \|\| !res\.tokenType/);
    assert.match(login, /String\(res\.role \|\| ""\) !== role/);
    assert.match(login, /Date\.parse\(String\(res\.expiresAt\)\) <= Date\.now\(\)/);
    assert.doesNotMatch(login, /if \(res\.token\) localStorage\.setItem\(KEY_TOKEN/);
  }],
  ['Hashed token and OTP truth is preserved', () => {
    assert.match(auth, /tokenHash = sha256Hex_\(rawToken\)/);
    assert.match(auth, /row\[idx\.Code_Hash\]/);
  }],
];
let failures = 0;
for (const [label, test] of cases) {
  try { test(); process.stdout.write('PASS ' + label + '\n'); }
  catch (err) { failures++; process.stderr.write('FAIL ' + label + ': ' + err.message + '\n'); }
}
process.stdout.write((cases.length - failures) + '/' + cases.length + ' checks passed\n');
if (failures) process.exitCode = 1;
