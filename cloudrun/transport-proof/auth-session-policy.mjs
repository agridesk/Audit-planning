// Authentication 2.0 — canonical session-expiry policy.
// New module is deliberately inert until the Cloud Run entrypoint imports it.
export function boundedSessionExpiry(nowSeconds, configuredTtlSeconds, legacyTokenExpiryMs) {
  const now = Number(nowSeconds);
  const configured = Number(configuredTtlSeconds);
  const source = Number(legacyTokenExpiryMs);
  if (!Number.isFinite(now) || !Number.isFinite(configured) || !Number.isFinite(source) || configured <= 0) {
    throw new Error('INVALID_SESSION_EXPIRY_INPUT');
  }
  const sourceExpirySeconds = Math.floor(source / 1000);
  const expirySeconds = Math.min(now + configured, sourceExpirySeconds);
  if (!Number.isSafeInteger(expirySeconds) || expirySeconds <= now) {
    throw new Error('SOURCE_SESSION_EXPIRED');
  }
  return { expiresAtSeconds: expirySeconds, maxAgeSeconds: expirySeconds - now };
}
