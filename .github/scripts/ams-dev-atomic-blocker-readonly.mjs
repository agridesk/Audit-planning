/** Read-only, privacy-minimal inspection of the known DEV atomic Self planning blocker. */
const project='audit-management-system-dev';
const op='fa914e8c46ad1ded6d364868f7154059b48af2c36ba51609a6cae1838f35dec4';
const token=process.env.GOOGLE_ACCESS_TOKEN;
if(!token)throw Error('DEV_ATOMIC_READ_TOKEN_MISSING');
const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/';
async function get(path){const r=await fetch(base+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(r.status===404)return null;if(!r.ok)throw Error('DEV_ATOMIC_READ_HTTP_'+r.status);return r.json();}
function decode(v){if(!v)return null;if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);return null;}
const raw=await get('ams_planning_20_dev_outbox/'+op);
const entry=decode(raw?.fields?.payload);
console.log('DEV_ATOMIC_BLOCKER_READ_ONLY',JSON.stringify({found:!!entry,state:entry?.state||null,action:entry?.action||null,revision:entry?.revision??null,hasSnapshot:!!entry?.snapshot,projectionRanges:entry?.snapshot?.projectionWrites?.map(x=>x.range)||[],preconditionRanges:entry?.snapshot?.projectionPreconditions?.map(x=>x.range)||[]}));
if(!entry)throw Error('DEV_ATOMIC_BLOCKER_NOT_FOUND');
if(entry.state!=='UNCERTAIN')throw Error('DEV_ATOMIC_BLOCKER_STATE_CHANGED_REVIEW_REQUIRED');
const gateRaw=await get('ams_planning_write_gate_20_dev/planning-write-gate-v2');
const gate=decode(gateRaw?.fields?.payload);
const holder=gate?.holder;
const gateStatus={found:!!gate,version:gate?.version??null,holderState:holder?.state||null,holderOperationMatches:holder?.operationId===op,uncertainAt:holder?.uncertainAt||null};
console.log('DEV_ATOMIC_GATE_READ_ONLY',JSON.stringify(gateStatus));
if(holder?.operationId!==op||holder?.state!=='UNCERTAIN')throw Error('DEV_ATOMIC_GATE_UNEXPECTED_STATE');
const sheetId=process.env.AMS_DEV_SHEET_ID;
if(!sheetId)throw Error('DEV_ATOMIC_SHEET_ID_REQUIRED');
const target=entry.snapshot?.projectionWrites?.[0]?.values?.[0]||[];
const before=entry.snapshot?.projectionPreconditions?.[0]?.before||[];
const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&ranges='+encodeURIComponent('Audit planning!A7:BS7')+'&ranges='+encodeURIComponent('Audit planning!S1:AD1');
const sheetResponse=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
if(!sheetResponse.ok)throw Error('DEV_ATOMIC_SHEETS_READ_'+sheetResponse.status);
const sheet=await sheetResponse.json();
const actual=sheet.valueRanges?.[0]?.values?.[0]||[];
const headers=sheet.valueRanges?.[1]?.values?.[0]||[];
const diffs=[];for(let i=0;i<Math.max(actual.length,target.length,before.length);i++)if(String(actual[i]??'')!==String(target[i]??''))diffs.push({column:i+1,type:typeof actual[i],matchesBefore:String(actual[i]??'')===String(before[i]??'')});
console.log('DEV_ATOMIC_SHEETS_DIFF_READ_ONLY',JSON.stringify({headerS:headers[0]==='Total audit time in hours',headerAD:headers[11]==='Allow self planning',diffs,actualHourNumeric:typeof actual[18]==='number',targetToggleValid:['Yes','No'].includes(String(target[29]||'')),beforeToggleValid:['Yes','No'].includes(String(before[29]||''))}));
if(diffs.length!==2||diffs[0].column!==19||diffs[1].column!==30||!diffs[1].matchesBefore||typeof actual[18]!=='number'||headers[0]!=='Total audit time in hours'||headers[11]!=='Allow self planning')throw Error('DEV_ATOMIC_RESCUE_SOURCE_MISMATCH');
console.log('NO_WRITES_NO_PAYLOAD_VALUES_LOGGED');
