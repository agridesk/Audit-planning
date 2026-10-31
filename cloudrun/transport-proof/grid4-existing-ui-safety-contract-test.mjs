// Phase 4: safety contract of current shared Grid. Read-only source assertions.
// Run locally with: node grid4-existing-ui-safety-contract-test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const checks=[
  ['existing global search remains',src.includes('function searchable(r)')&&src.includes('function filter(){')],
  ['auditor status card filter remains',src.includes('auditorCardStatusFilter20')],
  ['open and completed grids remain separate',src.includes('function renderOpenRow(r)')&&src.includes('function renderCompleted(rows)')],
  ['selected rows remain keyed by Audit ID internally',src.includes('var gridSelected=new Set()')&&src.includes('function selectionRows()')],
  ['select-visible action remains available',src.includes('function selectionSelectVisible(on)')],
  ['selected rows are cleared when changing view',src.includes('if(currentView!=="open")selectionClear()')&&src.includes('if(currentView!=="completed")selectionClear()')],
  ['current actions are preserved',src.includes('function bindActionButtons(root)')&&src.includes('function bindCompletedButtons(root)')],
  ['incremental row updates remain',src.includes('function replaceVisibleRow(')&&src.includes('function patchRowInPlace(')],
  ['passive refresh remains',src.includes('function passiveRefreshOpen()')],
  ['scope management remains separate',src.includes("fetch('/api/v1/manager/scopes'")],
  ['existing search input remains',html.includes('id="q"')],
  ['grid table header remains',src.includes('function renderHead()')],
];
for(const [label,ok] of checks)assert.ok(ok,label);
console.log('Grid 4 existing UI safety contract: '+checks.length+' checks passed');
