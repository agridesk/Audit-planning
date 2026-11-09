import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
assert.match(ui,/var saveAll=el\('button','Save all'\)/);
assert.match(ui,/pendingEdits\.filter\(function\(e\)/);
assert.match(ui,/All changes saved/);
assert.match(ui,/if\(!changes\.length\)/);
assert.match(ui,/reason:'Manager Scope Management tab update'|var reason='Manager Scope Management tab update'/);
assert.match(ui,/scopeManagement20Panel"\)\.hidden/);
assert.match(ui,/search\.oninput=render/);
assert.doesNotMatch(ui,/prompt\('Reason for policy change:'\)/);
assert.doesNotMatch(ui,/prompt\('Reason for setting official scheme version:'\)/);
assert.doesNotMatch(ui,/confirm\('Set official scheme version /);
assert.match(ui,/reason='Manager updated official scheme version'/);
assert.match(ui,/\['TRUE','YES','1'\]\.includes\(initial\.trim\(\)\.toUpperCase\(\)\)/);
assert.match(ui,/value:item\.input\.value\.trim\(\)/,'Scope editor must submit canonical TRUE/FALSE rather than Yes/No');
assert.doesNotMatch(ui,/item\.input\.value==='TRUE'\?'Yes':'No'/,'Scope editor must not serialize booleans as Yes/No strings');
assert.match(ui,/\['Rotation limit',selected\.rotationLimit\],\['Rotation applies',p\.Rotation_Applies\],\['Plus-one permitted',p\.Rotation_Plus_One_Permitted\]/);
assert.match(ui,/'Rotation limit':'Rotation_Normal_Maximum'/);
assert.match(ui,/'Rotation applies':'Rotation_Applies'/);
assert.match(ui,/'Plus-one permitted':'Rotation_Plus_One_Permitted'/);
const preflightStart=ui.indexOf('var currentValue=String(impact.current??');
const preflightEnd=ui.indexOf('impacts.push({field:e.field,impact:impact});',preflightStart);
assert.ok(preflightStart>=0&&preflightEnd>preflightStart,'Canonical scope preflight block must exist');
const preflight=new Function('impact','e',ui.slice(preflightStart,preflightEnd)+'return true;');
for(const entry of [
 {field:'Recurring',current:'NO',initial:'NO'},
 {field:'Recurring',current:'YES',initial:'YES'},
 {field:'Active',current:true,initial:'TRUE'},
 {field:'Archived',current:'No',initial:'FALSE'},
 {field:'Rotation_Applies',current:false,initial:'FALSE'},
 {field:'Rotation_Plus_One_Permitted',current:'Yes',initial:'TRUE'},
 {field:'Planning from',current:-4,initial:'-4'},
 {field:'Max_Offsite_Hours',current:2,initial:'2'}
])assert.equal(preflight({current:entry.current},{field:entry.field,initial:entry.initial}),true,entry.field);
assert.throws(()=>preflight({current:'YES'},{field:'Recurring',initial:'NO'}),/STALE_SCOPE_POLICY/);
assert.throws(()=>preflight({current:false},{field:'Active',initial:'TRUE'}),/STALE_SCOPE_POLICY/);
assert.match(ui,/SCOPE_SAVE_READBACK_MISSING/);
assert.match(ui,/SCOPE_SAVE_READBACK_MISMATCH/);
const readbackStart=ui.indexOf('function scopeSavedValueMatches(');
const readbackEnd=ui.indexOf('function showDetails()',readbackStart);
assert.ok(readbackStart>=0&&readbackEnd>readbackStart,'Readback comparator must exist');
const matches=new Function(ui.slice(readbackStart,readbackEnd)+'return scopeSavedValueMatches;')();
for(const c of [
 ['Active',true,'TRUE',true],['Archived',false,'FALSE',true],
 ['Rotation_Applies',true,'YES',true],['Rotation_Plus_One_Permitted','No','FALSE',true],
 ['Rotation_Normal_Maximum',3,'3',true],['Min_Interval_Months',7,'7',true],
 ['Planning from',-4,'-4',true],['Planning to',-1,'-1',true],
 ['Recurring','NO','NO',true],['Extension',4,'4',true],
 ['Obligation cycle','ANNUAL','ANNUAL',true],['Complete by','12-31','12-31',true],
 ['Provisioning source','ECAS','ECAS',true],['Trigger source','ECAS','ECAS',true],
 ['Source service','MPS-ABC','MPS-ABC',true],['DisplayName','Scheme','Scheme',true],
 ['SortOrder',81,'81',true],['Color','#64748B','#64748B',true],
 ['Active',false,'TRUE',false],['Recurring','NO','YES',false],['SortOrder',81,'82',false]
])assert.equal(matches(c[0],c[1],c[2]),c[3],c[0]+' readback comparison');
console.log('scope-management-tab-save-contract: 12 checks passed');
