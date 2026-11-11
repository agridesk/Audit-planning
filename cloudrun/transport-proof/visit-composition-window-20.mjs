/** Issue #87: canonical obligation-window constraint for visit composition.
 * Read-only, fail closed on ambiguous or missing source dates. No writes.
 * Dates in DEV may be ISO YYYY-MM-DD or Dutch DD/MM/YYYY.
 */
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
function date(value){
 const raw=str(value);
 let y,m,d;
 let parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
 if(parts){y=+parts[1];m=+parts[2];d=+parts[3];}
 else{
  parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if(!parts)fail('COMPOSITION_WINDOW_DATE_UNRECOGNIZED');
  d=+parts[1];m=+parts[2];y=+parts[3];
 }
 const parsed=new Date(Date.UTC(y,m-1,d));
 if(parsed.getUTCFullYear()!==y||parsed.getUTCMonth()!==m-1||parsed.getUTCDate()!==d)
  fail('COMPOSITION_WINDOW_DATE_INVALID');
 return parsed.toISOString().slice(0,10);
}
function idx(headers,...aliases){
 const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
 return headers.findIndex(h=>aliases.includes(norm(h)));
}
export function verifyVisitCompositionWindows20({command,obligationRows}={}){
 if(command?.type!=='MODEL_C_COMPOSITION_PREFLIGHT'||command.canCommit!==false||
    !Array.isArray(command.obligationIds)||!command.obligationIds.length||
    !Array.isArray(obligationRows)||obligationRows.length<2)
   fail('COMPOSITION_WINDOW_CANONICAL_SOURCE_REQUIRED');
 const h=obligationRows[0];
 const oi=idx(h,'OBLIGATION_ID'),from=idx(h,'PLANNING_WINDOW_FROM'),to=idx(h,'PLANNING_WINDOW_TO');
 if([oi,from,to].some(i=>i<0))fail('COMPOSITION_WINDOW_SCHEMA_INVALID');
 const rows=new Map();
 for(const row of obligationRows.slice(1)){
  const id=str(row[oi]);
  if(!id)continue;
  if(rows.has(id))fail('COMPOSITION_WINDOW_DUPLICATE_OBLIGATION');
  rows.set(id,row);
 }
 const evidence=[];
 for(const obligationId of command.obligationIds){
  const row=rows.get(obligationId);
  if(!row)fail('COMPOSITION_WINDOW_OBLIGATION_NOT_FOUND');
  if(!str(row[from])||!str(row[to]))
   fail('COMPOSITION_WINDOW_MISSING_REQUIRES_MANUAL_RECONCILIATION');
  const fromDate=date(row[from]),toDate=date(row[to]);
  if(fromDate>toDate)fail('COMPOSITION_WINDOW_INVERTED');
  let blocks;
  if(command.mode==='TOGETHER'){
   const allocationIndices=new Set(command.allocations.filter(a=>a.obligationId===obligationId).map(a=>a.blockIndex));
   blocks=command.blocks.filter((_,i)=>allocationIndices.has(i));
   if(!blocks.length)fail('COMPOSITION_WINDOW_ALLOCATION_MISSING');
  }else if(command.mode==='SEPARATELY'){
   const matching=command.visits.filter(v=>v.obligationId===obligationId);
   if(matching.length!==1)fail('COMPOSITION_WINDOW_VISIT_PARTITION_INVALID');
   blocks=matching[0].blocks;
  }else fail('COMPOSITION_WINDOW_MODE_INVALID');
  for(const block of blocks){
   if(str(block.date)<fromDate||str(block.date)>toDate)
    fail('COMPOSITION_WINDOW_OUTSIDE_ALLOWED_PERIOD');
  }
  evidence.push({obligationId,from:fromDate,to:toDate,checkedBlocks:blocks.length});
 }
 return Object.freeze({verified:true,obligations:evidence,canCommit:false,source:'AUDIT_OBLIGATIONS'});
}
