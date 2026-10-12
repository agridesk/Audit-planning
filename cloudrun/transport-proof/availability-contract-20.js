// AMS Availability 2.0 — canonical exception and preference validation.
// Storage-independent DTO boundary; persistence must use a governed writer.
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const HHMM=/^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS=['MO','TU','WE','TH','FR','SA','SU'];
function date(x){if(typeof x!=='string'||!ISO.test(x)||Number.isNaN(Date.parse(x+'T00:00:00Z'))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)throw Error('AV20_INVALID_DATE');return x;}
function minute(x){if(typeof x!=='string')throw Error('AV20_INVALID_TIME');const m=HHMM.exec(x);if(!m)throw Error('AV20_INVALID_TIME');return Number(m[1])*60+Number(m[2]);}
function interval(input){if(input?.wholeDay===true)return{wholeDay:true,start:0,end:1440};const start=minute(input?.start),end=minute(input?.end);if(start>=end)throw Error('AV20_INVALID_TIME_RANGE');return{wholeDay:false,start,end};}
export function av20ValidateHardException(value){
  if(value?.kind!=='HARD')throw Error('AV20_HARD_REQUIRED');
  const from=date(value.from),until=date(value.until||value.from);
  if(from>until)throw Error('AV20_REVERSED_RANGE');
  return{kind:'HARD',from,until,...interval(value)};
}
export function av20ValidateRecurringWeek(value){
  if(!Array.isArray(value)||value.length!==7)throw Error('AV20_WEEK_REQUIRES_SEVEN_DAYS');
  return value.map((d,i)=>{
    if(d?.day!==WEEKDAYS[i])throw Error('AV20_WEEKDAY_ORDER');
    if(d.mode==='AVAILABLE')return{day:d.day,mode:'AVAILABLE'};
    if(d.mode!=='SOFT')throw Error('AV20_INVALID_RECURRING_MODE');
    return{day:d.day,mode:'SOFT',...interval(d)};
  });
}
export function av20ValidateAvailableOverride(value){
  if(value?.kind!=='AVAILABLE_OVERRIDE')throw Error('AV20_OVERRIDE_KIND');
  return{kind:'AVAILABLE_OVERRIDE',date:date(value.date),...interval(value)};
}
export function av20DayInRange(day,from,until){return date(day)>=date(from)&&date(day)<=date(until);}
export function av20MinutesToClock(n){if(!Number.isInteger(n)||n<0||n>1440)throw Error('AV20_INVALID_MINUTE');return n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
