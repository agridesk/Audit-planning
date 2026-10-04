# AMS Cloud Run DEV Planning service

Scope: DEV only. Canonical focused Planning 2.0 read + Manager PLAN write hot path.

Cloud project: audit-management-system-dev
Region: europe-west1
Service: ams-transport-proof
Service URL: https://ams-transport-proof-510075419067.europe-west1.run.app

Runtime
- package.json starts server-r12.js; canonical DEV Cloud Run entry point.
- server-r12.js is the public DEV runtime and proxies through R11→R10→R9→R8→R7→R6→R5→R4.
- server-r5.js owns the focused Planning 2.0 browser surface; lower layers retain canonical planning transport and guards.
- DEV Google Sheets remains the data SSoT.
- Cloud Run service identity has DEV spreadsheet Editor access for controlled server-side writes.
- PROD is not configured and must not be touched.

Required environment
DEV_SSOT_SPREADSHEET_ID = DEV Audit Management spreadsheet ID
DEV_ALLOWED_ORIGIN = exact external DEV web-app origin.

Browser boundary
- Focused reads/writes require a valid signed application-session cookie.
- Origin/CORS is defense-in-depth, not authentication.
- Browser never writes directly to Sheets.

Canonical focused read
GET /api/v1/planning/workspace?auditId=<AUDIT_ID>
Returns audit/window/scopes, hard-qualified candidates, Availability and Concept Reservation overlays, sourceRevision and timing.

Canonical Manager PLAN write
POST /api/v1/planning/direct-commit
- Server-side Cloud Run -> Sheets; no synchronous GAS web-app roundtrip.
- Hard guards: Pending Planning lifecycle, hard qualification, planning window, required hours, max 5 days, Availability collision/capacity.
- Optimistic sourceRevision rejects stale workspace commits.
- Exact retry after a successful identical PLAN is idempotent and does not duplicate writes/notifications.
- Canonical write updates Audit planning, Availability and releases active Concept Reservations.
- Lifecycle metadata includes Status since, Last manager decision/timestamp and Manager comment.
- Notification Queue side effects: lifecycle audit trail + AUDIT_PLANNED_BY_MANAGER.
- Queue failure is non-fatal to an already committed canonical PLAN and is surfaced in sideEffectQueue.
- Availability grid expands automatically when needed.
- Shared auditor/date capacity commits are serialized in the single-instance DEV service.

Performance acceptance
Real browser saves after migration measured approximately 2.4-3.9 s, versus the former external GAS roundtrip path at roughly 15-50 s. These are observed samples, not a p95 claim.

Architecture rule
Do not reconnect Manager PLAN Save to synchronous Apps Script HTTP for cache invalidation or other tail work. The transport boundary was the dominant latency source. Any remaining legacy GAS cache reconciliation must be asynchronous/best-effort or eliminated as the relevant surface migrates to Cloud Run.

Acceptance rule
Green source/contracts alone are insufficient. Runtime permissions, physical Sheet grid limits and at least one real browser write are part of acceptance.

PROD
Untouched.
