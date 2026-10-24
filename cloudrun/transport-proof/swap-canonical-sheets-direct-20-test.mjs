import assert from 'node:assert/strict';
import {createSwapCanonicalSheetsTransport} from './swap-canonical-sheets-direct-20.mjs';
let calls=0;
const transport=createSwapCanonicalSheetsTransport({
 spreadsheetId:'abcdefghijklmnopqrstuvwxyz1234567890',
 getToken:async()=>'test-token',
 fetchImpl:async(url,init)=>{
  calls++;
  assert.equal(init.method,'GET');
  assert.equal(init.headers.authorization,'Bearer test-token');
  assert.ok(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'));
  assert.ok(url.includes('valueRenderOption=UNFORMATTED_VALUE'));
  return {ok:true,json:async()=>({values:[['Audit ID','Status'],['A','Accepted'],['B','Accepted']]})};
 }
});
assert.deepEqual((await transport.readValues('Audit planning','A1:B2')).values,[['Audit ID','Status'],['A','Accepted'],['B','Accepted']]);
const pair=await transport.readAuditRows({auditIds:['B','A'],columns:'A1:B3'});
assert.deepEqual(pair.rows.map(x=>[x.auditId,x.sheetRow]),[['B',3],['A',2]]);
assert.equal(calls,2);
await assert.rejects(transport.readValues('Audit planning','A1:INVALID'),/SWAP_SHEETS_RANGE_INVALID/);
await assert.rejects(transport.readValues('', 'A1'),/SWAP_SHEETS_TAB_INVALID/);
assert.equal(calls,2);
await assert.rejects(transport.readAuditRows({auditIds:['A','A']}),/SWAP_SHEETS_PAIR_INVALID/);
console.log('SWAP canonical direct Sheets audit-pair read checks passed');
