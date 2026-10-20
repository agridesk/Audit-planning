import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../../NotificationRenderer_WeeklyDigest.js',import.meta.url),'utf8');
const start=source.indexOf('function nrm2_queueWeeklyMail_(');
const end=source.indexOf('function RUN_NF_WEEKLY_QUEUE_SMOKE(',start);
assert.ok(start>=0&&end>start,'Weekly queue writer found');
let locks=0;
const rows=[];
const queue={appendRow:row=>rows.push(row),getLastRow:()=>rows.length+1};
const spreadsheet={getSheetByName:()=>queue};
const ctx={
 NotificationConfig_GetQueueSheetName:()=> 'Notification Queue',
 Utilities:{
  DigestAlgorithm:{SHA_256:'SHA_256'},
  computeDigest:(algorithm,s)=>[...createHash('sha256').update(s).digest()],
  base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')
 },
 LockService:{getScriptLock:()=>({
  tryLock:()=>{locks++;return true},
  releaseLock:()=>{locks--}
 })},
 NB_recentQueueDuplicate_:(sh,hash)=>{const i=rows.findIndex(r=>r[10]===hash);return i>=0?{found:true,row:i+2}:{found:false}},
 Date,JSON,String,Error
};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const mail={eventKey:'WEEKLY_MANAGER_DIGEST',recipient:'manager@example.org',digestGroup:'MANAGER_WEEKLY',subject:'Weekly summary',body:'Summary',htmlBody:'<p>Summary</p>'};
const first=ctx.nrm2_queueWeeklyMail_(spreadsheet,mail);
const replay=ctx.nrm2_queueWeeklyMail_(spreadsheet,mail);
const changedContent=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,subject:'Changed summary',htmlBody:'<p>Changed</p>'});
const separateRecipient=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,recipient:'other@example.org'});
const separateEvent=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,eventKey:'WEEKLY_AUDITOR_DIGEST'});
assert.equal(first.status,'PENDING');
assert.equal(replay.status,'DUPLICATE_SUPPRESSED');
assert.equal(changedContent.status,'DUPLICATE_SUPPRESSED','Same weekly schedule cannot resend edited content');
assert.equal(separateRecipient.status,'PENDING');
assert.equal(separateEvent.status,'PENDING');
assert.equal(rows.length,3,'Only distinct weekly event/recipient pairs can be queued');
assert.notEqual(rows[0][10],rows[1][10],'Distinct recipient must have distinct hash');
assert.equal(locks,0);
console.log('notification-weekly-queue-idempotency-20: PASS');
