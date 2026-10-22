/**
 * AMS 2.0 Cloud Run production portability gate.
 * Read-only. Does not access runtime credentials, databases or deployed services.
 * Run locally from cloudrun/transport-proof with node prod-readiness-contract-20.mjs.
 * This file is deliberately not wired into npm test until the migration is approved,
 * because the current DEV-only entrypoint is known not to satisfy PROD portability.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname);
const files=['server-r15.js','server-r12.js','server-r4.js'];
const entries=files.map(file=>({file,source:readFileSync(resolve(root,file),'utf8')}));
const findings=[];
function check(file,code,pattern,detail){
  const item=entries.find(e=>e.file===file);
  if(pattern.test(item.source))findings.push({file,code,severity:'BLOCKER',detail});
}
check('server-r15.js','DEV_PROJECT_STARTUP_LOCK',/project\s*!==\s*['"]audit-management-system-dev['"]\)throw\s+Error\(['"]AVAILABILITY_DEV_PROJECT_ONLY/, 'The executable entrypoint rejects a separate production Google Cloud project.');
for(const file of files){
  check(file,'DEV_ONLY_SPREADSHEET_ENV',/process\.env\.DEV_SSOT_SPREADSHEET_ID/, 'Runtime spreadsheet ownership relies on a DEV-prefixed environment variable.');
  check(file,'DEV_ONLY_GAS_BRIDGE_ENV',/process\.env\.GAS_DEV_WRITE_URL/, 'GAS bridge URL is configured through a DEV-prefixed environment variable.');
}
check('server-r15.js','NOTIFICATION_DEV_PROJECT_LOCK',/project\s*!==\s*['"]audit-management-system-dev['"]\s*\|\|\s*!endpoint/, 'Notification GAS bridge rejects a production project.');
const report={contract:'AMS_CLOUD_20_PROD_PORTABILITY',status:findings.length?'NOT_READY':'SOURCE_STATIC_CHECK_PASSED',checks:files,findings,disclaimer:'A passing source-only check is not deployment approval: independently verify IAM, runtime revision, Script Properties, triggers, jobs, credentials and application smoke tests.'};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(findings.length)process.exitCode=1;
