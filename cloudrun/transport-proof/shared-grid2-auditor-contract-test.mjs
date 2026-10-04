import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const entry=readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const login=readFileSync(new URL('../../LoginV5.html',import.meta.url),'utf8');
const handoff=readFileSync(new URL('../../zzz_ExternalAuditorPlanningSessionHandoff.js',import.meta.url),'utf8');

const checks=[
  [entry,"auditorgrid2"],
  [handoff,"action==='auditorgrid2'"],
  [handoff,"AUDITOR_PORTAL_SESSION"],
  [login,"'auditorgrid2'"],
  [r5,"AUDITOR_PORTAL_SESSION"],
  [r5,"location:'/'"],
  [r4,"async function auditorOpenRead"],
  [r4,"async function auditorArchivedRead"],
  [r4,"v211ActorCapabilities"],
  [r4,"rotationReadFromLoaded"],
  [r4,"role==='auditor'?await auditorOpenRead"],
  [html,'id="portalTitle">Audit Grid 2.0'],
  [ui,'var actorRole="Manager"'],
  [ui,'Auditor · Audit Grid 2.0'],
  [ui,"msg.type==='PLANNING_SAVED_V5'"],
  [ui,'if(String(actorRole).toLowerCase()==="auditor")return Promise.resolve()']
];

for(const [source,needle] of checks)assert.ok(source.includes(needle),needle);
console.log(JSON.stringify({ok:true,build:'2026-10-04_SHARED_GRID2_AUDITOR_PLANNING_SLICE_R1',tests:checks.length,writesPerformed:false}));
