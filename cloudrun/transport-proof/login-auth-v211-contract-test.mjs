import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const normalize=s=>s.replace(/\r\n/g,'\n');
const login=normalize(readFileSync(new URL('../../LoginV5.html',import.meta.url),'utf8'));
const entry=normalize(readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8'));
const managerHandoff=normalize(readFileSync(new URL('../../zz_ExternalManagerSessionHandoff.js',import.meta.url),'utf8'));
const auditorHandoff=normalize(readFileSync(new URL('../../zzz_ExternalAuditorPlanningSessionHandoff.js',import.meta.url),'utf8'));
const r5=normalize(readFileSync(new URL('./server-r5.js',import.meta.url),'utf8'));

const checks=[
  [login,'BUILD: LOGIN_AUTH_2_0_P0_R1_20261004'],
  [login,'Login as Manager'],
  [login,'Login as Auditor'],
  [login,'destinationForRole_'],
  [login,'r === "Auditor" ? "auditorgrid2" : "manager"'],
  [login,'normalizeDestinationAction_'],
  [login,'__verifyInFlight'],
  [login,'normalized.length === 6'],
  [login,'ev.key === "Enter"'],
  [login,'continueBox.classList.add("hidden")'],
  [login,'__fallbackTimer = setTimeout(function(){\n      revealNavigationFallback_();\n    }, 1800)'],
  [entry,"if (!V5_ENTRY_isDevEnv_()) return false;"],
  [entry,"t.__testAuthEnabled=!!(runtimeEnv==='DEV'"],
  [managerHandoff,"runtimeEnv!=='DEV'"],
  [auditorHandoff,"runtimeEnv!=='DEV'"],
  [managerHandoff,'https://ams-transport-proof-510075419067.europe-west1.run.app/auth/signed-handoff'],
  [auditorHandoff,'https://ams-transport-proof-510075419067.europe-west1.run.app/auth/signed-handoff'],
  [r5,"AUDITOR_PORTAL_SESSION"],
  [r5,"roleKey==='manager'"],
  [r5,"role:'Auditor',location:'/'"]
];

for(const [source,needle] of checks)assert.ok(source.includes(needle),needle);
assert.ok(!login.includes('In PROD this must be enabled explicitly by backend configuration.'));
console.log(JSON.stringify({ok:true,build:'2026-10-04_LOGIN_AUTH_2_0_P0_CONTRACT_R1',tests:checks.length+1,writesPerformed:false}));
