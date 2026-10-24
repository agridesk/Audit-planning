# AMS Cloud 2.0 — DEV to PROD release gate (V2.12)

Status: NOT AUTHORIZED FOR PROD DEPLOYMENT. This checklist is the cutover contract, not a deploy command.

## Source-of-truth / invariants
- GitHub is code SSOT. DEV branch is not proof of the deployed Cloud Run revision.
- Shared Cloud Run entrypoint: server-r15.js. It resolves environment via runtime-environment-20.mjs.
- Production is explicitly opt-in. Its GCP project, sheet, GAS writer, writer key and origin must be separate from DEV.
- Model C remains lifecycle SSOT; the Audit planning tab is a projection. No migration may overwrite lifecycle data.
- The other implementation chat owns lifecycle/Cancel/Availability/Deny changes. This gate does not alter them.
- PROD writes, notifications, job creation or installation require explicit release authorization.

## Source regression checks
- node prod-contract-20-regression-test.mjs
- node prod-environment-isolation-20-test.mjs (PROD bridge, signing secret and origin fixture aligned)
- node prod-readiness-contract-20.mjs (static source readiness contract)
- node gas-trigger-source-inventory-20.mjs (source inventory; NOT evidence of installed triggers)

Run `npm run test:prod-readiness` or use the dedicated GitHub Actions readiness workflow (no deployment). These checks do not replace live runtime evidence.

## Known source blocker
- PROVEN_DEVIATION: `server-r4.js` retains direct manager approval/cancel sheet mutations. Route precedence/disablement and canonical-write ownership require proof before PROD.
- PROVEN_DEVIATION: `server-r6.js` contains a legacy direct Sheets write path for combined visits. It writes planning, auditor availability and visit obligation links directly. Ownership and remediation belong to the parallel lifecycle chat; this readiness track must not bypass the gate or silently enable it in PROD.

## Independent issue #44 source gates
- `PROD_FIRESTORE_COLLECTION_DEFAULT_DEV`: Availability adapter still uses a DEV-named default collection and R15 supplies no explicit collection binding. Require separate PROD collection and real project/database evidence.
- `PROD_REALIZED_HOURS_DIRECT_SHEETS_WRITE`: R12 still sends a direct Google Sheets batchUpdate for realized-hours corrections; verify actor checks, canonical write ownership and collisions. The handler validates Manager session/roster and completed audit state, but the optional expected-hours check is not an atomic compare-and-swap and the in-process lock is not distributed; retain blocker until owner proves safe cross-instance conflict handling.
- `npm run audit:prod-evidence` emits source-only evidence with all live checks explicitly NOT_VERIFIED. It never deploys, mutates Sheets, or reads secrets.

## One-command read-only operator verification
For actual DEV deployment evidence, an authorized operator can execute the CMD one-liner supplied in chat. It must only run read-only `gcloud run services describe`, `gcloud scheduler jobs list` and `gcloud builds list`; outputs are not proof of GAS installable triggers. Never print secrets or perform deploy/update commands during this stage.

## Deploy preflight — MUST verify in actual GCP/GAS runtimes
1. Capture exact DEV and candidate PROD commit/build SHA, container digest, Cloud Run revision, service and region.
2. Prove PROD project identity equals AMS_PROD_GCP_PROJECT and differs from audit-management-system-dev.
3. Verify PROD spreadsheet ID exists, is independently permissioned, and is unequal to DEV sheet ID.
4. Verify PROD GAS URL + bridge key are independent from DEV; credentials stay out of logs and repository. A separate PROD session-signing secret is mandatory; neither PROD key nor secret may equal the respective DEV credential.
5. Verify PROD allowed origin and cookie scope; ensure session signing secret is PROD-specific.
6. Check Firestore database, IAM grants, indexes, quotas and data isolation, including availability collections.
7. Inventory all actually installed GAS triggers by execution identity; compare handler, project, timezone and cadence. Do not blindly install the source candidates (especially legacy cache triggers).
8. Enumerate Cloud Scheduler / Cloud Build / deploy jobs and their service accounts. Prevent DEV jobs targeting PROD and duplicate sends.
9. Confirm PROD notifications have explicit safe launch mode and recipient policy. No real email sending in preflight.
9a. Confirm AMS_PROD_AUTH_OTP_ENABLED=true, isolated signing credentials of at least 32 characters, PROD GAS OTP handlers, mail deliverability, resend throttling, token exchange, automatic redirect and server-side DEV-login rejection. Confirm logout revocation when enabled.
10. Verify test suite in CI or a controlled runner; protect against an outdated failing fixture and missing npm script registration.
11. Validate health/build endpoint and representative manager/auditor read-only screens, authentication and authorization.
12. Obtain affirmative release approval before PROD cutover.

