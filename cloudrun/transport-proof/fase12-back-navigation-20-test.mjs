import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for(const name of ['availability-my-calendar-20.html','availability-manager-calendar-20.html']){
 const html=readFileSync(new URL('./'+name,import.meta.url),'utf8');
 assert(html.includes('class="backToGrid" href="/">← Back to grid</a>'),name+' must return to grid');
 assert(html.includes('.backToGrid{display:inline-flex'),name+' must share back-button styling');
}
for(const name of ['notification-manager-20.html','rotation-manager-20.html']){
 const html=readFileSync(new URL('./'+name,import.meta.url),'utf8');
 assert(html.includes('class="backToGrid"'),name+' must use standard back button');
 assert(/href="\/"(?:[^>]*)>← Back to grid<\/a>/.test(html),name+' must return to grid');
}
const script=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
new vm.Script(script);
for(const term of ['ams-fase12-grid-return','sessionStorage.setItem(GRID_RETURN_STATE_KEY20','takeGridReturnState20()','restoreGridReturnState20(gridReturnState20)','grid4:JSON.parse','selected:selectionIds()']){
 assert(script.includes(term),'Missing grid state persistence: '+term);
}
console.log('PASS Fase 1.2 uniform back navigation and grid-state restoration contract');

const rotationJs=readFileSync(new URL('./rotation-manager-20.js',import.meta.url),'utf8');
assert(!rotationJs.includes("back.removeAttribute('href')"),'Auditor Rotation must retain the grid link');
assert(!rotationJs.includes('Close My Rotation'),'Role initialization must not replace standard back label');
