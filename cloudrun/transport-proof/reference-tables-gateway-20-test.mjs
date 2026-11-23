import assert from 'node:assert/strict';
import {REFERENCE_TABLES_20,compareReferenceMatrix20,createReferenceTablesFirestoreStore20,createVersionedReferenceTableReader20,planReferenceTable20,referenceMatrix20} from './reference-tables-firestore-20.js';
import {applyReferenceWrite20,createReferenceTablesGateway20,parseA1Range20,planReferenceWrite20,referenceRangeValues20} from './reference-tables-gateway-20.js';

// --- pure A1 parsing -------------------------------------------------------
assert.deepEqual(parseA1Range20('Companies!E84'),{sheet:'Companies',startRow:83,startCol:4,endRow:84,endCol:5});
assert.deepEqual(parseA1Range20("'Audit planning'!A1:BW2000"),{sheet:'Audit planning',startRow:0,startCol:0,endRow:2000,endCol:75});
assert.deepEqual(parseA1Range20('Auditors!A:K'),{sheet:'Auditors',startRow:0,startCol:0,endRow:null,endCol:11});
assert.deepEqual(parseA1Range20('Auditors'),{sheet:'Auditors',startRow:0,startCol:0,endRow:null,endCol:null});
assert.equal(parseA1Range20('Auditors!A0').invalid,true);

// --- pure translation: fail closed on anything not provably translatable ---
const titles=new Map([[11,'Auditors'],[12,'Companies'],[13,'Config_Scopes'],[20,'Audit planning']]);
const plan=(path,body,method='POST',query='')=>planReferenceWrite20({path,method,query:new URLSearchParams(query),body,sheetTitles:titles});
const refusedWith=(fn,code)=>assert.throws(fn,e=>e.code===code);
refusedWith(()=>plan(':batchUpdate',{requests:[{deleteDimension:{range:{sheetId:11,dimension:'ROWS',startIndex:3,endIndex:4}}}]}),'REFERENCE_GATEWAY_REQUEST_UNSUPPORTED_deleteDimension');
refusedWith(()=>plan(':batchUpdate',{requests:[{updateCells:{start:{sheetId:13,rowIndex:1,columnIndex:2},rows:[{values:[{userEnteredValue:{formulaValue:'=1+1'}}]}],fields:'userEnteredValue'}}]}),'REFERENCE_GATEWAY_STRUCTURAL_VALUE_UNSUPPORTED');
refusedWith(()=>plan('/values:batchClear',{ranges:['Auditors!A2:Z2']}),'REFERENCE_GATEWAY_CLEAR_UNSUPPORTED');
refusedWith(()=>plan('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:[{range:'Auditors!A2:B2',majorDimension:'COLUMNS',values:[['x']]}]}),'REFERENCE_GATEWAY_MAJOR_DIMENSION_UNSUPPORTED');
refusedWith(()=>plan('/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:[{range:'Auditors!A2',values:[['x','y']]}]}),'REFERENCE_GATEWAY_VALUES_EXCEED_RANGE');
// Non-reference tabs, grid growth and pure formatting are not reference writes.
assert.equal(plan('/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Audit planning!A2:B2',values:[['x']]}]}),null);
assert.equal(plan(':batchUpdate',{requests:[{appendDimension:{sheetId:11,dimension:'COLUMNS',length:1}},{updateCells:{start:{sheetId:20,rowIndex:1,columnIndex:0},rows:[{values:[{userEnteredValue:{stringValue:'x'}}]}],fields:'userEnteredValue'}}]}),null);
assert.equal(plan(':batchUpdate',{requests:[{repeatCell:{range:{sheetId:13,startRowIndex:1,endRowIndex:2},cell:{userEnteredFormat:{}},fields:'userEnteredFormat'}}]}),null);
// Range-form updateCells clears unspecified cells of the range, like Sheets does.
const rangeItems=plan(':batchUpdate',{requests:[{updateCells:{range:{sheetId:12,startRowIndex:2,endRowIndex:3,startColumnIndex:1,endColumnIndex:3},rows:[{values:[{userEnteredValue:{numberValue:7}}]}],fields:'userEnteredValue'}}]}).items.get('companies')[0].cells;
assert.deepEqual(rangeItems,[{row:2,col:1,value:7},{row:2,col:2,value:''}]);

// --- pure apply: identity rules -------------------------------------------
const snap={headers:['Auditor UID','Email','Role'],rows:[{key:'U1',rowIndex:1,cells:['U1','a@x','auditor']},{key:'U2',rowIndex:3,cells:['U2','b@x','manager']}]};
const cellsItem=cells=>[{type:'cells',cells}];
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:1,col:0,value:'U9'}])),'REFERENCE_GATEWAY_KEY_CHANGE_UNSUPPORTED');
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:3,col:0,value:''},{row:3,col:1,value:''},{row:3,col:2,value:''}])),'REFERENCE_GATEWAY_ROW_CLEAR_UNSUPPORTED');
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:0,col:1,value:'Mail'}])),'REFERENCE_GATEWAY_HEADER_CHANGE_UNSUPPORTED');
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:2,col:0,value:'U1'}])),'REFERENCE_GATEWAY_KEY_DUPLICATE');
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:2,col:1,value:'no-key@x'}])),'REFERENCE_GATEWAY_KEY_INVALID');
refusedWith(()=>applyReferenceWrite20('auditors',snap,cellsItem([{row:1,col:52,value:'x'}])),'REFERENCE_GATEWAY_COLUMN_OUT_OF_RANGE');
const appended=applyReferenceWrite20('auditors',snap,[{type:'append',startCol:0,rowCount:1,cells:[{row:0,col:0,value:'U3'},{row:0,col:1,value:'c@x'}]}]);
assert.deepEqual(appended.appended,[{start:4,count:1}]);
assert.deepEqual(appended.puts,[{row:{key:'U3',rowIndex:4,cells:['U3','c@x']},create:true}]);
assert.equal(appended.rowCount,3);
// Unchanged writes produce no puts; header extension is allowed.
assert.equal(applyReferenceWrite20('auditors',snap,cellsItem([{row:1,col:1,value:'a@x'}])).puts.length,0);
assert.deepEqual(applyReferenceWrite20('auditors',snap,cellsItem([{row:0,col:3,value:'Phone'}])).headers,['Auditor UID','Email','Role','Phone']);
// Positional range values are Sheets-shaped: blank rows inside as [], bounds respected.
assert.deepEqual(referenceRangeValues20(snap,parseA1Range20('Auditors!A1:B500')),[['Auditor UID','Email'],['U1','a@x'],[],['U2','b@x']]);
assert.deepEqual(referenceRangeValues20(snap,parseA1Range20('Auditors!C4')),[['manager']]);
assert.deepEqual(referenceRangeValues20(snap,parseA1Range20('Auditors!B3:C3')),[]);

