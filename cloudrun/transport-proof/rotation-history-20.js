'use strict';
// Canonical Company UID + Scope key + Auditor UID, Completed only.
function consecutiveCompleted(rows, companyUid, scopeKey, auditorUid) {
  if (!Array.isArray(rows) || !companyUid || !scopeKey || !auditorUid) throw Error('INVALID_ROTATION_CONTEXT');
  const relevant = rows.filter(r => r.companyUid === companyUid && r.scopeKey === scopeKey && r.status === 'Completed');
  if (relevant.some(r => !r.auditId || !r.auditorUid || !r.completedAt || !Number.isFinite(Date.parse(r.completedAt)))) throw Error('INCOMPLETE_ROTATION_HISTORY');
  const seen = new Set();
  for (const r of relevant) { if (seen.has(r.auditId)) throw Error('DUPLICATE_COMPLETED_AUDIT'); seen.add(r.auditId); }
  relevant.sort((a,b) => Date.parse(b.completedAt)-Date.parse(a.completedAt) || String(b.auditId).localeCompare(String(a.auditId)));
  let count=0;
  for (const r of relevant) { if (r.auditorUid!==auditorUid) break; count++; }
  return {count,auditIds:relevant.slice(0,count).map(r=>r.auditId)};
}
module.exports={consecutiveCompleted};
