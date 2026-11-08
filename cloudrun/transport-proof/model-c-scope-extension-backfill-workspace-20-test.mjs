import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const js=read('./manager-portal.js'),server=read('./server-r4.js'),preview=read('./dev-ext-readonly-preview-20.mjs');
const begin=js.indexOf('function initExtStageWorkspace20(){');
const end=js.indexOf('const gridReturnState20=takeGridReturnState20();',begin);
assert(begin>0&&end>begin);
const ui=js.slice(begin,end);
for(const term of [
 "new URLSearchParams(window.location.search).get('ext-stage')!=='1'",
 "String(actorRole).toLowerCase()!=='manager'",
 "'/api/v1/manager/ext-model-c-source-preflight'",
 "'/api/v1/manager/ext-model-c-stage-status'",
 "source.writerFlags?.stageEnabled===true",
 "source.writerFlags?.commandsEnabled!==true",
 "source.checks?.devSourceFrozen===true",
 "stats.sourceObligations===199",
 "stats.activeAudits===105",
 "stats.activeLinks===155",
 "sha===target.sourceManifestSha256",
 "counts.obligation===0",
 "counts.auditcontext===0",
 "counts.event===0",
 "counts.outbox===0",
 "window.prompt(",
 "typed!=='STAGE 199 DEV'",
 "window.confirm(",
 "'/api/v1/manager/ext-model-c-stage'",
 "expectedSourceManifestSha256:sha",
 "writerEnabled:false"
])assert(ui.includes(term),'missing visible staging safeguard: '+term);
assert(js.includes('initExtStageWorkspace20();'),'manager session must initialize staging only when selected');
const s=server.slice(server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-stage-status'"),server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-stage'"));
assert(s.includes("req.method==='GET'")&&s.includes("sessionFromRequestValidated(req)")&&s.includes("clean(actor.role).toLowerCase()!=='manager'"));
assert(s.includes('store.verify(manifest)'),'status may inspect parity only');
assert(!s.includes('store.stage('),'status must never perform staging');
assert(preview.includes("'/api/v1/manager/ext-model-c-stage-status'"));
console.log('PASS manager-only stage workspace, typed approval, disabled default, exact parity and readback-only recovery');