// --- fakes ------------------------------------------------------------------
const SID='SID1',BASE='https://sheets.googleapis.com/v4/spreadsheets/'+SID;
const blankCell=v=>v===undefined||v===null||v==='';
function fakeSheets(initial){
 const grid=new Map(Object.entries(initial).map(([k,v])=>[k,v.map(r=>[...r])])),ids=new Map([['Auditors',11],['Companies',12],['Config_Scopes',13],['Audit planning',20]]);
 const calls=[],state={failWrites:0,appendOffset:0};
 const rows=s=>{if(!grid.has(s))grid.set(s,[]);return grid.get(s);};
 const setCell=(s,r,c,v)=>{const g=rows(s);while(g.length<=r)g.push([]);while(g[r].length<=c)g[r].push('');g[r][c]=v;};
 // Fake Sheets rendering: locale decimals and booleans parse under USER_ENTERED.
 const render=(v,mode)=>{if(mode==='RAW'||typeof v!=='string')return v;if(v.startsWith("'"))return v.slice(1);if(/^(TRUE|FALSE)$/i.test(v))return /^t/i.test(v);if(/^-?\d+([.,]\d+)?$/.test(v))return Number(v.replace(',','.'));return v;};
 const read=range=>{
  const p=parseA1Range20(range),g=rows(p.sheet),out=[];
  for(let r=p.startRow;r<(p.endRow??g.length)&&r<g.length;r++){const row=(g[r]||[]).slice(p.startCol,p.endCol??undefined);while(row.length&&blankCell(row[row.length-1]))row.pop();out.push(row);}
  while(out.length&&!out[out.length-1].length)out.pop();
  return out;
 };
 const lastData=s=>{const g=rows(s);for(let r=g.length-1;r>=0;r--)if((g[r]||[]).some(v=>!blankCell(v)))return r;return -1;};
 const res=(status,json)=>new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json'}});
 const fetchImpl=async(input,init={})=>{
  const u=new URL(String(input)),method=(init.method||'GET').toUpperCase(),path=u.pathname.slice(('/v4/spreadsheets/'+SID).length);
  calls.push(method+' '+decodeURIComponent(path));
  if(method==='GET'&&path==='')return res(200,{sheets:[...ids].map(([title,sheetId])=>({properties:{sheetId,title}}))});
  if(method==='GET'&&path==='/values:batchGet')return res(200,{spreadsheetId:SID,valueRanges:u.searchParams.getAll('ranges').map(r=>{const v=read(r);return {range:r,majorDimension:'ROWS',...(v.length?{values:v}:{})};})});
  if(state.failWrites){state.failWrites--;return res(500,{error:{code:500}});}
  const body=init.body?JSON.parse(init.body):{};
  if(path==='/values:batchUpdate'){for(const d of body.data){const p=parseA1Range20(d.range);d.values.forEach((row,i)=>row.forEach((v,j)=>{if(v!==null)setCell(p.sheet,p.startRow+i,p.startCol+j,render(v,body.valueInputOption));}));}return res(200,{totalUpdatedCells:1});}
  let m;
  if((m=/^\/values\/(.+):append$/.exec(path))){const p=parseA1Range20(decodeURIComponent(m[1])),start=lastData(p.sheet)+1+state.appendOffset;body.values.forEach((row,i)=>row.forEach((v,j)=>setCell(p.sheet,start+i,p.startCol+j,render(v,u.searchParams.get('valueInputOption')))));return res(200,{updates:{updatedRange:p.sheet+'!A'+(start+1)+':Z'+(start+body.values.length)}});}
  if(method==='PUT'){const p=parseA1Range20(decodeURIComponent(path.slice(8)));body.values.forEach((row,i)=>row.forEach((v,j)=>{if(v!==null)setCell(p.sheet,p.startRow+i,p.startCol+j,render(v,u.searchParams.get('valueInputOption')));}));return res(200,{updatedCells:1});}
  if(path===':batchUpdate'){
   const title=id=>[...ids].find(([,v])=>v===id)[0],val=c=>{const x=c?.userEnteredValue||{};return x.stringValue??x.numberValue??x.boolValue??'';};
   for(const req of body.requests){
    if(req.updateCells){const s=req.updateCells.start;req.updateCells.rows.forEach((row,i)=>row.values.forEach((c,j)=>setCell(title(s.sheetId),s.rowIndex+i,s.columnIndex+j,val(c))));}
    if(req.appendCells){const s=title(req.appendCells.sheetId),start=lastData(s)+1;req.appendCells.rows.forEach((row,i)=>row.values.forEach((c,j)=>setCell(s,start+i,j,val(c))));}
   }
   return res(200,{replies:[]});
  }
  return res(400,{error:{code:400}});
 };
 return {fetchImpl,calls,state,read,grid};
}
function fakeStore(initial,order){
 const tables=new Map(),stale=new Map();let clock=0,conflicts=0;
 for(const [table,values] of Object.entries(initial)){const p=planReferenceTable20(table,values);tables.set(table,{meta:{table,headers:p.headers,rowCount:p.rows.length,revision:1,manifest:p.manifest,updateTime:'t'+(++clock)},rows:new Map(p.rows.map(r=>[r.key,structuredClone(r)]))});}
 const api={
  commits:0,
  injectConflicts(n){conflicts=n;},
  async readMeta(table){const t=tables.get(table);if(!t)return null;return {...structuredClone(t.meta),...(stale.has(table)?{stale:true,staleReason:stale.get(table)}:{})};},
  async readTable(table){const t=tables.get(table);if(!t)return null;return {meta:await api.readMeta(table),headers:[...t.meta.headers],rows:[...t.rows.values()].map(r=>structuredClone(r))};},
  async commitChanges(changes){
   order.push('FIRESTORE_COMMIT');
   if(conflicts>0){conflicts--;throw Error('REFERENCE_FIRESTORE_CONFLICT');}
   for(const c of changes){const t=tables.get(c.table);if(t.meta.updateTime!==c.meta.updateTime)throw Error('REFERENCE_FIRESTORE_CONFLICT');for(const p of c.puts||[])if(t.rows.has(p.row.key)!==!p.create)throw Error('REFERENCE_FIRESTORE_CONFLICT');}
   api.commits++;
   return changes.map(c=>{const t=tables.get(c.table);for(const p of c.puts||[])t.rows.set(p.row.key,structuredClone(p.row));for(const k of c.deletes||[])t.rows.delete(k);t.meta={...t.meta,headers:c.headers,rowCount:c.rowCount,revision:c.meta.revision+1,updateTime:'t'+(++clock)};return {table:c.table,revision:t.meta.revision,updateTime:t.meta.updateTime};});
  },
  async markStale(table,reason){stale.set(table,reason);tables.get(table).meta.updateTime='t'+(++clock);},
  stale,tables
 };
 return api;
}
const initialSheets=()=>({
 Auditors:[['Auditor UID','Email','Role'],['U1','a@x','auditor'],[],['U2','b@x','manager']],
 Companies:[['Company_UID','Name','Hours'],['C1','Acme',2],['C2','Beta',3]],
 Config_Scopes:[['SlotKey','Code','Active'],['S1','IFS',true]],
 'Audit planning':[['Audit ID'],['A1']]
});
async function setup(){
 const order=[],sheets=fakeSheets(initialSheets()),store=fakeStore(Object.fromEntries(['auditors','companies','config_scopes'].map(t=>[t,initialSheets()[REFERENCE_TABLES_20[t].sheet]])),order);
 const logs=[],sheetsFetch=async(i,init)=>{if(String(i).includes('sheets.googleapis.com')&&(init?.method||'GET')!=='GET')order.push('SHEETS_WRITE');return sheets.fetchImpl(i,init);};
 const gw=createReferenceTablesGateway20({spreadsheetId:SID,store,fetchImpl:sheetsFetch,readEnabled:true,log:x=>logs.push(x)});
 // Full-table parity: what Sheets holds equals what Firestore serves.
 const parity=async table=>{const t=await store.readTable(table);return compareReferenceMatrix20(sheets.read(REFERENCE_TABLES_20[table].range),referenceMatrix20(t)).equal;};
 return {order,sheets,store,gw,logs,parity};
}
const post=(gw,path,body,query='')=>gw.fetch(BASE+path+query,{method:'POST',headers:{authorization:'Bearer x','content-type':'application/json'},body:JSON.stringify(body)});

