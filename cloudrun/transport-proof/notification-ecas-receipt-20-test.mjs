import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../NotificationEcasReceiptDiagnostics.js',import.meta.url),'utf8');
assert.match(src,/function RUN_DIAG_ECAS_RECEIPTS_DEV_20261021\(/);
assert.match(src,/DEV_ONLY_ECAS_RECEIPTS/);
assert.match(src,/readOnly:true/);
assert.match(src,/verifiedSnapshotReceiptCount:0/);
assert.doesNotMatch(src,/\.appendRow\(|\.setValues\(|MailApp\.sendEmail\(|GmailApp\.sendEmail\(/);
console.log('ECAS receipt inventory diagnostic contract tests passed');
