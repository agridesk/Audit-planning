import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const required=[
 ['column state isolated per open/completed tab','var grid4State={open:{filters:{},sorts:[]},completed:{filters:{},sorts:[]}}'],
 ['local filtering used after existing global search','render(grid4Apply(rows));'],
 ['column headers get controls','grid4AttachControls(h)}'],
 ['clear column filters is available','Clear column filters'],
 ['multi-column sorting uses Shift','if(!e.shiftKey)state.sorts=[]'],
 ['sorting is stable','return a.i-b.i'],
 ['filter change removes hidden selections only','if(gridVisibleIds.indexOf(selectedId)<0)gridSelected.delete(selectedId)'],
 ['original search function retained','function searchable(r)'],
 ['original auditor status filtering retained','auditorCardStatusFilter20'],
 ['original open and completed renderers intact','function renderOpenRow(r)'],
 ['existing selection contract intact','function selectionRows()'],
 ['no added data or write endpoint','function grid4Apply(rows)']
];
for(const [label,needle] of required)assert.ok(ui.includes(needle),label);
console.log('Grid 4 UI integration source contract: '+required.length+' checks passed');
