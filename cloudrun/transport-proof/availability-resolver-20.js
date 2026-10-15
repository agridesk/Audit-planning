/** AMS 2.0 pure bounded resolver. Node >=20. No Apps Script. */
export const AVAILABILITY_STATES=Object.freeze(['FREE','SOFT','PROVISIONAL','HARD','COMMITTED']);
const rank={FREE:0,SOFT:1,PROVISIONAL:2,HARD:3,COMMITTED:4};
const clean=x=>String(x??'').trim();
function dateNumber(v){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;}
function hhmm(v,allow24=false){const s=clean(v);if(allow24&&s==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('INVALID_TIME');return Number(s.slice(0,2))*60+Number(s.slice(3));}
function format(n){return n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function normalize(x){if(!x||!Object.hasOwn(rank,x.state)||x.state==='FREE')throw Error('INVALID_STATE');const from=dateNumber(x.fromDate??x.date),to=dateNumber(x.toDate??x.fromDate??x.date);if(from>to)throw Error('INVALID_RANGE');const start=x.wholeDay===true?0:hhmm(x.start),end=x.wholeDay===true?1440:hhmm(x.end,true);if(start>=end)throw Error('INVALID_INTERVAL');return {...x,from,to,startMinute:start,endMinute:end};}
function overlaps(x,day,a,b){return x.from<=day&&x.to>=day&&x.startMinute<b&&x.endMinute>a;}
/**
 * baselineExceptions: concrete HARD ranges created by the optional bulk-block shortcut.
 * baselineReleases: explicit FREE windows scoped by targetExceptionId to ONE baseline.
 * Other HARD blocks are never overridden. Committed/provisional are never removed.
 * Both arrays are supplied from authorized canonical storage, not client trust.
 */
export function resolveAvailabilityPeriod({fromDate,toDate,blocks=[],recurring=[],overrides=[],baselineExceptions=[],baselineReleases=[]}={}){
 const from=dateNumber(fromDate),to=dateNumber(toDate);if(to<from||to-from>92)throw Error('QUERY_RANGE_OUT_OF_BOUNDS');
 const concrete=blocks.map(normalize),baselines=baselineExceptions.map(x=>normalize({...x,state:'HARD'}));
 const available=overrides.map(v=>normalize({...v,state:'SOFT'}));
 const releases=baselineReleases.map(x=>{if(!clean(x.targetExceptionId))throw Error('MISSING_BASELINE_REFERENCE');return normalize({...x,state:'SOFT'});});
 const baselineIds=new Set();for(const b of baselines){if(!clean(b.id)||baselineIds.has(clean(b.id)))throw Error('INVALID_BASELINE_ID');baselineIds.add(clean(b.id));}
 for(const r of releases){const parent=baselines.find(b=>clean(b.id)===clean(r.targetExceptionId));if(!parent)throw Error('UNKNOWN_BASELINE_REFERENCE');if(r.from<parent.from||r.to>parent.to||r.startMinute<parent.startMinute||r.endMinute>parent.endMinute)throw Error('RELEASE_OUTSIDE_BASELINE');}
 const result=[];
 for(let day=from;day<=to;day++){
  const date=new Date(day*86400000).toISOString().slice(0,10),weekday=(new Date(day*86400000).getUTCDay()+6)%7;
  const active=concrete.filter(x=>x.from<=day&&x.to>=day);
  const effectiveBaselines=baselines.filter(x=>x.from<=day&&x.to>=day);
  const defaultRecurring=(weekday===5||weekday===6)&&!recurring.some(x=>x.weekday===weekday)?[...recurring,{weekday,start:'08:00',end:'18:00'}]:recurring;
  for(const pref of defaultRecurring){if(pref.weekday!==weekday)continue;const p=normalize({...pref,state:'SOFT',date,fromDate:date,toDate:date});
   const cuts=[p.startMinute,p.endMinute];for(const v of available){if(v.from>day||v.to<day)continue;cuts.push(Math.max(p.startMinute,Math.min(p.endMinute,v.startMinute)),Math.max(p.startMinute,Math.min(p.endMinute,v.endMinute)));}
   const sorted=[...new Set(cuts)].sort((a,b)=>a-b);for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(a!==b&&!available.some(v=>overlaps(v,day,a,b)))active.push({...p,startMinute:a,endMinute:b});}
  }
  const edges=[...new Set([0,1440,...active.flatMap(x=>[x.startMinute,x.endMinute]),...effectiveBaselines.flatMap(x=>[x.startMinute,x.endMinute]),...releases.filter(x=>x.from<=day&&x.to>=day).flatMap(x=>[x.startMinute,x.endMinute])])].sort((a,b)=>a-b),segments=[];
  for(let i=1;i<edges.length;i++){const a=edges[i-1],b=edges[i];if(a===b)continue;
   const unReleased=effectiveBaselines.filter(x=>overlaps(x,day,a,b)&&!releases.some(r=>clean(r.targetExceptionId)===clean(x.id)&&overlaps(r,day,a,b)));
   const matches=[...active.filter(x=>overlaps(x,day,a,b)),...unReleased].sort((x,y)=>rank[y.state]-rank[x.state]);
   const state=matches[0]?.state??'FREE',ids=matches.filter(x=>x.state===state).map(x=>clean(x.id)).filter(Boolean).sort();
   const last=segments.at(-1);if(last&&last.state===state&&JSON.stringify(last.sourceIds)===JSON.stringify(ids)){last.end=format(b);continue;}
   segments.push({start:format(a),end:format(b),state,sourceIds:ids});
  }
  result.push({date,segments});
 }
 return result;
}
export function intervalsOverlap(a,b){const x=normalize(a),y=normalize(b);return x.from<=y.to&&y.from<=x.to&&x.startMinute<y.endMinute&&y.startMinute<x.endMinute;}