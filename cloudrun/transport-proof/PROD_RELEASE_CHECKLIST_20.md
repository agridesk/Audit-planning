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
