/** AMS DEV legacy availability migration plan. PURE / READ ONLY.
 * Never infer a HARD block from an audit reservation or a generated default.
 * Explicit manual entries are HARD candidates, but unresolved identity is quarantined.
 */
const norm=x=>String(x??'').trim();
const email=x=>norm(x).toLowerCase();
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const validTime=(x,end=false)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)||(end&&x==='24:00');
export function planLegacyHardMigration({rows,roster}={}){
 if(!Array.isArray(rows)||!rows.length||!Array.isArray(roster))throw Error('INVALID_MIGRATION_SOURCE');
 const header=rows[0].map(norm),names=['Date','Auditor_Email','Available','First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1','Audit_ID_2','Status_1','Status_2'];
 const idx=Object.fromEntries(names.map(x=>[x,header.indexOf(x)]));
 if(names.some(x=>idx[x]<0))throw Error('LEGACY_SCHEMA_MISMATCH');
 const byEmail=new Map();
 for(const auditor of roster){const e=email(auditor.email),id=norm(auditor.auditorId);if(!e||!id||byEmail.has(e))throw Error('MIGRATION_ROSTER_AMBIGUOUS');byEmail.set(e,id);}
 const candidates=[],quarantined=[],counts={manualHard:0,generated:0,audit:0,other:0};
 for(let i=1;i<rows.length;i++){
  const row=rows[i],get=k=>norm(row[idx[k]]),status=[get('Status_1'),get('Status_2')];
  if(get('Audit_ID_1')||get('Audit_ID_2')){counts.audit++;continue;}
  if(status.includes('DEFAULT_WEEKEND_SOFT')||status.includes('DEFAULT_AUDITOR_BLOCKED_SOFT')){counts.generated++;continue;}
  if(!(status.includes('MANUAL_AUDITOR_BLOCKED_SOFT')&&status.includes('USER_MANUAL'))){counts.other++;continue;}
  counts.manualHard++;
  const date=get('Date'),e=email(get('Auditor_Email')),auditorId=byEmail.get(e),start=get('First_Audit_Start_Time'),end=get('First_Audit_End_Time');
  const problems=[];
  if(!auditorId)problems.push('AUDITOR_UID_UNRESOLVED');
  if(!validDate(date))problems.push('INVALID_DATE');
  if(!validTime(start)||!validTime(end,true)||start>=end)problems.push('INVALID_INTERVAL');
  if(get('Available').toUpperCase()!=='NO')problems.push('NOT_MARKED_UNAVAILABLE');
  const entry={sourceRow:i+1,auditorId:auditorId||null,date,start,end,targetState:'HARD'};
  if(problems.length)quarantined.push({...entry,problems});
  else candidates.push(entry);
 }
 return {readOnly:true,sourceRows:rows.length-1,counts,candidates,quarantined,writeApplied:false};
}
