import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const checks=[
['1.0 parity columns', ['Company','Locations','Region','GPS / Map','Scopes','Status','Expiration date','Planning window','Self planning','Date planned','To be planned','Hours planned','Auditor','Actions'].every(x=>manager.includes(x))],
['planning 2.0 context visible',manager.includes('Planning 2.0')&&manager.includes('conceptMonth')&&manager.includes('provisionalReservationCount')],
['concept explicitly non committed',manager.includes('Concept only — not committed')],
['provisional explicitly non committed',manager.includes('Provisional workload — not committed planning')],
['bulk enrichment single endpoint',manager.includes("fetch('/api/v1/manager/open-enrichment'")&&manager.includes('auditIds:ids')],
['no per audit enrichment loop fetch',!manager.includes('/api/v1/manager/open-enrichment?auditId=')],
['enrichment preserves scroll',manager.includes('var ids=all.map')&&manager.includes('window.scrollTo(sx,sy)')],
['extension apply undo controls',manager.includes('Undo extension')&&manager.includes('Apply canonical planning-window extension')],
['extension uses canonical endpoint',manager.includes("fetch('/api/v1/manager/extension'")],
['extension same row patch',manager.includes('mergeRowInPlace(auditId,x.patch)')],
['extension no full reload',!manager.includes('location.reload(')],
['server bulk enrichment endpoint',r10.includes("u.pathname==='/api/v1/manager/open-enrichment'")],
['server extension endpoint',r10.includes("u.pathname==='/api/v1/manager/extension'")],
['server enrichment bridge',r10.includes("'externalmanageropenenriched'")],
['server extension bridge',r10.includes("'externalmanagerextension'")],
['bridge key never in browser',!manager.includes('bridgeKey')&&!html.includes('bridgeKey')],
['stable runtime chain',r10.includes("await import('./server-r9.js')")&&!r10.includes("await import('./server-r11.js')")],
['dense grid styling',html.includes('min-width:1900px')&&html.includes('.planning-chip'))
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('open-audits-grid2-contract-test passed');
