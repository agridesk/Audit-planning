import assert from 'node:assert/strict';
import {compareReferenceMatrix20,createGridReferenceSource20,createReferenceTablesFirestoreStore20,createVersionedReferenceTableReader20,planReferenceTable20,referenceMatrix20} from './reference-tables-firestore-20.js';

// --- pure planning -------------------------------------------------------
const auditorValues=[['Auditor UID','Email','Role','',''],['U1','a@x','auditor'],[],['U2','b@x','manager','']];
const plan=planReferenceTable20('auditors',auditorValues);
assert.deepEqual(plan.headers,['Auditor UID','Email','Role']);
assert.deepEqual(plan.rows,[{key:'U1',rowIndex:1,cells:['U1','a@x','auditor']},{key:'U2',rowIndex:3,cells:['U2','b@x','manager']}]);
assert.equal(plan.counts.blankRows,1);assert.equal(plan.counts.blocked,0);
assert.match(plan.manifest,/^[0-9a-f]{64}$/);
assert.equal(planReferenceTable20('auditors',auditorValues).manifest,plan.manifest);
// Missing / duplicate / unsafe keys block the plan instead of silently dropping entities.
assert.equal(planReferenceTable20('auditors',[['Auditor UID'],['U1'],['U1']]).counts.duplicateKey,1);
assert.equal(planReferenceTable20('auditors',[['Auditor UID','Email'],['','x@y']]).counts.missingKey,1);
assert.equal(planReferenceTable20('companies',[['Company_UID'],['a/b']]).counts.invalidKey,1);
assert.throws(()=>planReferenceTable20('companies',[['Name'],['x']]),/REFERENCE_SOURCE_KEY_COLUMN_MISSING/);
assert.throws(()=>planReferenceTable20('config_scopes',Array.from({length:128},()=>['SlotKey'])),/REFERENCE_SOURCE_TRUNCATED/);
assert.throws(()=>planReferenceTable20('nope',[['x']]),/REFERENCE_TABLE_UNKNOWN/);

// Matrix rebuild is ordered by source row, bounded like a range read, and exact on parity.
const matrix=referenceMatrix20({headers:plan.headers,rows:[...plan.rows].reverse()});
assert.deepEqual(matrix,[['Auditor UID','Email','Role'],['U1','a@x','auditor'],['U2','b@x','manager']]);
assert.deepEqual(referenceMatrix20({headers:['A','B','C'],rows:[{rowIndex:1,cells:['1','','3']}]},{maxCols:2}),[['A','B'],['1']]);
assert.equal(compareReferenceMatrix20(auditorValues,matrix).equal,true);
assert.equal(compareReferenceMatrix20(auditorValues,[...matrix.slice(0,2),['U2','b@x','auditor']]).differing,1);

// --- Firestore store against an in-memory fake --------------------------
function fakeFirestore(){
 const docs=new Map(),calls=[];
 const id=url=>decodeURIComponent(url.split('/documents/')[1].split('?')[0]);
 const fetchImpl=async(url,{method='GET',body}={})=>{
  calls.push(method+' '+url.split('/documents')[1]);
  const res=(status,json)=>({ok:status<300,status,json:async()=>json});
  if(method==='POST'&&url.endsWith(':commit')){
   const {writes}=JSON.parse(body);
   for(const w of writes){const key=w.update.name.split('/documents/')[1];if(w.currentDocument?.exists===false&&docs.has(key))return res(409,{});}
   for(const w of writes){const key=w.update.name.split('/documents/')[1];docs.set(key,{name:w.update.name,fields:w.update.fields,updateTime:'t'+calls.length});}
   return res(200,{});
  }
  const path=id(url);
  if(path.split('/').length===2){const d=docs.get(path);return d?res(200,d):res(404,{});}
  const documents=[...docs.entries()].filter(([k])=>k.startsWith(path+'/')).map(([,d])=>d);
  return res(200,{documents});
 };
 return {docs,calls,fetchImpl};
}
const fs=fakeFirestore();
const store=createReferenceTablesFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>'t',fetchImpl:fs.fetchImpl});
assert.equal(await store.readMeta('auditors'),null);
await assert.rejects(store.backfillTable(plan,{expectedManifest:'0'.repeat(64)}),/REFERENCE_BACKFILL_MANIFEST_MISMATCH/);
await assert.rejects(store.backfillTable(planReferenceTable20('auditors',[['Auditor UID'],['U1'],['U1']]),{expectedManifest:plan.manifest}),/REFERENCE_BACKFILL_BLOCKED/);
assert.equal(fs.calls.filter(c=>c.startsWith('POST')).length,0,'blocked/mismatched plans never write');

