import fs from 'node:fs';

const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');

const checks=[
  ['cancel/reject use targeted canonical reread',manager.includes('if(action==="cancel"||action==="reject")return rereadAndPatch')],
  ['targeted manager audit endpoint exists',r10.includes("u.pathname==='/api/v1/manager/audit'")&&r10.includes('readAuditPatch(auditId,sourceRow)')],
  ['comment is sent as reason and comment',manager.includes('options={reason:reason,comment:reason}')],
  ['row is patched in place',manager.includes('tr.outerHTML=renderOpenRow(after)')],
  ['scroll is preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
  ['actions lock only the selected audit',manager.includes('var busyAudits=new Set()')&&manager.includes('busyAudits.has(auditId)')&&!manager.includes('var actionBusy=false')],
  ['Manager actions use google.script.run relay',manager.includes('runActionViaRelay')&&manager.includes('direct-1.0-path')],
  ['slow HTTP action bridge is not a silent fallback',!manager.includes('runActionViaBridge')&&!manager.includes('bridge-fallback')],
  ['R10 exposes signed relay URL',r10.includes("u.pathname==='/api/v1/manager/action-relay-url'")&&r10.includes('actionRelayUrl(identity)')],
  ['R10 imports R9 directly',r10.includes("await import('./server-r9.js')")],
  ['Pending Planning clears committed formal and scheduled hours',r10.includes("if(k==='PENDING_PLANNING'){planningJson='';scheduled=null;formal=null;assigned='';}")],
  ['Manager open projection clears committed hours for Pending Planning',r10.includes("if(r.statusKey==='PENDING_PLANNING'){r.hoursPlanned='';r.plannedHours='';r.scheduledHours='';continue;}")]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`manager-action-micro-refresh-test failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('manager-action-micro-refresh-test passed');