## Verified DEV runtime evidence — 2026-10-24 (operator read-only output)
- Project: `audit-management-system-dev`; service: `ams-transport-proof`; region: `europe-west1`.
- Active revision: `ams-transport-proof-02981-cmb`, 100% traffic, image digest `sha256:03569835b50ab8aca2fc1c2b0401b9e6e6b64f30a306a9840b338fe25ef79641`.
- GitHub-triggered Cloud Build `a618c6d0-2497-407e-aaee-ecf0d48d2d88` from `1a383a3d93827730f813e46bc51ba2926830675a` succeeded in npm test, build, push and deploy; output digest matches active revision. **This replaces the earlier obsolete 7028b7e provenance interpretation**; that older label/build does not describe the actual active image provenance.
- Cloud Scheduler `ams-swap20-reconcile-dev` every five minutes targets the DEV service with its dedicated OIDC service account. Operator logs: HTTP 200 and `SWAP20_INDEX_SCHEDULED_SYNC` `ok:true`, `records:6` on three consecutive checks. This verifies scheduler delivery and application-level index synchronization, **not** full SWAP business correctness.
- Runtime is `AMS_RUNTIME_ENV=DEV`, uses DEV spreadsheet and GAS bridge; secret values are Secret Manager references. Service runs under the default Compute Engine service account; ingress is public and invoker IAM check disabled. Authorization requires separate verification.
- All evidence is **DEV-only**. Actual GAS deployed version, PROD runtime, PROD identities/Firestore collections, trigger installations and lifecycle E2E remain NOT_VERIFIED.
- Build provenance source: operator-supplied `gcloud run revisions describe`, `gcloud builds describe`, `gcloud scheduler jobs describe` and Cloud Logging output; avoid inferring deploy status from build SUCCESS alone.

## Cutover / rollback
- Pin and record candidate image digest and configuration version.
- Deploy new PROD revision with no production traffic; perform authenticated preflight.
- Check logs, permissions, session cookie, GAS bridge and notifications without triggering unintended writes.
- Shift traffic only after explicit user authorization and evidence that no conflicting triggers run.
- Immediately revert traffic to pinned previous revision on authorization, integrity, write-routing or availability failure.
- Postflight: inspect write audit trail, notification queue/delivery, scheduled jobs, error logs, and lifecycle reconciliation.

## Evidence classification
READY = tested with supporting evidence.
PROVEN_DEVIATION = failing check with exact proof.
NOT_VERIFIED = source-only inference or inaccessible live configuration.
NOT_APPLICABLE = documented reason, not silence.

As of this file: live Cloud Run and GAS runtime parity, trigger installation, scheduler jobs and actual CI execution remain NOT_VERIFIED.

## Local Windows contract verification — 2026-10-24
Operator executed from `cloudrun/transport-proof` on Node v24.18.0: `npm run test:prod-evidence` PASS (25 evidence checks); `npm run test:prod-config` PASS (20 environment regression cases and 9 isolation cases). These prove source-level test behavior, not runtime PROD deployment safety. DEV/PROD cutover remains NOT_READY.

## New AMS 2.0 PROD Apps Script identity — 2026-10-24
User created a distinct GAS project named `AMS 2.0 PROD`, script ID `1lWMkeygwnsJjni20f-q_3CvA0YQB0la1mEgZYRqJfB0BXUbFfZu7uOnd`. Script creation is confirmed by user; deployed source version, spreadsheet binding, OAuth scopes, Script Properties, installable triggers, web-app deployment URL and permissions are NOT_VERIFIED. Do not confuse this Apps Script project with a separate new Cloud Run/Firestore Google Cloud project. No PROD source push, run or deployment authorized.

## AMS 2.0 PROD spreadsheet identity — 2026-10-24
Native Google Sheet verified in Drive: `AMS 2.0 PROD`, spreadsheet ID `1-nnRHMhwtlDWEiayg7krbYXJKW9zfSlK0oxzogg8ovw`; 44 tabs; locale `en_GB`; timezone `Europe/Paris`; created 2026-10-24. It is a copy of the DEV workbook and may contain cloned DEV operational data, notification settings, credentials/tokens or trigger configuration. **Do not activate PROD writes, notifications, jobs or user access until copied content is classified and scrubbed/migrated under a reviewed plan.** New separately created GAS script ID `1lWMkeygwnsJjni20f-q_3CvA0YQB0la1mEgZYRqJfB0BXUbFfZu7uOnd` is not yet verified to be the sheet's container-bound script; copying a bound spreadsheet can create another linked script. No GAS push/deploy/trigger installations performed.
