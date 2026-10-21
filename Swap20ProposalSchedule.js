/**
 * Swap 2.0 schedule owner: strictly exchange complete canonical slot sets.
 * Rejects ambiguous unequal block shapes rather than silently truncating.
 * No canonical or availability mutations.
 */
function Swap20_scheduleMinutes_(value){
 var m=/^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(value||''));
 if(!m)throw Error('Invalid swap clock');
 return Number(m[1])*60+Number(m[2]);
}
function Swap20_scheduleDate_(value){
 var s=String(value||''),d=new Date(s+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid swap date');
 return s;
}
function Swap20_scheduleNormalize_(blocks){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>30)throw Error('Invalid swap blocks');
 return blocks.map(function(b){
  var date=Swap20_scheduleDate_(b.date),start=String(b.start||''),end=String(b.end||'');
  if(Swap20_scheduleMinutes_(end)<=Swap20_scheduleMinutes_(start))throw Error('Invalid swap duration');
  return {date:date,start:start,end:end};
 });
}
function Swap20_scheduleExchange_(pair){
 if(!pair||!pair.eligible||!pair.auditA||!pair.auditB)throw Error('Ineligible canonical pair');
 var a=Swap20_scheduleNormalize_(pair.auditA.blocks),b=Swap20_scheduleNormalize_(pair.auditB.blocks);
 if(a.length!==b.length)throw Error('Unequal swap block count requires explicit mapping');
 var outA=[],outB=[],dateChanged=false;
 for(var i=0;i<a.length;i++){
  var durationA=Swap20_scheduleMinutes_(a[i].end)-Swap20_scheduleMinutes_(a[i].start);
  var durationB=Swap20_scheduleMinutes_(b[i].end)-Swap20_scheduleMinutes_(b[i].start);
  if(durationA!==durationB)throw Error('Unequal swap block duration requires explicit mapping');
  outA.push({date:b[i].date,start:b[i].start,end:b[i].end});
  outB.push({date:a[i].date,start:a[i].start,end:a[i].end});
  if(a[i].date!==outA[i].date||b[i].date!==outB[i].date)dateChanged=true;
 }
 if(JSON.stringify(outA)===JSON.stringify(a)&&JSON.stringify(outB)===JSON.stringify(b))throw Error('Swap has no schedule change');
 if(typeof Swap20_overlap_!=='function')throw Error('Swap overlap rule unavailable');
 if(String(pair.auditA.assignedTo||'').toLowerCase()===String(pair.auditB.assignedTo||'').toLowerCase()){
  outA.forEach(function(x){outB.forEach(function(y){if(Swap20_overlap_(x,y))throw Error('Swap overlaps same auditor');});});
 }
 return {blocksA:outA,blocksB:outB,dateChanged:dateChanged,requiresAcknowledgement:dateChanged};
}
