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
  if(!Array.isArray(values)||values.length!==r.endRow-r.startRow+1||values.some(row=>!Array.isArray(row)||row.length!==r.endCol-r.startCol+1))throw Error('LIFECYCLE_WRITESET_VALUES_INVALID');
  for(let i=0;i<values.length;i++){
   const row=r.startRow+i,key=r.sheet+'!'+row;
   if(!groups.has(key))groups.set(key,{sheet:r.sheet,row,first:r.startCol,last:r.endCol});
   const group=groups.get(key);group.first=Math.min(group.first,r.startCol);group.last=Math.max(group.last,r.endCol);
   steps.push({key,startCol:r.startCol,endCol:r.endCol,values:values[i]});
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
