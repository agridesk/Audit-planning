import { timingSafeEqual } from 'node:crypto';

const str = value => String(value ?? '').trim();
const roleKey = value => str(value).toUpperCase();
const safeEqual = (left, right) => {
  const a = Buffer.from(str(left));
  const b = Buffer.from(str(right));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

export function createConceptReservationBridge20({
  enabled = false,
  runtimeEnv = '',
  serviceName = '',
  bridgeKey = '',
  resolveIdentity,
  store
} = {}) {
  const active = enabled === true && runtimeEnv === 'DEV' &&
    serviceName === 'ams-fase12-dev' && str(bridgeKey).length >= 32 &&
    typeof resolveIdentity === 'function' && store;

  async function handle({ method, path, headers = {}, body = {} } = {}) {
    if (!active) return { status: 404, payload: { success: false, error: 'NOT_FOUND' } };
    if (method !== 'POST' || path !== '/api/v1/internal/concept-reservations') {
      return { status: 404, payload: { success: false, error: 'NOT_FOUND' } };
    }
    if (!safeEqual(headers['x-ams-bridge-key'], bridgeKey)) {
      return { status: 403, payload: { success: false, error: 'BRIDGE_FORBIDDEN' } };
    }
    const actorEmail = str(body.actorEmail).toLowerCase();
    const requestedRole = roleKey(body.actorRole);
    if (!actorEmail || !['MANAGER', 'AUDITOR'].includes(requestedRole)) {
      return { status: 400, payload: { success: false, error: 'ACTOR_REQUIRED' } };
    }
    let actor;
    try {
      actor = await resolveIdentity(actorEmail, requestedRole);
    } catch {
      return { status: 403, payload: { success: false, error: 'ACTOR_FORBIDDEN' } };
    }
    const actorRole = roleKey(actor?.role);
    const actorUid = str(actor?.auditorUid);
    if (actor?.active !== true || actorRole !== requestedRole || !actorUid) {
      return { status: 403, payload: { success: false, error: 'ACTOR_FORBIDDEN' } };
    }
    try {
      if (body.action === 'read') {
        const auditorUids = Array.isArray(body.auditorUids) ? body.auditorUids : [];
        if (actorRole === 'AUDITOR' &&
            (auditorUids.length !== 1 || str(auditorUids[0]) !== actorUid)) {
          return { status: 403, payload: { success: false, error: 'RESERVATION_READ_FORBIDDEN' } };
        }
        return {
          status: 200,
          payload: {
            success: true,
            rows: await store.list({ from: body.from, to: body.to, auditorUids }),
            meta: { readOnly: true, writes: false, identityKey: 'Auditor_UID' }
          }
        };
      }
      if (body.action === 'upsert') {
        const input = {
          ...(body.reservation || {}),
          actorUid,
          actorRole
        };
        if (actorRole === 'AUDITOR' && str(input.auditorUid) !== actorUid) {
          return { status: 403, payload: { success: false, error: 'RESERVATION_OWNER_MISMATCH' } };
        }
        return { status: 200, payload: await store.upsert(input) };
      }
      if (body.action === 'upsertBatch') {
        const items = Array.isArray(body.items) ? body.items : [];
        if (actorRole === 'AUDITOR' &&
            items.some(item => str(item?.auditorUid) !== actorUid)) {
          return { status: 403, payload: { success: false, error: 'RESERVATION_OWNER_MISMATCH' } };
        }
        return {
          status: 200,
          payload: await store.upsertBatch({
            items: items.map(item => ({ ...item, actorUid, actorRole }))
          })
        };
      }
      if (body.action === 'release') {
        return {
          status: 200,
          payload: await store.release({
            auditId: body.auditId,
            actorUid,
            actorRole,
            reason: body.reason
          })
        };
      }
      return { status: 400, payload: { success: false, error: 'ACTION_INVALID' } };
    } catch (error) {
      const message = str(error?.message);
      if (/^(CONCEPT_RESERVATION_(?:READ_INPUT_INVALID|BATCH_INVALID|AUDIT_ID_INVALID|REVISION_REQUIRED|BLOCKS_INVALID|BLOCK_INVALID|ROLE_INVALID|UID_REQUIRED|OWNER_MISMATCH))$/.test(message)) {
        return { status: 400, payload: { success: false, error: message } };
      }
      return { status: 409, payload: { success: false, error: 'RESERVATION_COMMAND_FAILED' } };
    }
  }

  return Object.freeze({ handle });
}
