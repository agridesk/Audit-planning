import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const s=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');

const checks=[
  "const RUNTIME_ENV=clean(process.env.AMS_RUNTIME_ENV",
  "const DEV_MANAGER_EMAIL=clean(process.env.AMS_DEV_MANAGER_EMAIL",
  "const DEV_AUDITOR_EMAIL=clean(process.env.AMS_DEV_AUDITOR_EMAIL",
  "function portalLoginHtml()",
  "Login as Manager",
  "Login as Auditor",
  "No Apps Script page is used.",
  "if(RUNTIME_ENV!=='DEV')return sendJson(res,404",
  "function devIdentityForRole(role)",
  "const devTtl=2*60*60",
  "u.pathname==='/auth/dev-login'",
  "u.pathname==='/auth/logout'",
  "if(u.pathname==='/'&&req.method==='GET')",
  "if(!identity)return sendHtml(res,200,portalLoginHtml())"
];
for(const needle of checks)assert.ok(s.includes(needle),needle);
console.log(JSON.stringify({ok:true,build:'2026-10-04_PORTAL2_DIRECT_LOGIN_CONTRACT_R1',tests:checks.length,writesPerformed:false}));
