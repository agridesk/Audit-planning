AMS NOTIFICATIONS 2.0 — TECHNICAL README / HANDOVER
Version: 2026-10-18
Scope: GitHub agridesk/Audit-planning, branch dev. Current implementation, not a statement of PROD migration completion.
Status: DEV settings migrated; physical tab retirement NOT approved.

1. PURPOSE
A new maintainer should be able to identify every notification configuration owner, operational data source, and migration constraint without reverse-engineering the spreadsheet.
Single Source of Truth (SSOT): one authoritative configuration owner per setting, never two independently editable copies.

2. CANONICAL SPREADSHEET STRUCTURE (TARGET)
System_Config
  Environment-specific system and transport settings (DEV/PROD columns). DEV is authoritative for sender identity, delivery safeguards, runner flags, mail provider, queue retention, and test routing.
Notification_Config
  Per-event activation, email/log-only policy, recipient routing, digest grouping, buffering and renderer family.
Notification_Rules
  Business rules, thresholds, weekday/hour schedules, allowed comment policies and operational queue-sheet naming. Do not duplicate these values in System_Config.
Notification Queue
  Pending/processing/delivery queue; operational records, NOT configuration.
Notification log
  Historical delivery/audit log; append/history semantics, NOT configuration.
Notification_Change_Log
  Traceable manager configuration changes, NOT a second source of rule values.

TRANSITION-ONLY SHEETS
Notification_Settings
  Historical sender/runner/test settings. DEV canonical readers resolve System_Config first and do not fall back to this tab. PROD compatibility readers still exist. DO NOT DELETE OR EDIT as a way of changing DEV configuration. Contains LAST_RUN_* snapshots from 2026-04-15; these are not proof of current runner health.
Notification_Templates
  Three generic template rows observed in DEV as of 2026-10-18. Runtime dependency has not been proven absent. No full template editor planned; do not delete until renderer/dispatch reference inventory and preview tests establish safe retirement.

3. VERIFIED DEV MIGRATION (2026-10-18)
RUN_NOTIFICATION_CONSOLIDATION_AUDIT output on DEV GAS deployment @352:
  ok=true; migrationVerified=true
  10/10 migrated settings match exactly; zero duplicates in Notification_Settings, System_Config and Notification_Rules.
  Legacy retirementReady=false.
  Explicit blockers:
    PROD_LEGACY_READ_COMPATIBILITY
    LEGACY_RUNTIME_STATE_OWNER_UNVERIFIED
    TEMPLATE_RUNTIME_REFERENCES_UNVERIFIED
Settings verified:
  DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME, DEFAULT_REPLY_TO,
  DEFAULT_BUFFER_MINUTES, RUNNER_ENABLED, RUNNER_FREQUENCY_MINUTES,
  QUEUE_RETENTION_DAYS, MAIL_PROVIDER, TEST_MODE, TEST_RECIPIENT.
  DEV_NOTIFICATION_MODE and DEV_TEST_EMAIL belong to System_Config and control DEV routing.
  A matching snapshot is evidence of value migration, NOT proof that all code paths are migrated.

4. PRIMARY MODULE MAP
NotificationConfig.js
  Reads Notification_Config and Notification_Rules; NotificationConfig_GetSetting / GetAllSettings and direct nc_loadSettingsMap_ calls resolve DEV System_Config, PROD legacy settings compatibility. Cache is not authoritative.
SystemConfig.js
  System configuration and environment access.
NotificationSender.js
  Queue sending and DEV notification routing; verify guards before changing delivery policy.
NotificationMailGateway.js
  Resend/mail transport, sender identity and legacy retirement diagnostics.
NotificationBuilder.js
  Notification construction and queue generation.
NotificationManagement20.js
  Manager-facing DEV configuration writes and Notification_Change_Log.
NotificationRenderer_*.js
  Event/digest rendering; presentation logic is code-owned unless explicitly configured.
StatusNotificationBridge.js
  Lifecycle-to-notification event mapping; auditor Denied legacy action maps to Cancelled.
NotificationConsolidationDiagnostics.js
  DEV-only read-only audit. Function: RUN_NOTIFICATION_CONSOLIDATION_AUDIT.
cloudrun/transport-proof/server-r15.js
  Manager portal API; DEV overview now reads System_Config instead of Notification_Settings, including sender identity and overlap diagnostics. Notification_Settings is not fetched by the overview. Verify other consumers separately.
cloudrun/transport-proof/notification-overview-20.mjs
  Read-only overview aggregation; setting counts are inventory, not authoritative configuration.
cloudrun/transport-proof/notifications-gas-contract-20-test.mjs
  Regression/contract checks.

5. EVENT AND LEGACY COMPATIBILITY
AUDIT_DENIED_BY_AUDITOR and COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR remain present/active in legacy configuration for historical compatibility. Current auditor Denied UI action is replaced by Cancelled; new canonical paths must not emit the old event. Do not delete historical records or silently reinterpret them.
COMPLETED_ON_BEHALF log-only semantics must be checked in the active event policy; never infer behavior solely from a SEND_EMAIL cell.

