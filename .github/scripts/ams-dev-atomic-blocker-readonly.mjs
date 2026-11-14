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
console.log('NO_WRITES_NO_PAYLOAD_VALUES_LOGGED');
