import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../CB_Extension_Notifications_20.js',import.meta.url),'utf8');
const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const createSheet=rows=>({
 rows:rows.map(x=>x.slice()),
 getDataRange(){return{getValues:()=>this.rows.map(x=>x.slice())}},
 getRange(row,col){return{setValue:value=>{while(this.rows.length<row)this.rows.push([]);this.rows[row-1][col-1]=value}}},
 appendRow(row){this.rows.push(row.slice())}
});
const header=['Event_ID','Operation_ID','Audit_ID','Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Action','State_After','Created_At','Not_Before','Status','Notification_Recipient','Delivered_At','Last_Error','Details_JSON'];
const details=JSON.stringify({company:'Example Company',baseExpiry:'2026-12-01',effectiveExpiry:'2027-03-01'});
const apply=['CB_EXT_A','A','AUD','OBL','COMP','GG-CB-A','CB-A','APPLY','APPLIED','2025-11-08T10:00:00Z','2025-11-08T10:10:00Z','BUFFERED','','','',details];
const undo=['CB_EXT_B','B','AUD','OBL','COMP','GG-CB-A','CB-A','UNDO','NOT_APPLIED','2025-11-08T10:21:00Z','2025-11-08T10:31:00Z','BUFFERED','','','',details];
const setup=(events,applied,enabled)=>{
 const sheets={
 'System_Config':createSheet([['KEY','DEV','PROD'],['ENV','DEV','PROD']]),
 'CB_Extension_Outbox':createSheet([header,...events]),
 'Audit_Obligations':createSheet([['Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Extension_Applied'],['OBL','COMP','GG-CB-A','CB-A',applied?'Yes':'']]),
 'Config_Scopes':createSheet([['ScopeCode','Certification_Body_ID','Active'],['GG-CB-A','CB-A','TRUE']]),
 'Certification_Bodies':createSheet([['Certification_Body_ID','Display_Name','Active','Notification_Email','Email_Verified','Notification_Enabled'],['CB-A','Body A','TRUE','notify@cb-a.example','TRUE',enabled?'TRUE':'FALSE']]),
 'Notification_Config':createSheet([['EVENT_KEY','ACTIVE','SEND_EMAIL','LOG_ONLY','BUFFER_MINUTES'],['CB_EXTENSION_APPLIED','YES','YES','NO','10'],['CB_EXTENSION_UNDONE','YES','YES','NO','10']]),
 'Notification_Templates':createSheet([['TEMPLATE_KEY','ACTIVE','SUBJECT_TEMPLATE','TEXT_BODY'],['CB_EXTENSION_NOTIFICATION','YES','Extension {{ACTION_LABEL}} — {{COMPANY_NAME}}','Dear {{CERTIFICATION_BODY_NAME}}, {{ACTION_DESCRIPTION}} {{SCOPE_NAME}} expires {{EFFECTIVE_EXPIRY}}']]),
 'Notification Queue':createSheet([['TimestampCreated','Status','Type','Recipient','Audit ID','Company','Subject','Body','Attempts','LastError','PayloadHash','TimestampSent','Reserved']])
 };
 const ss={getId:()=> '1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',getSheetByName:name=>sheets[name]||null,getSpreadsheetTimeZone:()=>'Europe/Amsterdam'};
 const runtime={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},Utilities:{
  formatDate:()=> '2026-11-08 21:00',DigestAlgorithm:{MD5:1},computeDigest:()=>Array(16).fill(1)
 }};
 runInNewContext(source,runtime);
 return{...runtime,sheets};
};
{
 const x=setup([apply,['CB_EXT_early','early',...undo.slice(2,9),'2025-11-08T10:03:00Z','2025-11-08T10:13:00Z',...undo.slice(11)]],false,false);
 const result=x.CB_Extension_Outbox_ReconcileLocked_();
 assert.equal(result.suppressed,2);
 assert.equal(x.sheets['Notification Queue'].rows.length,1);
 assert.deepEqual(x.sheets.CB_Extension_Outbox.rows.slice(1).map(r=>r[11]),['SUPPRESSED','SUPPRESSED']);
}
{
 const x=setup([apply],true,true),result=x.CB_Extension_Outbox_ReconcileLocked_();
 assert.equal(result.queued,1);
 const row=x.sheets['Notification Queue'].rows[1];
 assert.equal(row[3],'notify@cb-a.example');
 assert.equal(row[6],'Extension Applied — Example Company');
 assert(!row[7].includes('ECAS'));
 const payload=JSON.parse(row[12]).payload;
 assert.equal(x.CB_Extension_Outbox_PreflightSend_([{eventCode:row[2],payload}],row[3]).ok,true);
 assert.throws(()=>x.CB_Extension_Outbox_PreflightSend_([{eventCode:row[2],payload}],'planning@ecas.nl'),/STALE_STATE_OR_RECIPIENT/);
 x.CB_Extension_Outbox_RecordDelivery_([{payload}],'SENT','2026-11-08T21:00:00Z');
 assert.equal(x.sheets.CB_Extension_Outbox.rows[1][11],'SENT');
 x.sheets.Audit_Obligations.rows[1][4]='';
 x.sheets.CB_Extension_Outbox.rows.push(undo.slice());
 const result2=x.CB_Extension_Outbox_ReconcileLocked_();
 assert.equal(result2.queued,1);
 assert.equal(x.sheets['Notification Queue'].rows[2][2],'CB_EXTENSION_UNDONE');
}
{
 const x=setup([apply],true,true);
 const devSheet=x.SpreadsheetApp.getActiveSpreadsheet();
 x.SpreadsheetApp.getActiveSpreadsheet=()=>({...devSheet,getId:()=> 'PROD_SPREADSHEET'});
 assert.equal(x.CB_Extension_Outbox_ReconcileLocked_().skipped,'NON_DEV');
 assert.equal(x.sheets['Notification Queue'].rows.length,1);
}
{
 const x=setup([apply],true,true);
 assert.equal(x.CB_Extension_Outbox_ReconcileLocked_().queued,1);
 const queueRow=x.sheets['Notification Queue'].rows[1],payload=JSON.parse(queueRow[12]).payload;
 x.CB_Extension_Outbox_RecordDelivery_([{payload}],'SENT_DEV_REDIRECT','2026-11-08T21:00:00Z');
 assert.equal(x.sheets.CB_Extension_Outbox.rows[1][11],'TESTED');
 assert.equal(x.sheets.CB_Extension_Outbox.rows[1][13],'2026-11-08T21:00:00Z');
 x.sheets.Audit_Obligations.rows[1][4]='';
 x.sheets.CB_Extension_Outbox.rows.push(undo.slice());
 const result=x.CB_Extension_Outbox_ReconcileLocked_();
 assert.equal(result.queued,1,'A TEST_TO_SELF delivery counts as communicated in DEV');
 assert.equal(x.sheets['Notification Queue'].rows[2][2],'CB_EXTENSION_UNDONE');
}
assert(sender.includes('CB_Extension_Outbox_ReconcileLocked_'),'GAS sender must invoke the reconciler');
assert(sender.includes('CB_Extension_Outbox_PreflightSend_'),'GAS sender must verify CB immediately before email');
assert(sender.includes('CB_Extension_Outbox_RecordDelivery_'),'GAS sender must record actual delivery');
assert(sender.includes("/^CB_EXTENSION_(APPLIED|UNDONE)$/"),'CB events must bypass legacy renderer');
console.log('cb-extension-notification-gas-20 PASS');