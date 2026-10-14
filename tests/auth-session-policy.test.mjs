import assert from 'node:assert/strict';
import { boundedSessionExpiry } from '../cloudrun/transport-proof/auth-session-policy.mjs';

const now = 1800000000;
const hour = 3600;
const session = (n, ttl, expMs) => boundedSessionExpiry(n, ttl, expMs);

assert.deepEqual(session(now, 30 * 86400, (now + 2 * hour) * 1000), {
  expiresAtSeconds: now + 2 * hour,
  maxAgeSeconds: 2 * hour
});
assert.deepEqual(session(now, 30 * 86400, (now + 14 * 86400) * 1000), {
  expiresAtSeconds: now + 14 * 86400,
  maxAgeSeconds: 14 * 86400
});
assert.deepEqual(session(now, hour, (now + 14 * 86400) * 1000), {
  expiresAtSeconds: now + hour,
  maxAgeSeconds: hour
});
assert.throws(() => session(now, 30 * 86400, now * 1000), /SOURCE_SESSION_EXPIRED/);
assert.throws(() => session(now, 30 * 86400, NaN), /INVALID_SESSION_EXPIRY_INPUT/);
assert.throws(() => session(now, -1, (now + hour) * 1000), /INVALID_SESSION_EXPIRY_INPUT/);
console.log('PASS 6 bounded session expiry scenarios');
