import { createHash } from 'node:crypto';

const DEV_PROJECT = 'audit-management-system-dev';
const RESERVATION_COLLECTION = 'ams_concept_reservations_20_dev';
const OUTBOX_COLLECTION = 'ams_concept_reservation_outbox_20_dev';
const enc = encodeURIComponent;
const str = value => String(value ?? '').trim();
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 180 && !/[\/\\\u0000-\u001f]/.test(value) &&
  value !== '.' && value !== '..';
const validUid = value => validId(value) && !value.includes('@');
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(value))) return false;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

function assertStoredReservation(value, expectedAuditId) {
  if (!value || value.schemaVersion !== 1 || value.auditId !== expectedAuditId ||
      !validUid(value.auditorUid) || !Number.isSafeInteger(value.version) || value.version < 1 ||
      !['ACTIVE', 'RELEASED'].includes(value.state)) {
    throw Error('CONCEPT_RESERVATION_DOCUMENT_CORRUPT');
  }
}

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number' && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)])
    ) } };
  }
  throw Error('CONCEPT_RESERVATION_VALUE_INVALID');
}

function decode(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  }
  throw Error('CONCEPT_RESERVATION_VALUE_UNSUPPORTED');
}

function docId(auditId) {
  if (!validId(auditId)) throw Error('CONCEPT_RESERVATION_AUDIT_ID_INVALID');
  return 'r_' + digest(auditId);
}

function validateBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 50) {
    throw Error('CONCEPT_RESERVATION_BLOCKS_INVALID');
  }
  return blocks.map(block => {
    const date = str(block?.date);
    const start = str(block?.start || block?.startTime);
    const end = str(block?.end || block?.endTime);
    const hours = Number(block?.hours);
    if (!validDate(date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
        start >= end || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw Error('CONCEPT_RESERVATION_BLOCK_INVALID');
    }
    return { date, start, end, hours };
  });
}

function validateActor(actorUid, actorRole, auditorUid) {
  if (!validUid(actorUid) || !validUid(auditorUid)) throw Error('CONCEPT_RESERVATION_UID_REQUIRED');
  const role = str(actorRole).toUpperCase();
  if (role !== 'MANAGER' && role !== 'AUDITOR') throw Error('CONCEPT_RESERVATION_ROLE_INVALID');
  if (role === 'AUDITOR' && actorUid !== auditorUid) throw Error('CONCEPT_RESERVATION_OWNER_MISMATCH');
  return role;
}

function overlaps(blocks, from, to) {
  return blocks.some(block => block.date >= from && block.date <= to);
}

