/** DEV-only read-only lifecycle write normalizer.
 * Coalesce raw/USER_ENTERED partial row writes into a full before/after
 * image. Never performs any Sheets mutation.
 */
function parseRange(value){
 const m=/^([^!]+)!([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/.exec(value||'');
 if(!m)throw Error('LIFECYCLE_WRITESET_RANGE_UNSUPPORTED');
 const number=s=>[...s].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
 const startCol=number(m[2]),endCol=m[4]?number(m[4]):startCol;
 const startRow=Number(m[3]),endRow=m[5]?Number(m[5]):startRow;
 if(endCol<startCol||endRow<startRow||endRow-startRow>100||endCol-startCol>150)throw Error('LIFECYCLE_WRITESET_RANGE_INVALID');
 return {sheet:m[1],startRow,endRow,startCol,endCol};
}
function label(n){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export async function normalizeLifecycleWriteset({writes,readBefore}={}){
 if(!Array.isArray(writes)||!writes.length||writes.length>150||typeof readBefore!=='function')throw Error('LIFECYCLE_WRITESET_INPUT_INVALID');
 const groups=new Map(),steps=[];
 for(const write of writes){
  const r=parseRange(write?.range),values=write?.values;
  if(!Array.isArray(values)||values.length!==r.endRow-r.startRow+1||values.some(row=>!Array.isArray(row)||row.length<1||row.length>r.endCol-r.startCol+1))throw Error('LIFECYCLE_WRITESET_VALUES_INVALID');
  // Sheets value updates permit omitted trailing empty cells in an A1 row range.
  // Normalize only the missing tail; reject oversized/empty records and preserve
  // every explicitly supplied cell before constructing the canonical writeset.
  const width=r.endCol-r.startCol+1;
  const fullRows=values.map(row=>row.concat(Array(width-row.length).fill('')));
  for(let i=0;i<values.length;i++){
   const row=r.startRow+i,key=r.sheet+'!'+row;
   if(!groups.has(key))groups.set(key,{sheet:r.sheet,row,first:r.startCol,last:r.endCol});
   const group=groups.get(key);group.first=Math.min(group.first,r.startCol);group.last=Math.max(group.last,r.endCol);
   steps.push({key,startCol:r.startCol,endCol:r.endCol,values:fullRows[i]});
  }
 }
 if(groups.size>120)throw Error('LIFECYCLE_WRITESET_TOO_MANY_ROWS');
 const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 const ranges=ordered.map(([,g])=>g.sheet+'!'+label(g.first)+g.row+':'+label(g.last)+g.row);
 const originals=await readBefore(ranges);
 if(!Array.isArray(originals)||originals.length!==ranges.length)throw Error('LIFECYCLE_WRITESET_READ_MISSING');
 const merged=new Map();
 for(let i=0;i<ordered.length;i++){
  const [key,g]=ordered[i],before=originals[i]?.values?.[0]||[];
  if(!Array.isArray(before)||before.length>g.last-g.first+1)throw Error('LIFECYCLE_WRITESET_SOURCE_CORRUPT');
  const original=Array.from({length:g.last-g.first+1},(_,j)=>before[j]??'');
  merged.set(key,{...g,range:ranges[i],before:original,after:original.slice()});
 }
 for(const step of steps){
  const g=merged.get(step.key);
  for(let col=step.startCol;col<=step.endCol;col++)g.after[col-g.first]=step.values[col-step.startCol];
 }
 return {
  projectionWrites:ordered.map(([key])=>{const g=merged.get(key);return {range:g.range,values:[g.after]};}),
  projectionPreconditions:ordered.map(([key])=>{const g=merged.get(key);return {range:g.range,before:g.before};})
 };
}

// Reject's deleted planning row is read with the other BEFORE images, without
// reusing the writer's earlier snapshot or skipping the projector's rechecks.
export async function normalizeRejectWritesetWithPlanning({writes,readBefore}={}){
 if(!Array.isArray(writes)||writes.some(w=>/^Audit planning!/.test(w?.range||'')))
  throw Error('LIFECYCLE_REJECT_PLANNING_WRITES_UNSUPPORTED');
 let planning;
 const normalized=await normalizeLifecycleWriteset({writes,readBefore:async ranges=>{
  const result=await readBefore(['Audit planning!A1:BW2000',...ranges]);
  if(!Array.isArray(result)||result.length!==ranges.length+1||!result[0]||
     !Array.isArray(result[0].values))throw Error('LIFECYCLE_PREFLIGHT_PLANNING_INCOMPLETE');
  planning=result[0].values;
  return result.slice(1);
 }});
 return {planning,normalized};
}

export function mergeLifecycleWritesets(first,second){
 const entries=[];
 for(const part of [first,second]){
  if(!Array.isArray(part?.projectionWrites)||!Array.isArray(part?.projectionPreconditions)||
     part.projectionWrites.length!==part.projectionPreconditions.length)throw Error('LIFECYCLE_WRITESET_INPUT_INVALID');
  for(let i=0;i<part.projectionWrites.length;i++){
   const write=part.projectionWrites[i],pre=part.projectionPreconditions[i],r=parseRange(write.range);
   if(r.startRow!==r.endRow||pre?.range!==write.range)throw Error('LIFECYCLE_WRITESET_RANGE_INVALID');
   entries.push({key:r.sheet+'!'+r.startRow,write,pre});
  }
 }
 entries.sort((a,b)=>a.key.localeCompare(b.key));
 if(entries.some((entry,i)=>i>0&&entry.key===entries[i-1].key))throw Error('LIFECYCLE_WRITESET_OVERLAPPING_ROWS');
 return {projectionWrites:entries.map(x=>x.write),projectionPreconditions:entries.map(x=>x.pre)};
}
