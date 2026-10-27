// Read-only source evidence for the canonical locked Realized Hours bridge.
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const route=read('./server-r12.js');
const gas=read('../../EntryV5.js');
const owner=read('../../CompletionService.js');
const portal=read('./manager-portal.js');
const start=route.indexOf("u.pathname==='/api/v1/manager/realized-hours-direct'");
const end=route.indexOf("u.pathname==='/api/v1/manager/audit'",start);
if(start<0||end<=start)throw Error('REALIZED_HOURS_ROUTE_NOT_FOUND');
const source=route.slice(start,end);
const checks=[
 ['PROD_DIRECT_ROUTE_DISABLED',source.includes('PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED')],
 ['MANAGER_SESSION_REQUIRED',source.includes('innerSession(req)')&&source.includes('ROLE_FORBIDDEN')],
 ['QUARTER_HOUR_PRECISION',source.includes('Math.round(hoursDedicated*4)/4')],
 ['EXPECTED_VALUE_REQUIRED',source.includes('REALIZED_HOURS_EXPECTED_VALUE_REQUIRED')],
 ['CLIENT_SENDS_EXPECTED_HOURS',portal.includes('expectedHoursDedicated:')],
 ['USES_CANONICAL_GAS_BRIDGE',source.includes('externalrealizedhours20')&&gas.includes("rawAction==='externalrealizedhours20'")],
 ['CANONICAL_OWNER_UNDER_GAS_LOCK',owner.includes('function completionService_overrideCompletedHours_')&&owner.includes('LockService.getScriptLock()')],
 ['CANONICAL_EXPECTED_COMPARISON',owner.includes("code:'STALE_REALIZED_HOURS'")],
 ['NO_DIRECT_SHEETS_WRITE',!source.includes("fetch(root+':batchUpdate'")&&!source.includes('updateCells:')],
 ['NO_UNCERTAIN_WRITE_RETRY',source.includes('CANONICAL_REALIZED_HOURS_OUTCOME_UNCERTAIN')&&source.includes('safeToRetry:false')]
];
const failedSourceChecks=checks.filter(([,ok])=>!ok).map(([name])=>name);
console.log(JSON.stringify({contract:'AMS_PROD_REALIZED_HOURS_PARITY',status:'NOT_READY',sourceChecksPassed:failedSourceChecks.length===0,failedSourceChecks,checks:Object.fromEntries(checks),missingProductionProof:['GAS deployment/version proof','DEV end-to-end write/read parity','concurrent correction collision and stale-value rejection','audit-trail reliability/reconciliation','canonical integration approval'],note:'Static source checks do not authorize PROD release.'},null,2));
