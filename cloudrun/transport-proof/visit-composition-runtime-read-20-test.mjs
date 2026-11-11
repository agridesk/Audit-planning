import assert from 'node:assert/strict';
import {createVisitCompositionCanonicalReader20} from './visit-composition-canonical-reader-20.mjs';
import {createVisitCompositionOverview20} from './visit-composition-overview-20.mjs';
const readings=[];
const data={
 'Audit planning!A1:BW2000':[['Audit ID','Company_UID','Status'],['A1','C1','Pending Planning']],
 'Audit_Obligations!A1:AA5000':[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State'],['O1','C1','GAP',8,'OPEN'],['O2','C1','GRASP',3,'OPEN']],
 'Audit_Visit_Obligations!A1:H5000':[['Audit_ID','Obligation_ID','Link_State','Linked_At','Unlinked_At'],['A1','O1','ACTIVE','2026-01-01',''],['A1','O2','ACTIVE','2026-01-01','']],
 'Audit_Visit_Obligations!A5:H5':[]
};
const readRange=async range=>{readings.push(range);if(!(range in data))throw Error('UNEXPECTED_RANGE');return structuredClone(data[range]);};
const reader=createVisitCompositionCanonicalReader20({readRange});
const overview=createVisitCompositionOverview20({reader});
data['Audit_Visit_Obligations!A1:H5000'][0][4]='';
await assert.rejects(()=>reader.read(),/COMPOSITION_READER_LINKS_SCHEMA_MISSING/);
data['Audit_Visit_Obligations!A1:H5000'][0][4]='Unlinked_At';
data['Audit_Obligations!A1:AA5000'][0][1]='Obligation_ID';
await assert.rejects(()=>reader.read(),/COMPOSITION_READER_OBLIGATIONS_SCHEMA_MISSING|COMPOSITION_READER_OBLIGATIONS_DUPLICATE_HEADERS/);
data['Audit_Obligations!A1:AA5000'][0][1]='Company_UID';
const r=await overview.inspect({auditId:'A1'});
assert.equal(r.ok,true);assert.equal(r.totalRequiredMinutes,660);
assert.equal(r.compositionRequired,true);assert.equal(r.writeEnabled,false);
assert.deepEqual(r.availableModes,['TOGETHER','SEPARATELY']);
assert.equal(readings.length,9);
assert.deepEqual((await reader.read({appendRowNumbers:[5]})).emptyAppendRows,[{row:5,before:[]}]);
assert.equal(readings.at(-1),'Audit_Visit_Obligations!A5:H5');
const expectedError=async (f,code)=>await assert.rejects(f,e=>e.code===code,code);
data['Audit_Visit_Obligations!A5:H5']=[['occupied']];
await expectedError(()=>reader.read({appendRowNumbers:[5]}),'COMPOSITION_READER_APPEND_ROW_OCCUPIED');
data['Audit_Visit_Obligations!A5:H5']=[];
data['Audit_Visit_Obligations!A1:H5000'].push(['OTHER','O2','ACTIVE','2026-01-01','']);
await expectedError(()=>overview.inspect({auditId:'A1'}),'VISIT_OVERVIEW_DUPLICATE_ACTIVE_LINK');
data['Audit_Visit_Obligations!A1:H5000'].pop();
data['Audit planning!A1:BW2000'][1][1]='OTHER';
await expectedError(()=>overview.inspect({auditId:'A1'}),'VISIT_OVERVIEW_COMPANY_PARITY_CONFLICT');
data['Audit planning!A1:BW2000'][1][1]='C1';
data['Audit_Visit_Obligations!A1:H5000'].pop();
const single=await overview.inspect({auditId:'A1'});
assert.deepEqual(single.availableModes,['SINGLE']);
assert.equal(single.totalRequiredMinutes,480);
console.log('VISIT_COMPOSITION_RUNTIME_READ_20_PASS: canonical three-tab reads, independent empty rows, active links and read-only overview');
