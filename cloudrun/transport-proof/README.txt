# AMS Cloud Run transport proof

Scope: DEV only, read-only, one focused Planning Workspace request.

Cloud project: audit-management-system-dev
Region: europe-west4
Service: ams-transport-proof

Required environment variable:
GAS_DEV_URL = DEV Apps Script /exec URL

Deploy from this directory with Cloud Run source deployment. The service exposes:
GET /health
GET /api/v1/planning/workspace?auditId=<AUDIT_ID>

No writes are implemented. No PROD endpoint is configured.

Acceptance goal:
Compare browser wall time, Cloud Run total, GAS HTTP wait and GAS reported bootstrap time.
The proof is successful only if the external route materially reduces the current browser/platform overhead.