// --- values:batchUpdate: Firestore commits before Sheets; read-back canonicalizes rendering ---
{
 const {order,sheets,store,gw,parity}=await setup();
 const r=await post(gw,'/values:batchUpdate',{valueInputOption:'USER_ENTERED',data:[{range:'Companies!C2:C2',values:[['1,5']]},{range:'Audit planning!A2',values:[['A9']]}]});
 assert.equal(r.status,200);
 assert.deepEqual(order.slice(0,2),['FIRESTORE_COMMIT','SHEETS_WRITE']);
 assert.equal(store.tables.get('companies').rows.get('C1').cells[2],1.5); // '1,5' emulated as string, read-back made it 1.5
 assert.equal(store.tables.get('companies').meta.revision,3);
 assert.ok(await parity('companies'));
 assert.equal(sheets.read('Audit planning!A2')[0][0],'A9'); // non-reference part forwarded untouched
 assert.equal(gw.stats().canonicalized,1);
}
// --- values append + PUT; unchanged write does not commit ---
{
 const {store,gw,parity,sheets}=await setup();
 let r=await post(gw,'/values/'+encodeURIComponent('Auditors!A:C')+':append',{values:[['U3','c@x','auditor']]},'?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS');
 assert.equal(r.status,200);
 assert.deepEqual(store.tables.get('auditors').rows.get('U3'),{key:'U3',rowIndex:4,cells:['U3','c@x','auditor']});
 assert.equal(store.tables.get('auditors').meta.rowCount,3);
 r=await gw.fetch(BASE+'/values/'+encodeURIComponent('Companies!B3')+'?valueInputOption=RAW',{method:'PUT',headers:{authorization:'Bearer x'},body:JSON.stringify({values:[['Beta BV']]})});
 assert.equal(r.status,200);
 assert.ok(await parity('auditors'));assert.ok(await parity('companies'));
 const commits=store.commits;
 await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Companies!B3',values:[['Beta BV']]}]});
 assert.equal(store.commits,commits);
 assert.equal(sheets.read('Companies!B3')[0][0],'Beta BV');
}
// --- structural writes (scope modules / auditor create): typed cells, append, header extension ---
{
 const {store,gw,parity}=await setup();
 const cell=v=>({userEnteredValue:typeof v==='boolean'?{boolValue:v}:typeof v==='number'?{numberValue:v}:{stringValue:v}});
 const r=await post(gw,':batchUpdate',{requests:[
  {appendDimension:{sheetId:13,dimension:'COLUMNS',length:1}},
  {updateCells:{start:{sheetId:13,rowIndex:0,columnIndex:3},rows:[{values:[cell('Official_Scheme_Version')]}],fields:'userEnteredValue'}},
  {updateCells:{start:{sheetId:13,rowIndex:1,columnIndex:2},rows:[{values:[cell(false)]}],fields:'userEnteredValue'}},
  {appendCells:{sheetId:13,rows:[{values:['S2','BRC',true].map(cell)}],fields:'userEnteredValue'}}
 ]});
 assert.equal(r.status,200);
 const t=store.tables.get('config_scopes');
 assert.deepEqual(t.meta.headers,['SlotKey','Code','Active','Official_Scheme_Version']);
 assert.deepEqual(t.rows.get('S1').cells,['S1','IFS',false]);
 assert.deepEqual(t.rows.get('S2'),{key:'S2',rowIndex:2,cells:['S2','BRC',true]});
 assert.ok(await parity('config_scopes'));
}
// --- Sheets failure reverts Firestore; the caller still sees the Sheets error ---
{
 const {sheets,store,gw,parity}=await setup();
 sheets.state.failWrites=1;
 const r=await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Companies!B2',values:[['Changed']]},{range:'Companies!A4:C4',values:[['C3','Gamma',1]]}]});
 assert.equal(r.status,500);
 const t=store.tables.get('companies');
 assert.equal(t.rows.get('C1').cells[1],'Acme');assert.equal(t.rows.has('C3'),false);
 assert.equal(t.meta.revision,3);assert.equal(t.meta.rowCount,2);
 assert.equal(store.stale.size,0);assert.equal(gw.stats().reverted,1);
 assert.ok(await parity('companies'));
}
// --- precondition conflict retries on a fresh snapshot ---
{
 const {store,gw,parity}=await setup();
 store.injectConflicts(1);
 const r=await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Auditors!B2',values:[['a2@x']]}]});
 assert.equal(r.status,200);
 assert.equal(store.tables.get('auditors').rows.get('U1').cells[1],'a2@x');
 assert.ok(await parity('auditors'));
}
// --- refusals write nothing anywhere ---
{
 const {order,store,gw}=await setup();
 let r=await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Auditors!A2',values:[['U9']]}]});
 assert.equal(r.status,409);assert.equal((await r.json()).error.message,'REFERENCE_GATEWAY_KEY_CHANGE_UNSUPPORTED');
 r=await post(gw,':batchUpdate',{requests:[{deleteDimension:{range:{sheetId:12,dimension:'ROWS',startIndex:1,endIndex:2}}}]});
 assert.equal(r.status,409);
 assert.deepEqual(order,[]);assert.equal(store.commits,0);
}
// --- Firestore unavailable before the write: 503, Sheets untouched ---
{
 const {order,store,gw,sheets}=await setup();
 store.commitChanges=async()=>{throw Error('REFERENCE_FIRESTORE_COMMIT_503');};
 const r=await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Companies!B2',values:[['X']]}]});
 assert.equal(r.status,503);assert.ok(!order.includes('SHEETS_WRITE'));
 assert.equal(sheets.read('Companies!B2')[0][0],'Acme');
}
// --- append landing elsewhere than predicted marks the table stale; readers refuse it ---
{
 const {sheets,store,gw}=await setup();
 sheets.state.appendOffset=1;
 const r=await post(gw,'/values/'+encodeURIComponent('Auditors!A:C')+':append',{values:[['U3','c@x','auditor']]},'?valueInputOption=RAW');
 assert.equal(r.status,200);
 assert.equal(store.stale.get('auditors'),'APPEND_POSITION_MISMATCH');
 await assert.rejects(createVersionedReferenceTableReader20(store)('auditors'),/REFERENCE_TABLE_STALE/);
 // A stale table is passed through untouched from then on.
 const commits=store.commits;
 assert.equal((await post(gw,'/values:batchUpdate',{valueInputOption:'RAW',data:[{range:'Auditors!B2',values:[['z@x']]}]})).status,200);
 assert.equal(store.commits,commits);
}
// --- read facade: reference ranges from Firestore, others forwarded, positional identity ---
{
 const {sheets,gw}=await setup();
 const calls=sheets.calls.length;
 const u=new URL(BASE+'/values:batchGet');
 for(const r of ['Auditors!A1:AF500','Audit planning!A1:C3','Companies!E84','Companies!A1:AZ1024','Config_Scopes!A1:Z128'])u.searchParams.append('ranges',r);
 u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
 const body=await (await gw.fetch(u,{headers:{authorization:'Bearer x'}})).json();
 const direct=await (await sheets.fetchImpl(u,{})).json();
 assert.deepEqual(body.valueRanges.map(v=>v.values??null),direct.valueRanges.map(v=>v.values??null));
 assert.deepEqual(sheets.calls.slice(calls,calls+1),['GET /values:batchGet']); // only the non-reference range went to Sheets
 assert.equal(gw.stats().facadeReads,1);
 // Serial-date reads keep going to Sheets.
 u.searchParams.set('dateTimeRenderOption','SERIAL_NUMBER');
 const before=sheets.calls.length;await gw.fetch(u,{});assert.equal(sheets.calls.length,before+1);
 // Non-Sheets traffic is untouched.
 let seen='';const g2=createReferenceTablesGateway20({spreadsheetId:SID,store:{commitChanges(){}},fetchImpl:async i=>{seen=String(i);return new Response('{}');}});
 await g2.fetch('http://metadata.google.internal/token');assert.equal(seen,'http://metadata.google.internal/token');
}

