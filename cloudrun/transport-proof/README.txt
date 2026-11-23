# AMS Cloud Run DEV Planning service

Scope: DEV only. Canonical focused Planning 2.0 read + shared Manager/Auditor PLAN write hot path.

Cloud project: audit-management-system-dev
Region: europe-west1
DEV service: ams-fase12-dev
Service URLs:
- https://ams-fase12-dev-510075419067.europe-west1.run.app
- https://ams-fase12-dev-zwtcar7xpa-ew.a.run.app

Runtime
- package.json starts server-r15.js; server-r15.js is the public DEV Cloud Run entry point.
- server-r15.js starts server-r12.js behind its runtime gates; server-r12.js proxies through R11→R10→R9→R8→R7→R6→R5→R4.
- server-r5.js owns the focused Planning 2.0 browser surface; lower layers retain canonical planning transport and guards.
- DEV Google Sheets remains the legacy authority unless a DEV Firestore cutover is explicitly enabled. Under the atomic planning path, Firestore is canonical and Sheets are projections. Concept Reservations use DEV Firestore when both reservation cutover flags are enabled; the `Concept Reservations` tab is then a derived view.
- Atomic single-visit planning, lifecycle, transfer and SEPARATELY visit composition reject preflight when the complete Sheets audit row or headers differ from the Firestore snapshot, even if the limited source revision is unchanged. Separate composition stores full rows and headers for its surviving parent and new visits. Investigate and reconcile drift before retrying; this check does not replace the required fence against concurrent Sheet writers.
- Realized-audit rotation history has a DEV-only, create-only Firestore backfill at `/api/v1/manager/rotation-history/migration`. With atomic planning enabled, completion events are also written to `ams_rotation_realized_audit_events_20_dev` in the same Firestore transaction as the completed-audit tombstone and successors; the Sheets log remains a derived projection.
- The rotation read model verifies the immutable backfill manifest, merges live completion events, deduplicates identical baseline/live records, and fails closed on conflicts. Rotation reads remain on Sheets unless both `AMS_DEV_ROTATION_HISTORY_FIRESTORE_READ_ENABLED` and `AMS_DEV_ROTATION_HISTORY_WRITERS_CUTOVER_VERIFIED` are enabled on `ams-fase12-dev`; Firestore mode never falls back to the Sheet.
- This is a partial rotation cutover: historical backfill and future atomic completions are covered, but scope/auditor policy sources and any remaining legacy completion writers must be migrated and verified before enabling the Firestore read gate.
- Scope20 qualification Firestore migration is code-only and disabled by default. The manager-only DEV plan previews UID-keyed documents in `ams_scope20_auditor_qualifications_20_dev`; the separate `AMS_SCOPE20_QUALIFICATION_FIRESTORE_MIGRATION_WRITE_ENABLED` gate uses create-only document writes, a final manifest, source rechecks, and the dedicated migration lock. The old Sheets migration writer is retired.
- `AMS_SCOPE20_FIRESTORE_QUALIFICATIONS_READ_ENABLED` reads only a verified Firestore manifest and fails closed on UID-roster drift; it does not fall back to `Auditor_Scope_Qualifications`. Do not enable this read gate until the Firestore migration and parity are verified and the Firestore edit writer plus Sheets projection are ready.
- Qualification migration and roster verification read full Sheet columns and reject sources at their configured row limits, including data beyond blank boundary rows. They also reject ambiguous duplicate `Auditor_UID` headers; roster verification rejects malformed rows. Investigate and reconcile source problems before retrying; do not treat a truncated roster as parity.
- DEV qualification impact preview, immediate removal and scheduled withdrawal check complete bounded sources and use `Auditor_UID` for assigned audits; unresolved or conflicting owners block the operation. Preassignments without a UID are resolved only through an unambiguous current roster. These checks do not replace a fence against concurrent assignment or manual Sheet changes.
- The standalone annual availability state-total calculator accepts complete UID-keyed Firestore availability documents and a complete canonical planning-slot set, resolves them in bounded periods, and counts 08:00–18:00 minutes by state. It is not connected to a runtime route and is not equivalent to or a parity proof for the legacy annual-capacity model; verified complete sources, authorization, consistent reads and legacy reconciliation are required before cutover.
- The qualification store includes an internal, optimistic Firestore edit primitive: the auditor record, manifest digest and create-only pending edit event update atomically with document version preconditions. It is not exposed by a route; manager authorization, roster/catalog validation, event reconciliation and reliable Sheets projection remain prerequisites for cutover.
- An edit event can be read by operation ID to investigate an uncertain result. An absent event alone does not prove that an in-flight edit did not commit; reconcile before retrying. Event acknowledgement atomically checks the manifest revision, and a replay must match the event's recorded projection digest.
- The qualification Sheets projection planner computes UID-bound cell changes for both the legacy auditor columns and relation sheet without touching either source. Its injected worker checks a source freeze, rechecks before writing, verifies readback, acknowledges pending events and retains the lock on uncertain outcomes. Its adapter replans against fresh input and prepares individual RAW cell writes. Neither is connected to Sheets: an exclusive fence covering Firestore edits, all Sheet writers and manual edits, runtime wiring and lock recovery must be implemented and verified before enabling the read gate.
- Rollback preparation: preserve the previous DEV revision and traffic mapping. Do not route traffic or switch readers back to Sheets unless the operator has authorized that change and verified that the Sheets projection is complete and current; disabling a Firestore flag alone does not establish parity or safely undo migrated data.
- Cloud Run service identity has DEV spreadsheet Editor access for controlled server-side writes.
- PROD is not configured and must not be touched.

