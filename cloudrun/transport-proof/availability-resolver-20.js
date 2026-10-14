/** AMS 2.0 bounded, pure availability resolution. Node >=20, no GAS. */
export const AVAILABILITY_STATES=Object.freeze(['FREE','SOFT','PROVISIONAL','HARD','COMMITTED']);
const rank={FREE:0,SOFT:1,PROVISIONAL:2,HARD:3,COMMITTED:4};
const clean=x=>String(x??'').trim();
function dateNumber(v){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;}
function hhmm(v,allow24=false){const s=clean(v);if(allow24&&s==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('INVALID_TIME');return Number(s.slice(0,2))*60+Number(s.slice(3));}
function format(n){return n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function normalize(x){if(!x||!Object.hasOwn(rank,x.state)||x.state==='FREE')throw Error('INVALID_STATE');const from=dateNumber(x.fromDate??x.date),to=dateNumber(x.toDate??x.fromDate??x.date);if(from>to)throw Error('INVALID_RANGE');const start=x.wholeDay===true?0:hhmm(x.start),end=x.wholeDay===true?1440:hhmm(x.end,true);if(start>=end)throw Error('INVALID_INTERVAL');return {...x,from,to,startMinute:start,endMinute:end};}
function recurringForDate(p,date,weekday){if(p.weekday!==weekday)return null;const x=normalize({...p,state:'SOFT',date});return {...x,from:dateNumber(date),to:dateNumber(date)};}
/** Inputs: inclusive date bounds, concrete blocks, weekly preferences, concrete Available overrides.
 * Source blocks must already be authorized and fetched from canonical owners.
 * Does NOT write planning, grant eligibility, or claim to validate concurrency.
 */
export function resolveAvailabilityPeriod({fromDate,toDate,blocks=[],recurring=[],overrides=[]}={}){
 const from=dateNumber(fromDate),to=dateNumber(toDate);if(to<from||to-from>92)throw Error('QUERY_RANGE_OUT_OF_BOUNDS');
 const concrete=blocks.map(normalize),available=overrides.map(v=>normalize({...v,state:'SOFT'}));
 const result=[];
 for(let day=from;day<=to;day++){
  const date=new Date(day*86400000).toISOString().slice(0,10),weekday=(new Date(day*86400000).getUTCDay()+6)%7;
  const active=concrete.filter(x=>x.from<=day&&x.to>=day);
  for(const pref of recurring){const p=recurringForDate(pref,date,weekday);if(!p)continue;
   const boundaries=[p.startMinute,p.endMinute];
   for(const v of available){if(v.from>day||v.to<day)continue;boundaries.push(Math.max(p.startMinute,Math.min(p.endMinute,v.startMinute)),Math.max(p.startMinute,Math.min(p.endMinute,v.endMinute)));}
   const cuts=[...new Set(boundaries)].sort((a,b)=>a-b);
   for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i];if(a===b||available.some(v=>v.from<=day&&v.to>=day&&v.startMinute<b&&v.endMinute>a))continue;active.push({...p,startMinute:a,endMinute:b});}
  }
  const edges=[...new Set([0,1440,...active.flatMap(x=>[x.startMinute,x.endMinute])])].sort((a,b)=>a-b),segments=[];
  for(let i=1;i<edges.length;i++){const a=edges[i-1],b=edges[i];if(a===b)continue;
   const matches=active.filter(x=>x.startMinute<b&&x.endMinute>a).sort((x,y)=>rank[y.state]-rank[x.state]);
   const state=matches[0]?.state??'FREE';const ids=matches.filter(x=>x.state===state).map(x=>clean(x.id)).filter(Boolean).sort();
   const last=segments.at(-1);if(last&&last.state===state&&JSON.stringify(last.sourceIds)===JSON.stringify(ids)){last.end=format(b);continue;}
   segments.push({start:format(a),end:format(b),state,sourceIds:ids});
  }
  result.push({date,segments});
 }
 return result;
}
export function intervalsOverlap(a,b){const x=normalize(a),y=normalize(b);return x.from<=y.to&&y.from<=x.to&&x.startMinute<y.endMinute&&y.startMinute<x.endMinute;}