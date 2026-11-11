// Issue #87: pure Model C time allocation for a single physical Visit.
// Never writes planning, Availability, lifecycle, or Model C persistence.
// The canonical writer must re-read obligations and validate concurrency before commit.
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
const id = (value) => String(value ?? '').trim();
const minutes = (value) => {
  if (!/^\d{2}:\d{2}$/.test(String(value ?? ''))) fail('SCOPE_ALLOCATION_INVALID_TIME');
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) fail('SCOPE_ALLOCATION_INVALID_TIME');
  return h * 60 + m;
};
const duration = (block) => {
  const start = minutes(block?.start), end = minutes(block?.end);
  if (end <= start) fail('SCOPE_ALLOCATION_INVALID_BLOCK');
  return { start, end };
};
const positiveInt = (v) => Number.isSafeInteger(v) && v > 0;
const hourText = (minutesValue) => Math.round(minutesValue / 60 * 100) / 100;

/**
 * Allocation input:
 * obligations: [{obligationId, scopeCode, requiredMinutes}]
 * blocks: [{date, start, end, ...}]
 * allocations: [{blockIndex, obligationId, start, end}]
 *
 * Every block is partitioned into exact, non-overlapping, contiguous time intervals.
 * Every required obligation is explicitly allocated. No implicit equal split or
 * double-counting is allowed. The output contains minutes, never float hours.
 */
export function validateVisitScopeAllocation20({ obligations, blocks, allocations } = {}) {
  if (!Array.isArray(obligations) || obligations.length < 2) fail('SCOPE_ALLOCATION_MULTI_OBLIGATION_REQUIRED');
  if (!Array.isArray(blocks) || !blocks.length) fail('SCOPE_ALLOCATION_BLOCKS_REQUIRED');
  if (!Array.isArray(allocations) || !allocations.length) fail('SCOPE_ALLOCATION_EXPLICIT_REQUIRED');
  const byId = new Map();
  for (const entry of obligations) {
    const obligationId = id(entry?.obligationId);
    const scopeCode = id(entry?.scopeCode);
    const requiredMinutes = entry?.requiredMinutes;
    if (!obligationId || !scopeCode || !positiveInt(requiredMinutes)) fail('SCOPE_ALLOCATION_INVALID_OBLIGATION');
    if (byId.has(obligationId)) fail('SCOPE_ALLOCATION_DUPLICATE_OBLIGATION');
    byId.set(obligationId, { obligationId, scopeCode, requiredMinutes, plannedMinutes: 0 });
  }
  const blockWindows = blocks.map((block) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(id(block?.date))) fail('SCOPE_ALLOCATION_INVALID_DATE');
    return duration(block);
  });
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (id(blocks[i].date) === id(blocks[j].date) &&
          blockWindows[i].start < blockWindows[j].end &&
          blockWindows[j].start < blockWindows[i].end) fail('SCOPE_ALLOCATION_BLOCKS_OVERLAP');
    }
  }
  const perBlock = blocks.map(() => []);
  for (const item of allocations) {
    const index = item?.blockIndex;
    const obligationId = id(item?.obligationId);
    if (!Number.isSafeInteger(index) || index < 0 || index >= blocks.length) fail('SCOPE_ALLOCATION_UNKNOWN_BLOCK');
    if (!byId.has(obligationId)) fail('SCOPE_ALLOCATION_UNKNOWN_OBLIGATION');
    const window = duration(item);
    const parent = blockWindows[index];
    if (window.start < parent.start || window.end > parent.end) fail('SCOPE_ALLOCATION_OUTSIDE_BLOCK');
    perBlock[index].push({ blockIndex: index, obligationId, start: window.start, end: window.end });
  }
  const normalized = [];
  for (let i = 0; i < perBlock.length; i++) {
    const entries = perBlock[i].sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = blockWindows[i].start;
    for (const item of entries) {
      if (item.start < cursor) fail('SCOPE_ALLOCATION_OVERLAP');
      if (item.start > cursor) fail('SCOPE_ALLOCATION_GAP');
      cursor = item.end;
      byId.get(item.obligationId).plannedMinutes += item.end - item.start;
      normalized.push({ blockIndex: i, obligationId: item.obligationId, start: item.start, end: item.end });
    }
    if (cursor !== blockWindows[i].end) fail('SCOPE_ALLOCATION_GAP');
  }
  const summaries = [...byId.values()].map((entry) => ({
    ...entry,
    remainingMinutes: entry.requiredMinutes - entry.plannedMinutes
  }));
  if (summaries.some((entry) => entry.remainingMinutes !== 0)) fail('SCOPE_ALLOCATION_REQUIRED_HOURS_MISMATCH');
  const totalBlockMinutes = blockWindows.reduce((sum, block) => sum + block.end - block.start, 0);
  const totalRequiredMinutes = summaries.reduce((sum, entry) => sum + entry.requiredMinutes, 0);
  if (totalBlockMinutes !== totalRequiredMinutes) fail('SCOPE_ALLOCATION_TOTAL_HOURS_MISMATCH');
  const asTime = (v) => String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  return Object.freeze({
    valid: true,
    totalMinutes: totalBlockMinutes,
    totalHours: hourText(totalBlockMinutes),
    obligations: summaries,
    allocations: normalized.map((item) => ({
      blockIndex: item.blockIndex,
      obligationId: item.obligationId,
      start: asTime(item.start),
      end: asTime(item.end),
      minutes: item.end - item.start
    }))
  });
}
