/**
 * Audit planning write guard (DEV, golf 2).
 * Firestore is the authority for planning rows; the only legitimate Sheets writers of the guarded tabs are the
 * atomic projectors, which receive `trustedFetch`. Every other in-process Sheets write that touches a guarded tab
 * is attributed to its caller and either logged (observe) or refused before reaching Sheets (enforce).
 */
import {parseA1Range20} from './reference-tables-gateway-20.js';

const ORIGIN='https://sheets.googleapis.com';
export const AUDIT_PLANNING_GUARDED_TABS_20=Object.freeze(['Audit planning']);

function sheetIdsIn(x,out=new Set()){
 if(Array.isArray(x))x.forEach(v=>sheetIdsIn(v,out));
 else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(k==='sheetId'&&Number.isSafeInteger(v))out.add(v);else sheetIdsIn(v,out);}
 return out;
}
const lower=s=>String(s??'').trim().toLowerCase();

/** Pure: guarded tab titles touched by one Sheets write request. Unparsable values ranges count as touched. */
export function guardedTabsTouched20({path,body,sheetTitles,tabs=AUDIT_PLANNING_GUARDED_TABS_20}){
 const wanted=new Set(tabs.map(lower)),hit=new Set();
 const range=r=>{
  const p=parseA1Range20(r);
  if(!p){if(tabs.some(t=>lower(r).includes(lower(t))))hit.add('UNPARSABLE_RANGE');return;}
  if(wanted.has(lower(p.sheet)))hit.add(p.sheet);
 };
 let m;
 if(path==='/values:batchUpdate'||path==='/values:batchClear'){
  for(const d of body?.data||[])range(d?.range);
  for(const r of body?.ranges||[])range(r);
 }else if((m=/^\/values\/([^:/]+)(:append|:clear)?$/.exec(path)))range(decodeURIComponent(m[1]));
 else if(/DataFilter$/.test(path))hit.add('DATA_FILTER');
 else if(path===':batchUpdate'){
  for(const id of sheetIdsIn(body?.requests||[])){const t=sheetTitles?.get(id);if(t&&wanted.has(lower(t)))hit.add(t);}
  // updateCells/appendCells without explicit sheetId default to sheet 0.
  if((body?.requests||[]).some(r=>{const [type,s]=Object.entries(r||{})[0]||[];return (type==='appendCells'&&s?.sheetId===undefined)||(type==='updateCells'&&s?.range?.sheetId===undefined&&s?.start?.sheetId===undefined);})){
   const t=sheetTitles?.get(0);if(t&&wanted.has(lower(t)))hit.add(t);
  }
 }
 return [...hit];
}

/** Up to three stack frames outside the fetch layers ("file.js:line<file.js:line"), incl. V8 async frames. */
export function callerOf20(stack){
 const frames=[];
 for(const line of String(stack||'').split('\n').slice(1)){
  const m=/([\w.-]+\.(?:m?js|cjs)):(\d+):\d+\)?\s*$/.exec(line);
  if(!m||/\(?node:/.test(line)||/^(audit-planning-write-guard-20|reference-tables-gateway-20)\./.test(m[1]))continue;
  frames.push(m[1]+':'+m[2]);
  if(frames.length===3)break;
 }
 return frames.join('<')||'unknown';
}

export function createAuditPlanningWriteGuard20({spreadsheetId,fetchImpl,mode='observe',tabs=AUDIT_PLANNING_GUARDED_TABS_20,log=()=>{}}={}){
 if(!spreadsheetId||typeof fetchImpl!=='function'||!['observe','enforce'].includes(mode))throw Error('AUDIT_PLANNING_GUARD_CONFIG_INVALID');
 const base=ORIGIN+'/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
 const stats={mode,since:new Date().toISOString(),trusted:0,observed:0,refused:0,unresolved:0,callers:{}};
 let titles=null,titlesAt=0;
 async function sheetTitles(headers){
  if(titles&&Date.now()-titlesAt<300000)return titles;
  const r=await fetchImpl(base+'?fields='+encodeURIComponent('sheets.properties(sheetId,title)'),{headers:{authorization:new Headers(headers||{}).get('authorization')||''}});
  if(!r.ok)throw Error('AUDIT_PLANNING_GUARD_METADATA_'+r.status);
  titles=new Map(((await r.json()).sheets||[]).map(s=>[s.properties?.sheetId,s.properties?.title]));titlesAt=Date.now();
  return titles;
 }
 const refusal=code=>new Response(JSON.stringify({error:{code:409,status:'FAILED_PRECONDITION',message:code}}),{status:409,headers:{'content-type':'application/json'}});
 async function guardedFetch(input,init={}){
  let url=null;
  try{if(typeof input==='string'||input instanceof URL)url=new URL(String(input));}catch{}
  const m=url&&url.origin===ORIGIN?/^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(url.pathname):null;
  const method=String(init?.method||'GET').toUpperCase();
  if(!m||decodeURIComponent(m[1])!==spreadsheetId||method==='GET')return fetchImpl(input,init);
  const limit=Error.stackTraceLimit;Error.stackTraceLimit=40;const caller=callerOf20(Error().stack);Error.stackTraceLimit=limit;
  let touched;
  try{
   const body=typeof init.body==='string'&&init.body?JSON.parse(init.body):{};
   touched=guardedTabsTouched20({path:m[2],body,tabs,sheetTitles:m[2]===':batchUpdate'?await sheetTitles(init.headers):null});
  }catch(e){
   stats.unresolved++;
   log({event:'AUDIT_PLANNING_GUARD_UNRESOLVED',mode,caller,error:String(e?.message||e).slice(0,80)});
   if(mode==='enforce')return refusal('AUDIT_PLANNING_GUARD_UNRESOLVED');
   return fetchImpl(input,init);
  }
  if(!touched.length)return fetchImpl(input,init);
  stats.callers[caller]=(stats.callers[caller]||0)+1;
  if(mode==='enforce'){
   stats.refused++;
   log({event:'AUDIT_PLANNING_UNFENCED_WRITE_REFUSED',caller,tabs:touched,path:m[2].slice(0,60)});
   return refusal('AUDIT_PLANNING_WRITE_NOT_FIRESTORE_FIRST');
  }
  stats.observed++;
  log({event:'AUDIT_PLANNING_UNFENCED_WRITE',caller,tabs:touched,path:m[2].slice(0,60)});
  return fetchImpl(input,init);
 }
 async function trustedFetch(input,init){stats.trusted++;return fetchImpl(input,init);}
 return Object.freeze({fetch:guardedFetch,trustedFetch,stats:()=>({...stats,callers:{...stats.callers}})});
}
