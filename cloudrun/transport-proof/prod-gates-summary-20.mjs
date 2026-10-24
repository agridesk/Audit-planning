// Read-only concise source release status; no deployment or cloud calls.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('./prod-readiness-contract-20.mjs',import.meta.url));
const run=spawnSync(process.execPath,[target],{encoding:'utf8'});
if(run.error)throw run.error;
const report=JSON.parse(run.stdout);
if(report.contract!=='AMS_CLOUD_20_PROD_PORTABILITY')throw Error('INVALID_RELEASE_REPORT');
console.log('AMS PROD: '+report.result);
for(const finding of report.findings.filter(x=>x.severity==='BLOCKER'))console.log('OPEN '+finding.code);
console.log('Source-only evidence, no PROD deployment approval.');
if(run.status!==0)process.exitCode=1;
