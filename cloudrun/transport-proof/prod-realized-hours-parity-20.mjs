// Read-only canonical realized-hours release assessment. Does not mutate data.
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL(file,import.meta.url),'utf8');
const route=read('./server-r12.js');
const portal=read('./manager-portal.js');
const start=route.indexOf("u.pathname==='/api/v1/manager/realized-hours-direct'");
const end=route.indexOf("u.pathname==='/api/v1/manager/audit'",start);
if(start<0||end<=start)throw Error('REALIZED_HOURS_ROUTE_NOT_FOUND');
const source=route.slice(start,end);
const tests=[
 ['PROD_DIRECT_ROUTE_DISABLED',source.includes("PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED")],
 ['MANAGER_AUTH_REQUIRED',source.includes('MANAGER_ROLE_REQUIRED')],
 ['COMPLETED_STATUS_REQUIRED',source.includes('AUDIT_NOT_COMPLETED')],
 ['SINGLE_AUDIT_ID_REQUIRED',source.includes('DUPLICATE_AUDIT_ID')],
 ['QUARTER_HOUR_PRECISION',source.includes('Math.round(hoursDedicated*4)/4')],
 ['CLIENT_SENDS_EXPECTED_HOURS',portal.includes('expectedHoursDedicated:')],
 ['SERVER_EXPECTED_HOURS_OPTIONAL',source.includes('body.expectedHoursDedicated!=null')],
 ['WRITES_AUDIT_TRAIL_TOGETHER',source.includes('updateCells:')&&source.includes('appendCells:')],
 ['IN_MEMORY_LOCK_ONLY',route.includes('const realizedHoursInFlight=new Set()')],
 ['SHEETS_BATCH_UPDATE',source.includes("fetch(root+':batchUpdate'")]
];
const failedSourceChecks=tests.filter(([,passed])=>!passed).map(([name])=>name);
const result={contract:'AMS_PROD_REALIZED_HOURS_PARITY',status:'NOT_READY',sourceChecksPassed:failedSourceChecks.length===0,failedSourceChecks,checks:Object.fromEntries(tests),missingProductionProof:['mandatory expected revision','cross-instance atomic compare-and-swap','canonical write ownership','authenticated audit trail parity','live E2E with concurrent requests'],note:'Source findings are not live evidence. Existing PROD fail-closed guard must remain until canonical parity is proven.'};
console.log(JSON.stringify(result,null,2));