export function createConceptReservationFirestoreStore({
  projectId,
  getToken,
  fetchImpl = fetch,
  collection = RESERVATION_COLLECTION,
  outboxCollection = OUTBOX_COLLECTION,
  now = () => new Date().toISOString()
} = {}) {
  if (projectId !== DEV_PROJECT || collection !== RESERVATION_COLLECTION ||
      outboxCollection !== OUTBOX_COLLECTION || typeof getToken !== 'function' ||
      typeof fetchImpl !== 'function' || typeof now !== 'function') {
    throw Error('CONCEPT_RESERVATION_DEV_CONFIGURATION_REQUIRED');
  }

  const base = `https://firestore.googleapis.com/v1/projects/${enc(projectId)}/databases/(default)/documents`;
  const collectionPath = `${base}/${collection}`;
  const outboxPath = `${base}/${outboxCollection}`;
  const resourceName = (name, id) =>
    `projects/${projectId}/databases/(default)/documents/${name}/${id}`;

  async function request(url, init = {}) {
    const token = await getToken();
    if (!token) throw Error('CONCEPT_RESERVATION_TOKEN_REQUIRED');
    return fetchImpl(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {})
      }
    });
  }

  async function readRaw(collectionName, id) {
    const response = await request(`${base}/${collectionName}/${enc(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`CONCEPT_RESERVATION_READ_${response.status}`);
    const raw = await response.json();
    const payload = raw.fields?.payload;
    if (!payload || !raw.updateTime) throw Error('CONCEPT_RESERVATION_DOCUMENT_CORRUPT');
    return { value: decode(payload), updateTime: raw.updateTime };
  }

  async function listRaw(collectionName, { pageSize = 200, maxPages = 100 } = {}) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
        !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw Error('CONCEPT_RESERVATION_SCAN_INPUT_INVALID');
    }
    const documents = [];
    let pageToken = '';
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`${base}/${collectionName}`);
      url.searchParams.set('pageSize', String(pageSize));
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await request(url.toString());
      if (!response.ok) throw Error(`CONCEPT_RESERVATION_LIST_${response.status}`);
      const data = await response.json();
      for (const raw of data.documents || []) {
        const id = String(raw.name || '').split('/').at(-1) || '';
        if (!raw.fields?.payload || !raw.updateTime) throw Error('CONCEPT_RESERVATION_DOCUMENT_CORRUPT');
        documents.push({ id, value: decode(raw.fields.payload), updateTime: raw.updateTime });
      }
      pageToken = data.nextPageToken || '';
      if (!pageToken) return documents;
    }
    throw Error('CONCEPT_RESERVATION_SCAN_LIMIT');
  }

  async function commit(writes) {
    if (!Array.isArray(writes) || writes.length < 1 || writes.length > 500) {
      throw Error('CONCEPT_RESERVATION_WRITESET_INVALID');
    }
    let response;
    try {
      response = await request(`${base}:commit`, {
        method: 'POST',
        body: JSON.stringify({ writes })
      });
    } catch {
      throw Error('CONCEPT_RESERVATION_COMMIT_OUTCOME_UNKNOWN');
    }
    if ([409, 412].includes(response.status)) return false;
    if (!response.ok) throw Error(`CONCEPT_RESERVATION_COMMIT_${response.status}`);
    return true;
  }

  function writeFor(collectionName, id, value, prior) {
    const update = {
      update: {
        name: resourceName(collectionName, id),
        fields: { payload: encode(value) }
      },
      currentDocument: prior ? { updateTime: prior.updateTime } : { exists: false }
    };
    return update;
  }

  async function buildWrite(reservation, previous) {
    const version = previous ? previous.value.version + 1 : 1;
    const next = {
      ...reservation,
      version,
      createdAt: previous?.value.createdAt || reservation.createdAt,
      updatedAt: now()
    };
    const operationId = 'p_' + digest(`${next.auditId}|${version}|${next.state}`);
    const outbox = {
      operationId,
      state: 'PENDING',
      operation: next.state === 'RELEASED' ? 'RELEASE' : 'UPSERT',
      reservation: next,
      createdAt: next.updatedAt
    };
    const existingOutbox = await readRaw(outboxCollection, operationId);
    return {
      next,
      writes: [
        writeFor(collection, docId(next.auditId), next, previous),
        writeFor(outboxCollection, operationId, outbox, existingOutbox)
      ]
    };
  }

  async function read(auditId) {
    const found = await readRaw(collection, docId(auditId));
    if (!found) return null;
    assertStoredReservation(found.value, auditId);
    return clone(found.value);
  }

  async function listAll({ pageSize = 200, maxPages = 100 } = {}) {
    const all = await listRaw(collection, { pageSize, maxPages });
    const rows = all.map(item => {
      const value = item.value;
      if (!value || !validId(value.auditId) || item.id !== docId(value.auditId)) {
        throw Error('CONCEPT_RESERVATION_DOCUMENT_CORRUPT');
      }
      assertStoredReservation(value, value.auditId);
      return clone({ ...value, blocks: validateBlocks(value.blocks) });
    });
    rows.sort((a, b) => Number(b.state === 'ACTIVE') - Number(a.state === 'ACTIVE') ||
      a.auditId.localeCompare(b.auditId));
    return rows;
  }

  async function list({ from, to, auditorUids = [], pageSize = 200, maxPages = 100 } = {}) {
    if (!validDate(str(from)) || !validDate(str(to)) || to < from ||
        !Array.isArray(auditorUids) || auditorUids.some(uid => !validUid(uid))) {
      throw Error('CONCEPT_RESERVATION_READ_INPUT_INVALID');
    }
    const uidSet = new Set(auditorUids);
    const all = await listAll({ pageSize, maxPages });
    const rows = [];
    for (const value of all) {
      if (value.state !== 'ACTIVE' || (uidSet.size && !uidSet.has(value.auditorUid))) continue;
      if (overlaps(value.blocks, from, to)) rows.push(value);
    }
    rows.sort((a, b) => a.auditId.localeCompare(b.auditId));
    return rows;
  }

  async function upsert(input) {
    const result = await upsertBatch({ items: [input] });
    if (result.saved !== true) return result;
    return { ...result, reservation: result.reservations[0] };
  }

  async function upsertBatch({ items } = {}) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
      throw Error('CONCEPT_RESERVATION_BATCH_INVALID');
    }
    const seen = new Set();
    const writes = [];
    const reservations = [];
    for (const input of items) {
      const auditId = str(input?.auditId);
      const auditorUid = str(input?.auditorUid);
      const actorUid = str(input?.actorUid);
      const actorRole = validateActor(actorUid, input?.actorRole, auditorUid);
      if (!validId(auditId) || seen.has(auditId)) throw Error('CONCEPT_RESERVATION_AUDIT_ID_INVALID');
      seen.add(auditId);
      const sourceRevision = str(input?.sourceRevision);
      if (!sourceRevision || sourceRevision.length > 256) throw Error('CONCEPT_RESERVATION_REVISION_REQUIRED');
      const previous = await readRaw(collection, docId(auditId));
      if (previous) assertStoredReservation(previous.value, auditId);
      const reservation = {
        schemaVersion: 1,
        reservationId: 'CR-' + auditId,
        auditId,
        auditorUid,
        blocks: validateBlocks(input.blocks),
        sourceRevision,
        state: 'ACTIVE',
        purpose: 'PRELIMINARY_COMPANY_CONFIRMATION',
        note: str(input?.note),
        createdByUid: actorUid,
        createdByRole: actorRole,
        createdAt: previous?.value.createdAt || now(),
        updatedAt: now()
      };
      const built = await buildWrite(reservation, previous);
      writes.push(...built.writes);
      reservations.push(built.next);
    }
    if (!await commit(writes)) return { saved: false, reason: 'CONFLICT', reservations: [] };
    return { saved: true, reason: 'SAVED', reservations: clone(reservations) };
  }

  async function release({ auditId, actorUid, actorRole, reason = 'MANUAL_RELEASE' } = {}) {
    const cleanAuditId = str(auditId);
    const previous = await readRaw(collection, docId(cleanAuditId));
    if (!previous) return { released: false, reason: 'NOT_FOUND' };
    assertStoredReservation(previous.value, cleanAuditId);
    const role = validateActor(actorUid, actorRole, previous.value.auditorUid);
    if (role === 'AUDITOR' && previous.value.auditorUid !== actorUid) {
      throw Error('CONCEPT_RESERVATION_OWNER_MISMATCH');
    }
    if (previous.value.state === 'RELEASED') {
      return { released: false, reason: 'ALREADY_RELEASED', reservation: clone(previous.value) };
    }
    const next = {
      ...previous.value,
      version: previous.value.version + 1,
      state: 'RELEASED',
      releaseReason: str(reason) || 'MANUAL_RELEASE',
      releasedByUid: actorUid,
      releasedByRole: role,
      releasedAt: now(),
      updatedAt: now()
    };
    const built = await buildWrite(next, previous);
    if (!await commit(built.writes)) return { released: false, reason: 'CONFLICT' };
    return { released: true, reason: 'RELEASED', reservation: clone(built.next) };
  }

  async function listOutbox({ pageSize = 200, maxPages = 100 } = {}) {
    return listRaw(outboxCollection, { pageSize, maxPages });
  }

  async function markProjected({ operationId, updateTime } = {}) {
    const id = str(operationId);
    if (!/^p_[a-f0-9]{64}$/.test(id) || !str(updateTime)) {
      throw Error('CONCEPT_RESERVATION_OUTBOX_ACK_INVALID');
    }
    const prior = await readRaw(outboxCollection, id);
    if (!prior) return { marked: false, reason: 'NOT_FOUND' };
    if (prior.value.state === 'PROJECTED') return { marked: true, replayed: true };
    if (prior.updateTime !== updateTime) return { marked: false, reason: 'CONFLICT' };
    const next = { ...prior.value, state: 'PROJECTED', projectedAt: now() };
    if (!await commit([writeFor(outboxCollection, id, next, prior)])) {
      return { marked: false, reason: 'CONFLICT' };
    }
    return { marked: true, replayed: false };
  }

  return Object.freeze({ read, list, listAll, upsert, upsertBatch, release, listOutbox, markProjected });
}