// --- real store: commitChanges preconditions and markStale over the Firestore REST API ---
{
 const sent=[];
 const fetchImpl=async(url,{method='GET',body}={})=>{sent.push({url,method,body:body?JSON.parse(body):null});
  if(url.endsWith(':commit'))return sent.length===1?new Response(JSON.stringify({writeResults:[{updateTime:'a'},{updateTime:'b'}]}),{status:200}):new Response(JSON.stringify({error:{status:'FAILED_PRECONDITION'}}),{status:400});
  return new Response('{}',{status:200});};
 const store=createReferenceTablesFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>'t',fetchImpl});
 const change={table:'companies',meta:{table:'companies',headers:['Company_UID'],rowCount:1,revision:4,updateTime:'u4',stale:false},puts:[{row:{key:'C1',rowIndex:1,cells:['C1']},create:false}],headers:['Company_UID'],rowCount:1,writer:'GATEWAY'};
 assert.deepEqual(await store.commitChanges([change]),[{table:'companies',revision:5,updateTime:'b'}]);
 const w=sent[0].body.writes;
 assert.deepEqual(w[0].currentDocument,{exists:true});assert.deepEqual(w[1].currentDocument,{updateTime:'u4'});
 assert.equal(w[1].update.fields.payload.mapValue.fields.revision.integerValue,'5');
 assert.equal('stale'in w[1].update.fields.payload.mapValue.fields,false);
 await assert.rejects(store.commitChanges([change]),/REFERENCE_FIRESTORE_CONFLICT/);
 await store.markStale('companies','X');
 assert.equal(sent[2].method,'PATCH');assert.match(sent[2].url,/updateMask\.fieldPaths=payload\.stale&/);
}
console.log('reference-tables-gateway-20-test: ok');
