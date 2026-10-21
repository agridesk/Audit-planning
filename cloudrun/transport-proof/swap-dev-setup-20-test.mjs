import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20DevSetup20261021.js',import.meta.url),'utf8');
const DEV='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const properties={};
let created=0;
const sheets={'Audit planning':{},'Auditor Availability':{}};
const ss={getId:()=>DEV,getSheetByName:name=>sheets[name]||null,
 insertSheet:name=>{created++;let rows=[];sheets[name]={getRange:()=>({getValues:()=>rows.slice(),setValues:v=>{rows=v}}),getLastRow:()=>rows.length,setFrozenRows:()=>{}};return sheets[name];}};
const ctx={Error,String,JSON,
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||'',setProperties:v=>Object.assign(properties,v)})},
 Logger:{log:()=>{}}};
runInNewContext(src,ctx);
assert.equal(ctx.RUN_SETUP_SWAP20_DEV_20261021().createdJournal,true);
assert.equal(ctx.RUN_SETUP_SWAP20_DEV_20261021().createdJournal,false);
assert.equal(created,1);
assert.equal(properties.AMS_ENV,'DEV');
assert.equal(properties.V5_SSOT_SPREADSHEET_ID,DEV);
properties.AMS_ENV='PROD';
assert.throws(()=>ctx.RUN_SETUP_SWAP20_DEV_20261021(),/ENV_CONFLICT/);
assert.equal(created,1);
console.log('SWAP DEV setup guard tests passed');
