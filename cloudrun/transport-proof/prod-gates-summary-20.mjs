// Read-only summary of existing production release source findings.
import {execFileSync} from 'node:child_process';
const output=execFileSync(process.execPath,['prod-readiness-contract-20.mjs'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const report=JSON.parse(output);
console.log(report.result);
for(const finding of report.findings.filter(x=>x.severity==='BLOCKER'))console.log(finding.code);
