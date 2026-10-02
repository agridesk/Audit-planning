import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../ManagerPortal2.html',import.meta.url),'utf8');
const actions=readFileSync(new URL('../../AuditManagerActions.js',import.meta.url),'utf8');

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

has(entry,"if (a === 'manager2' || a === 'managerportal2') return 'manager2';",'manager2 normalization');
has(entry,"if (action === 'manager2') return 'Manager';",'manager2 role');
has(entry,"if (action === 'manager2') return 'AMS - Manager 2.0';",'manager2 title');
has(entry,"HtmlService.createTemplateFromFile('ManagerPortal2')",'manager2 GAS template route');
has(entry,"(action === 'manager' || action === 'manager2')",'manager2 DEV auth parity');

has(html,'google.script.run','top-level GAS runtime');
has(html,"gasCall('managerV5Action',[auditId,action,options||{}])",'direct lifecycle RPC');
has(html,"gasCall('getManagerV5Open',[])",'direct open read');
has(html,"gasCall('getManagerV5OpenEnriched',[])",'direct enriched read');
has(html,"gasCall('getManagerV5Archived',[])",'direct archive read');
has(html,"gasUrl('planningworkspace'",'GAS planning navigation');
has(html,'top-level-google-script-run','direct timing marker');
not(html,'fetch(','Cloud Run fetch removed');
not(html,'postMessage','relay message channel removed');
not(html,'ACTION_RELAY','relay action path removed');
not(html,'pollActionCanonical','canonical poll removed');
not(html,'rereadAudit','canonical action reread removed');

not(actions,'ManagerDiagnostics_RecordActionTiming(','sync diagnostics timing write removed from adapter');
has(actions,'actionTimingRecordedSynchronously = false','hot-path diagnostics marker');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-02_MANAGER2_TOP_LEVEL_GAS_R1',
  assertions:19,
  writesPerformed:false
},null,2));
