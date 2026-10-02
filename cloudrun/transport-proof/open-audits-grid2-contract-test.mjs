import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const recoverExtensionStart=manager.indexOf('function recoverExtension');
const runExtensionStart=manager.indexOf('function runExtension');
const recoverExtensionBody=(recoverExtensionStart>=0&&runExtensionStart>recoverExtensionStart)?manager.slice(recoverExtensionStart,runExtensionStart):'';
const runExtensionBody=runExtensionStart>=0?manager.slice(runExtensionStart):'';
const checks=[
['1.0 parity columns', ['Company','Locations','Region','GPS / Map','Scopes','Status','Expiration date','Planning window','Self planning','Date planned','To be planned','Hours planned','Auditor','Actions'].every(x=>manager.includes(x))],
['single planning entry only',!manager.includes('<th>Planning 2.0</th>')&&!manager.includes('class=\"planning2-cell\"')&&manager.includes('data-action=\"+esc(a.key)+\"')&&manager.includes('/planning?auditId=')],
['focused single planning link',manager.includes('/planning?auditId=')&&manager.includes('Single Planning 2.0')],
['broken overview route not exposed',html.includes('id="planningWorkspace"')&&manager.includes('workspace.disabled=true')&&!manager.includes('window.location.href="/planning"')],
['concept explicitly non committed',manager.includes('Concept only — not committed')],
['provisional explicitly non committed',manager.includes('Provisional workload — not committed planning')],
['gps supports legacy lat lon projection',manager.includes('r.lat!=null?r.lat:r.latitude')&&manager.includes('r.lon!=null?r.lon:(r.lng!=null?r.lng:r.longitude)')],
['bulk enrichment single endpoint',manager.includes("fetch('/api/v1/manager/open-enrichment'")&&manager.includes('auditIds:ids')],
['no per audit enrichment loop fetch',!manager.includes('/api/v1/manager/open-enrichment?auditId=')],
['enrichment preserves scroll',manager.includes('var ids=all.map')&&manager.includes('window.scrollTo(sx,sy)')],
['scheduled hours use Config_Scopes delta',r10.includes('Scheduling_hours_delta')&&r10.includes("scheduledOwner:'CONFIG_SCOPES_SCHEDULING_HOURS_DELTA'")&&r10.includes('formal+deltaInfo.delta')],
['auditor UI uses display-name projection',manager.includes('assignedToDisplayName||r.auditorDisplayName')&&r10.includes('managerAuditorDisplayMap')],
['extension apply undo controls',manager.includes('Undo applied extension')&&manager.includes('Apply extension (+')],
['undo remains available after canonical apply',manager.includes('if(applied)return')&&manager.includes('data-extension=\\"undo\\"')],
['extension uses canonical endpoint',runExtensionBody.includes("fetch('/api/v1/manager/extension'")],
['extension same row patch',manager.includes('mergeRowInPlace(auditId,x.patch)')],
['extension ambiguous response recovery',manager.includes('recoverExtension')&&manager.includes('rereadEnrichedAudit(auditId)')&&manager.includes('CANONICAL_EXTENSION_NOT_COMMITTED')],
['extension recovery never repeats write',recoverExtensionBody.length>0&&!recoverExtensionBody.includes('/api/v1/manager/extension')],
['extension no full reload',!manager.includes('location.reload(')],
['server bulk enrichment endpoint',r10.includes("u.pathname==='/api/v1/manager/open-enrichment'")],
['server extension endpoint',r10.includes("u.pathname==='/api/v1/manager/extension'")],
['server enrichment bridge',r10.includes("'externalmanageropenenriched'")],
['server extension bridge',r10.includes("'externalmanagerextension'")],
['bridge key never in browser',!manager.includes('bridgeKey')&&!html.includes('bridgeKey')],
['stable runtime chain',r10.includes("await import('./server-r9.js')")&&!r10.includes("await import('./server-r11.js')")],
['dense grid styling',html.includes('min-width:1900px')&&html.includes('.planning-chip')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('open-audits-grid2-contract-test passed');