6. CHANGE MANAGEMENT / CONFIGURATION OWNERSHIP
To change DEV technical mail/test/runner settings: System_Config DEV column.
To change an event's delivery/routing policy: Notification_Config via authorized manager workflow.
To change business thresholds/schedules/comment policies: Notification_Rules via authorized manager workflow.
Never edit old Notification_Settings expecting a DEV effect.
Never expose RESEND_API_KEY, tokens, script properties or recipient private data in overview/diagnostic responses.
Preserve Notification_Change_Log records; do not repurpose log tabs for editable configuration.
PROD must not be altered as a side effect of DEV cleanup.
Cache invalidation must be verified after changing live configuration.

7. RETIREMENT PLAN — ORDERED, NO DESTRUCTIVE SHORTCUTS
A. DEV manager overview migrated to System_Config in dev commit d2be21c. Enumerate all remaining read/write references to Notification_Settings, including GAS, Cloud Run, triggers, and external consumers; preserve PROD compatibility until independently migrated and verified.
B. Determine real owner of runner status from current queue, sender execution logs, and scheduler; LAST_RUN_* fields in Notification_Settings are stale snapshots, not reliable health monitoring. Implement an operational-status view before removing them.
C. Enumerate every use of Notification_Templates across GAS/Cloud Run/renderers; compare actual rendered messages. If unused, archive its schema and content outside the active workbook before physical removal.
D. Keep historical Denied event and comment rule until event-history migration and rollback constraints are verified. Exclude legacy Denied from new editable UI.
E. Run npm test (cloudrun/transport-proof), GAS diagnostics, and DEV end-to-end queue/send tests with safe DEV routing. Validate notification overview, manager edits, digest schedules, and no unintended outbound email.
F. Complete PROD-specific migration and verify its runtime and settings separately. Only then schedule physical removal of Notification_Settings from each environment.
G. Remove a sheet only after independent backup, reference inventory, sign-off and rollback path. Never delete a sheet solely because the current diagnostic reports 10 matching values.

8. SAFE RELEASE PRACTICE
GitHub dev is source control; local clasp push/deploy is a separate step. Cloud Run deployment only if its runtime changed.
GAS DEV deployment ID: AKfycbxB6Vs7dTbriWYToqSr6kovvkkkYIs4zj2m69UPevINSDfmu0DO4qUKpjoKpAlvMbqI4g
Cloud Run DEV: ams-transport-proof; project audit-management-system-dev; region europe-west1.
DEV spreadsheet ID: 1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs
PROD spreadsheet ID: 1J4ykUsgDQc1gNeZJjyOJmQ-rsYnf8ujdwg9uTACmCNw
Never run DEV cleanup against PROD. Environment detection must fail closed.
Do not interpret a successful GAS deployment as a successful Cloud Run release or vice versa.

9. OPERATOR CHECKLIST
- Confirm active environment and target spreadsheet.
- Inspect System_Config DEV_NOTIFICATION_MODE / DEV_TEST_EMAIL / SEND_NOTIFICATIONS.
- Check Notification_Config for event enablement and log-only rules.
- Check Notification_Rules for schedules and thresholds.
- Inspect Notification Queue and Notification log for actual delivery state.
- Inspect Notification_Change_Log for manager edits.
- Run RUN_NOTIFICATION_CONSOLIDATION_AUDIT in NotificationConsolidationDiagnostics.js to check DEV migration and retirement blockers; it never mutates data.
- Treat any 'legacySheetRetirementReady=false' as a prohibition on deleting the sheet.

10. DOCUMENT GOVERNANCE
This README describes verified DEV status as of 2026-10-18. It is not an instruction to deploy or delete. Update it alongside any changes to configuration ownership, schema, API consumers, environment isolation, and tab retirement. Older AMS roadmaps V2.7 and earlier are not authoritative.

11. FOLLOW-UP CONSOLIDATION (2026-10-18)
Direct nc_loadSettingsMap_ now guards DEV and returns canonical System_Config settings before legacy cache or sheet access. Contract regression test added. GAS DEV deployment required for this change; PROD legacy behavior remains.

12. LEGACY DIAGNOSTIC SAFETY (2026-10-18)
RUN_NOTIFICATION_SETTINGS_RETIREMENT_DIAGNOSTICS in NotificationMailGateway.js is now a backward-compatible alias to RUN_NOTIFICATION_CONSOLIDATION_AUDIT, DEV-only. It always returns retirementReady=false and exposes the canonical blockers. Previously it could compare the DEV System_Config map with itself through nc_loadSettingsMap_ and incorrectly claim retirement readiness. Never treat settings parity as tab deletion authorization. Requires GAS DEV deployment.

13. ENVIRONMENT ISOLATION HARDENING (2026-10-18)
RUN_NOTIFICATION_CONSOLIDATION_AUDIT requires BOTH SYS_getEnv_() === DEV and the exact DEV spreadsheet ID; it fails closed with DEV_SPREADSHEET_ID_MISMATCH for any other workbook, including PROD. Regression test added. Requires GAS DEV deployment.
