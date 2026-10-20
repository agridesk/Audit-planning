// Read-only Notifications Management 2.0 overview. Never returns sender secrets or full queue payloads.
const norm=x=>String(x??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
function table(rows){const headers=(rows[0]||[]).map(norm);return {headers,rows:rows.slice(1),index:(...names)=>names.map(norm).map(x=>headers.indexOf(x)).find(i=>i>=0)??-1};}
export function notificationOverview({config=[],rules=[],settings=[],queue=[]}={}){
 const events=table(config),eKey=events.index('EVENT_KEY'),eActive=events.index('ACTIVE'),eEmail=events.index('SEND_EMAIL'),eFamily=events.index('TEMPLATE_FAMILY'),eRecipient=events.index('RECIPIENT_TARGET'),eDescription=events.index('DESCRIPTION'),eLogOnly=events.index('LOG_ONLY'),eClass=events.index('EVENT_CLASS'),eBuffer=events.index('BUFFER_MINUTES'),eDigest=events.index('DIGEST_GROUP'),eConsolidate=events.index('CONSOLIDATE');
 const rulesTable=table(rules),rKey=rulesTable.index('RuleKey','RULE_KEY','Rule Key');
 const settingsTable=table(settings),sKey=settingsTable.index('SettingKey','SETTING_KEY','Key','Name');
 const q=table(queue),qStatus=q.index('Status'),qType=q.index('Type'),qError=q.index('LastError'),qTime=q.index('TimestampCreated');
 if(config.length&&eKey<0)throw Error('NOTIFICATION_EVENT_HEADER_MISSING');
 if(queue.length&&qStatus<0)throw Error('NOTIFICATION_QUEUE_STATUS_MISSING');
 const value=(row,i)=>i<0?'':String(row[i]??'').trim();
 const eventRows=events.rows.filter(r=>value(r,eKey)).map(r=>({eventKey:value(r,eKey),active:value(r,eActive),sendEmail:value(r,eEmail),templateFamily:value(r,eFamily),recipientTarget:value(r,eRecipient),description:value(r,eDescription),logOnly:value(r,eLogOnly),eventClass:value(r,eClass),bufferMinutes:value(r,eBuffer),digestGroup:value(r,eDigest),consolidate:value(r,eConsolidate)}));
 const statusCounts={};const failures=[];
 for(const row of q.rows){const status=value(row,qStatus).toUpperCase()||'UNKNOWN';statusCounts[status]=(statusCounts[status]||0)+1;if(status==='FAILED')failures.push({type:value(row,qType),timestamp:value(row,qTime),error:value(row,qError).slice(0,240)});}
 return {events:eventRows,configuration:{eventCount:eventRows.length,ruleCount:rulesTable.rows.filter(r=>value(r,rKey)).length,settingCount:settingsTable.rows.filter(r=>value(r,sKey)).length},queue:{total:q.rows.length,statusCounts,recentFailures:failures.slice(-20).reverse()},readOnly:true};
}
