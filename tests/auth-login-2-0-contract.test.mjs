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

const cases = [
  ['Auditor defaults to Grid 2.0', () => assert.match(login, /return r === "Auditor" \? "auditorgrid2" : "manager"/)],
  ['OTP submit remains six digits', () => assert.match(login, /\^\\d\{6\}\$/)],
  ['OTP verification is bound to code request email', () => assert.match(login, /email !== __requestedEmail/)],
  ['Stale send callbacks are ignored', () => assert.equal((login.match(/requestId !== __sendRequestId/g) || []).length, 3)],
  ['Duplicate OTP sends prevented', () => assert.match(login, /if \(__sendInFlight\) return/)],
  ['OTP device validated before code consumed', () => {
    const fn = auth.slice(auth.indexOf('function verifyLoginCode('), auth.indexOf('function validateTrustedToken('));
    assert.ok(fn.indexOf('MISSING_DEVICE_ID') < fn.indexOf('verifyOtp_('));
  }],
  ['Redirect debug UI does not display token-bearing target', () => assert.match(login, /if \(targetDbg\) targetDbg\.textContent = ""/)],
  ['Backend DEV bypass has runtime guard', () => assert.match(entry, /if \(!V5_ENTRY_isDevEnv_\(\)\) return false/)],
  ['Existing bootstrap validates with canonical service', () => assert.match(bootstrap, /V5_ENTRY_resolve\(ctx\)/)],
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
