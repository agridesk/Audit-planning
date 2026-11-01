import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
function section(start,end){const a=r4.indexOf(start),b=r4.indexOf(end,a+1);assert(a>=0&&b>a);return r4.slice(a,b)}
const manager=section('async function managerArchivedRead(', 'async function auditorArchivedRead(');
const auditor=section('async function auditorArchivedRead(', 'function rotationLooseKey(');
for(const [label,code] of [['manager',manager],['auditor',auditor]]){
 assert(code.includes('gridScopeStyles20(vr[1]?.values||[])'),label+' Completed must have Config_Scopes colors');
 assert(code.includes('scopeStyles'),label+' Completed must expose scopeStyles per row');
}
assert(ui.includes('function grid4ScopeBadges(r)')&&ui.includes('function renderCompleted(rows)'));
assert(ui.includes('grid4ScopeBadges(r)'),'Completed uses same badge renderer');
const companies=section("if(u.pathname==='/api/v1/auditor/company-management'","if(u.pathname==='/api/v1/manager/company-management'");
assert(companies.includes("'Audit planning!A1:BW2500'"),'current audits contribute auditor company membership');
assert(companies.includes("'Log realized audits!A1:AZ2500'"),'Completed audits contribute auditor company membership');
assert(companies.includes("['Assigned to','Assigned auditor','Auditor']"),'assigned audit ownership checked');
assert(companies.includes("['Preassigned Auditor']"),'preassigned audit ownership checked');
assert(companies.includes('directResolveAuditorEmail'), 'auditor identity must be resolved server side');
assert(companies.includes('result.companies=result.companies.filter'), 'no unauthorised company returned');
console.log('PASS completed scope colors for both roles and company membership source including history');
