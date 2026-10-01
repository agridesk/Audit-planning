import fs from 'node:fs';

const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r12=fs.readFileSync(new URL('./server-r12.js',import.meta.url),'utf8');

const checks=[
  ['cancel/reject use targeted canonical reread',manager.includes('if(action==="cancel"||action==="reject")return rereadAndPatch')],
  ['targeted manager audit endpoint exists',r12.includes("u.pathname==='/api/v1/manager/audit'")&&r12.includes('readAuditPatch(auditId,sourceRow)')],
  ['comment is sent as reason and comment',manager.includes('options:{reason:reason,comment:reason}')],
  ['row is patched in place',manager.includes('tr.outerHTML=renderOpenRow(after)')],
  ['scroll is preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
  ['actions lock only the selected audit',manager.includes('var busyAudits=new Set()')&&manager.includes('busyAudits.has(auditId)')&&!manager.includes('var actionBusy=false')],
  ['GAS versus bridge timing is surfaced',manager.includes('gasDoPostMs')&&manager.includes('bridgeMs')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`manager-action-micro-refresh-test failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('manager-action-micro-refresh-test passed');