// Resume: one identical row already present is skipped; meta is written last and create-only.
await fs.fetchImpl('https://x/documents:commit',{method:'POST',body:JSON.stringify({writes:[{update:{name:'projects/p/databases/(default)/documents/ams_reference_20_dev_auditors/U1',fields:{payload:{mapValue:{fields:{key:{stringValue:'U1'},rowIndex:{integerValue:'1'},cells:{arrayValue:{values:['U1','a@x','auditor'].map(stringValue=>({stringValue}))}}}}}}},currentDocument:{exists:false}}]})});
assert.deepEqual(await store.backfillTable(plan,{expectedManifest:plan.manifest}),{table:'auditors',written:1,skipped:1});
const meta=await store.readMeta('auditors');
assert.equal(meta.rowCount,2);assert.equal(meta.revision,1);assert.equal(meta.manifest,plan.manifest);
await assert.rejects(store.backfillTable(plan,{expectedManifest:plan.manifest}),/REFERENCE_BACKFILL_ALREADY_MIGRATED/);
const table=await store.readTable('auditors');
assert.deepEqual(referenceMatrix20(table),matrix);

// A differing pre-existing row aborts before any write.
const fs2=fakeFirestore(),store2=createReferenceTablesFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>'t',fetchImpl:fs2.fetchImpl});
await fs2.fetchImpl('https://x/documents:commit',{method:'POST',body:JSON.stringify({writes:[{update:{name:'projects/p/databases/(default)/documents/ams_reference_20_dev_auditors/U1',fields:{payload:{mapValue:{fields:{key:{stringValue:'U1'},rowIndex:{integerValue:'1'},cells:{arrayValue:{values:[{stringValue:'changed'}]}}}}}}}}]})});
await assert.rejects(store2.backfillTable(plan,{expectedManifest:plan.manifest}),/REFERENCE_BACKFILL_EXISTING_ROW_DIFFERS/);
assert.equal(fs2.calls.filter(c=>c.startsWith('POST')).length,1);

// Typed UNFORMATTED_VALUE cells (numbers, decimals, booleans) round-trip exactly.
const typedValues=[['SlotKey','Hours','Active','Factor'],['S1',8,true,1.5],['S2',0,false,'']];
const typedPlan=planReferenceTable20('config_scopes',typedValues),fs3=fakeFirestore();
const store3=createReferenceTablesFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>'t',fetchImpl:fs3.fetchImpl});
await store3.backfillTable(typedPlan,{expectedManifest:typedPlan.manifest});
assert.deepEqual(referenceMatrix20(await store3.readTable('config_scopes')),[['SlotKey','Hours','Active','Factor'],['S1',8,true,1.5],['S2',0,false]]);
assert.equal(compareReferenceMatrix20(typedValues,referenceMatrix20(await store3.readTable('config_scopes'))).equal,true);
assert.equal(compareReferenceMatrix20(typedValues,[typedValues[0],['S1','8',true,1.5],['S2',0,false]]).equal,false,'type drift is a parity difference');

// --- revision-validated reader ------------------------------------------
let revision=1,loads=0;
const fakeStore={
 readMeta:async t=>t==='missing'?null:{revision,updateTime:'u'+revision,headers:['K'],rowCount:1},
 readTable:async()=>{loads++;return {meta:{revision,updateTime:'u'+revision},headers:['K'],rows:[{key:'a',rowIndex:1,cells:['a'+revision]}]};}
};
const read=createVersionedReferenceTableReader20(fakeStore);
const first=await read('companies');assert.equal(await read('companies'),first);assert.equal(loads,1);
assert.ok(Object.isFrozen(first.rows[0].cells));
revision=2;assert.equal((await read('companies')).rows[0].cells[0],'a2');assert.equal(loads,2);
await assert.rejects(read('missing'),/REFERENCE_TABLE_NOT_MIGRATED/);

// --- Grid source: same order and widths as the Sheets batchGet ----------
const wide=Array.from({length:60},(_,i)=>'H'+i);
const grid=createGridReferenceSource20(async t=>({headers:wide,rows:[{key:t,rowIndex:1,cells:wide.map(()=>t)}]}));
const [scopes,companies,auditors]=await grid();
assert.equal(scopes.values[1][0],'config_scopes');assert.equal(companies.values[1][0],'companies');assert.equal(auditors.values[1][0],'auditors');
assert.equal(scopes.values[0].length,26);assert.equal(companies.values[0].length,52);assert.equal(auditors.values[0].length,26);
console.log('reference-tables-firestore-20-test: ok');
