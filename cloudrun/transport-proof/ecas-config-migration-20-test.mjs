import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../NotificationEcasConfigMigration.js',import.meta.url),'utf8');
new vm.Script(code);
const headers=['EVENT_KEY','ACTIVE','SEND_EMAIL','LOG_ONLY','REQUIRE_REASON','INCLUDE_COMMENT','DIGEST_GROUP','TEMPLATE_FAMILY','TEMPLATE_KEY_DEFAULT'];
function execute(env){const rows=[headers,['ECAS_AUDIT_CANCELLED_DIGEST','YES','YES','NO','YES','YES','ECAS_OPERATIONAL','EXTERNAL_OPERATIONAL','ECAS_AUDIT_CANCELLED_DIGEST']];
 const sh={getLastRow:()=>rows.length,getDataRange:()=>({getValues:()=>rows}),appendRow:r=>rows.push(r)};
 const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='AMS_ENV'?env:''})},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sh})},String,Error};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 if(env!=='DEV'){assert.throws(()=>sandbox.RUN_PREPARE_ECAS20_REJECTED_CONFIG_DEV_(),/ECAS_CONFIG_PREPARE_DEV_ONLY/);return;}
 const first=sandbox.RUN_PREPARE_ECAS20_REJECTED_CONFIG_DEV_();assert.equal(first.created,true);assert.equal(rows[2][1],'NO');assert.equal(rows[2][2],'NO');assert.equal(rows[2][3],'YES');
 const second=sandbox.RUN_PREPARE_ECAS20_REJECTED_CONFIG_DEV_();assert.equal(second.alreadyExists,true);assert.equal(rows.length,3);
}
execute('PROD');execute('DEV');console.log('ECAS inactive Reject config migration DEV-only OK');
