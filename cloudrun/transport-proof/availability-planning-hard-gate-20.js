/** Strict Firestore Availability 2.0 HARD gate for proposed planning intervals.
 * This module is pure: callers supply an authenticated canonical availability document.
 * Do not use resolved display state as a HARD source: COMMITTED has higher precedence.
 */
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
const minute=s=>{if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)&&s!=='24:00')throw Error('PLANNING_INTERVAL_INVALID');return s==='24:00'?1440:Number(s.slice(0,2))*60+Number(s.slice(3));};
export function enforceAvailabilityHardGate20({document,blocks}={}){
 if(!document||typeof document!=='object'||!Array.isArray(blocks)||!blocks.length)throw Error('AVAILABILITY_HARD_GATE_INPUT_INVALID');
 if(!Array.isArray(document.blocks)||!Array.isArray(document.baselineExceptions)||!Array.isArray(document.baselineReleases))throw Error('AVAILABILITY_HARD_GATE_SOURCE_INVALID');
 if(document.blocks.some(x=>!x||typeof x!=='object'||!['SOFT','PROVISIONAL','HARD','COMMITTED'].includes(x.state)))throw Error('AVAILABILITY_HARD_GATE_SOURCE_INVALID');
 const hardOnly={blocks:document.blocks.filter(x=>x?.state==='HARD'),baselineExceptions:document.baselineExceptions,baselineReleases:document.baselineReleases,recurring:[],overrides:[]};
 for(const block of blocks){
  const date=block?.date,start=block?.start,end=block?.end;
  const a=minute(start),b=minute(end);if(a>=b)throw Error('PLANNING_INTERVAL_INVALID');
  const days=resolveAvailabilityPeriod({fromDate:date,toDate:date,...hardOnly});
  if(days.length!==1)throw Error('AVAILABILITY_HARD_GATE_SOURCE_INVALID');
  if(days[0].segments.some(s=>s.state==='HARD'&&minute(s.start)<b&&minute(s.end)>a))throw Error('AVAILABILITY_HARD_BLOCK_'+date);
 }
 return true;
}
