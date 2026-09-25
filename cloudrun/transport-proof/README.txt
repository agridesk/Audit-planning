# AMS Cloud Run DEV focused-read service

Scope: DEV only. Read-only Planning Workspace focused reads.

Cloud project: audit-management-system-dev
Region: europe-west1
Service: ams-transport-proof
Service URL: https://ams-transport-proof-510075419067.europe-west1.run.app

Runtime
- package.json starts server-r4.js; this is the canonical DEV Cloud Run entry point.
- Google Sheets API is read directly by the Cloud Run service identity.
- DEV Google Sheets remains the SSoT.
- Cloud Run service account has Viewer access only.
- No writes are implemented.
- PROD is not configured.

Required environment
DEV_SSOT_SPREADSHEET_ID = DEV Audit Management spreadsheet ID

Browser boundary
DEV_ALLOWED_ORIGIN = exact external DEV web-app origin.
Browser requests fail closed unless DEV_ALLOWED_ORIGIN is configured and matches exactly. Focused reads additionally require a valid signed application-session cookie. Origin/CORS is defense-in-depth, not authentication.

Endpoints
GET /health
GET /api/v1/session
GET /api/v1/planning/workspace?auditId=<AUDIT_ID>

Focused read contract (R8 session enforced)
- target Audit planning row and planning window
- scopes
- hard-qualified candidate auditors
- Availability overlays
- Concept Reservations overlays
- source counts and timing

Deferred facts
Rotation/consecutive history and hours-to-plan are not owned by this read projection. They are returned as deferred/unknown rather than false or zero.

Validated performance
Direct Sheets proof samples were 516 ms and 634 ms total server-side. These are samples, not a p95 claim. Target remains decision-ready <= 2 s p95.

Migration rule
Do not reconnect the interactive hot-read path through Apps Script HTTP. Existing canonical write services remain the write owner until separately migrated.
