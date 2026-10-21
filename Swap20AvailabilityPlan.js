/** Swap 2.0 pure pair reservation transform. No sheet writes. */
function Swap20_availabilityPlan_(before,proposal,owners){
 if(!before||!Array.isArray(before.values)||!proposal||!owners)throw Error('Missing swap availability input');
 var values=before.values.map(function(row){return row.slice();});
 var hdr=values[0].map(function(x){return String(x||'').toLowerCase().replace(/[_ -]/g,'');});
 function col(names){for(var n=0;n<names.length;n++){var ix=hdr.indexOf(names[n].toLowerCase().replace(/[_ -]/g,''));if(ix>=0)return ix;}throw Error('Missing availability column '+names[0]);}
 var d=col(['Date']),a=col(['Auditor_Email','Auditor Email']),available=col(['Available']);
 var slots=[{id:col(['Audit_ID_1']),start:col(['First_Audit_Start_Time']),end:col(['First_Audit_End_Time']),status:col(['Status_1'])},
 {id:col(['Audit_ID_2']),start:col(['Second_Audit_Start_Time']),end:col(['Second_Audit_End_Time']),status:col(['Status_2'])}];
 var ids=[String(proposal.auditA),String(proposal.auditB)],removed={};
 values.slice(1).forEach(function(row){slots.forEach(function(s){var id=String(row[s.id]||'').trim();if(ids.indexOf(id)<0)return;removed[id]=(removed[id]||0)+1;row[s.id]='';row[s.start]='';row[s.end]='';row[s.status]='';});row[available]=slots.some(function(s){return String(row[s.id]||'').trim();})?'NO':'';});
 var changes=[{id:ids[0],owner:owners[ids[0]],blocks:proposal.blocksA},{id:ids[1],owner:owners[ids[1]],blocks:proposal.blocksB}];
 changes.forEach(function(x){
  if(!x.owner||!Array.isArray(x.blocks)||!x.blocks.length)throw Error('Missing swap owner or blocks');
  if(removed[x.id]!==x.blocks.length)throw Error('Original availability reservation count mismatch');
  x.blocks.forEach(function(b){
   var key=String(x.owner).trim().toLowerCase(),row=null;
   for(var i=1;i<values.length;i++)if(String(values[i][a]||'').trim().toLowerCase()===key&&String(values[i][d]||'').trim()===String(b.date)){if(row)throw Error('Duplicate availability owner/day');row=values[i];}
   if(!row){row=new Array(hdr.length).fill('');row[d]=b.date;row[a]=x.owner;values.push(row);}
   var begin=Swap20_scheduleMinutes_(b.start),end=Swap20_scheduleMinutes_(b.end);
   if(begin>=end)throw Error('Invalid swap slot');
   slots.forEach(function(s){if(String(row[s.id]||'').trim()&&begin<Swap20_scheduleMinutes_(row[s.end])&&Swap20_scheduleMinutes_(row[s.start])<end)throw Error('Swap conflicts with unrelated reservation');});
   var free=slots.filter(function(s){return !String(row[s.id]||'').trim();})[0];
   if(!free)throw Error('No available reservation slot');
   row[free.id]=x.id;row[free.start]=b.start;row[free.end]=b.end;row[free.status]='Accepted';row[available]='NO';
  });
 });
 return {sheetName:before.sheetName,width:before.width,originalHeight:before.height,values:values};
}