Required environment
DEV_SSOT_SPREADSHEET_ID = DEV Audit Management spreadsheet ID
DEV_ALLOWED_ORIGIN = exact external DEV web-app origin.

Central actor capability model
- actor-capabilities-v211.js is the shared V2.11 role/lifecycle capability source for migrated Cloud Run surfaces.
- Auditor visibility is own assigned/preassigned work plus eligible self-planning pool only; Manager retains authorized full operational visibility.
- UI consumes capabilities; backend still revalidates hard constraints and lifecycle on write.

Browser boundary
- Focused reads/writes require a valid signed application-session cookie.
- Origin/CORS is defense-in-depth, not authentication.
- Browser never writes directly to Sheets.

Canonical focused read
GET /api/v1/planning/workspace?auditId=<AUDIT_ID>
Returns audit/window/scopes, hard-qualified candidates, Availability and Concept Reservation overlays, sourceRevision and timing.

Canonical shared PLAN write
POST /api/v1/planning/direct-commit
- Server-side Cloud Run -> Sheets; no synchronous GAS web-app roundtrip.
- Hard guards: Pending Planning lifecycle, hard qualification, planning window, required hours, max 5 days, Availability collision/capacity.
- Optimistic sourceRevision rejects stale workspace commits.
- Exact retry after a successful identical PLAN is idempotent and does not duplicate writes/notifications.
- Canonical write updates Audit planning, Availability and releases active Concept Reservations.
- Lifecycle metadata includes Status since, Last manager decision/timestamp and Manager comment.
- Manager PLAN: Pending Planning -> Approved; queue event AUDIT_PLANNED_BY_MANAGER.
- Auditor self-PLAN: Pending Planning -> Pending Approval; actor is fixed to the authenticated Auditor; queue event AUDIT_PLANNED_BY_AUDITOR to the active Manager recipient.
- Queue failure is non-fatal to an already committed canonical PLAN and is surfaced in sideEffectQueue.
- Availability grid expands automatically when needed.
- Shared auditor/date capacity commits are serialized in the single-instance DEV service.

Concept Reservation projection (DEV, manager-only)
POST /api/v1/manager/concept-reservations/reconcile
- `{ "action": "PREVIEW" }` returns aggregate lifecycle counts only and performs no writes.
- `{ "action": "PROJECT", "confirm": "PROJECT_CONCEPT_RESERVATIONS" }` projects the bounded Firestore snapshot to the derived `Concept Reservations` tab, verifies it, then acknowledges the Firestore outbox.
- Projection never changes reservation documents. Stale-reservation release remains blocked until lifecycle reconciliation can use a trusted canonical source.

Performance acceptance
Real browser saves after migration measured approximately 2.4-3.9 s, versus the former external GAS roundtrip path at roughly 15-50 s. These are observed samples, not a p95 claim.

EXT performance
- Atomic DEV EXT reads the canonical planning rows concurrently with the existing source batch and project identity check. Ranges, value rendering, source validation and write/readback ordering are unchanged.
- Single and dossier EXT/Undo display measured elapsed seconds after verification. Browser console entries prefixed [AMS_EXT_CLIENT_TIMING] separate command latency from single-source lookup or dossier refresh; totalMs measures the complete action, not a 2000 ms target.
- [PLANNING_EXT_TIMING] remains server-side phase logging. Browser timing does not require Cloud Logging permissions.
- The dossier still reloads authoritative obligations after success; no stale eligibility cache or optimistic success replaces verification.

Architecture rule
Do not reconnect Manager PLAN Save to synchronous Apps Script HTTP for cache invalidation or other tail work. The transport boundary was the dominant latency source. Any remaining legacy GAS cache reconciliation must be asynchronous/best-effort or eliminated as the relevant surface migrates to Cloud Run.

Acceptance rule
Green source/contracts alone are insufficient. Runtime permissions, physical Sheet grid limits and at least one real browser write are part of acceptance.

PROD
Untouched.
