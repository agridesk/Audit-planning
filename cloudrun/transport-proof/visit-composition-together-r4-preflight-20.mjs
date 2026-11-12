/** Issue #87: reuse the R4 canonical PLAN preflight for Together.
 * Pure source validator only; no HTTP route, no writes, no inferred allocation.
 */
import {validateScopeVisitAllocation20} from './model-c-scope-allocation-20.mjs';
const str=x=>String(x??'').trim();
const normal=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const idx=(h,name)=>h.findIndex(x=>str(x).toLowerCase()===name.toLowerCase());
const column=(headers,name)=>{const i=idx(headers,name);if(i<0)throw Error('TOGETHER_MODEL_C_COLUMN_MISSING_'+name);return i;};
function date(value){
 const s=str(value);if(!s)return '';
 let y,m,d;
 if(/^\d{4}-\d{2}-\d{2}$/.test(s)) [y,m,d]=s.split('-');
 else if(/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(s)) [d,m,y]=s.split(/[./-]/);
 else throw Error('TOGETHER_MODEL_C_WINDOW_DATE_INVALID');
 const iso=y+'-'+m+'-'+d,parsed=new Date(iso+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw Error('TOGETHER_MODEL_C_WINDOW_DATE_INVALID');
 return iso;
}
const min=t=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(str(t)))throw Error('TOGETHER_BLOCK_TIME_INVALID');return Number(t.slice(0,2))*60+Number(t.slice(3));};
export function validateTogetherCompositionPreflight20({auditId,companyUid,obligations,links,blocks,allocations,formalTargetMinutes,scopeCatalog=null}={}){
 auditId=str(auditId);companyUid=str(companyUid);
 if(!auditId||!companyUid||!Array.isArray(obligations)||!Array.isArray(links)||
    !Array.isArray(blocks)||!blocks.length||!Array.isArray(allocations)||
    !Number.isSafeInteger(formalTargetMinutes)||formalTargetMinutes<=0)
  throw Error('TOGETHER_PREFLIGHT_SOURCE_REQUIRED');
 const oh=obligations[0]||[],lh=links[0]||[];
 const obId=column(oh,'Obligation_ID'),obCompany=column(oh,'Company_UID'),
  obCode=column(oh,'ScopeCode'),obHours=column(oh,'Formal_Hours'),
  obState=column(oh,'Obligation_State'),from=column(oh,'Planning_Window_From'),
  to=column(oh,'Planning_Window_To');
 const liAudit=column(lh,'Audit_ID'),liOb=column(lh,'Obligation_ID'),
  liState=column(lh,'Link_State');
 const active=links.slice(1).filter(r=>normal(r[liState])==='ACTIVE');
 const source=active.filter(r=>str(r[liAudit])===auditId);
 const ids=source.map(r=>str(r[liOb]));
 if(ids.length<2||ids.some(x=>!x)||new Set(ids).size!==ids.length)
  throw Error('TOGETHER_ACTIVE_OBLIGATIONS_INVALID');
 if(active.some(r=>ids.includes(str(r[liOb]))&&str(r[liAudit])!==auditId))
  throw Error('TOGETHER_OBLIGATION_LINKED_ELSEWHERE');
 const rows=obligations.slice(1).filter(r=>ids.includes(str(r[obId])));
 if(rows.length!==ids.length||new Set(rows.map(r=>str(r[obId]))).size!==rows.length)
  throw Error('TOGETHER_OBLIGATION_SOURCE_CONFLICT');
 const required=rows.map(r=>{
  const value=Number(str(r[obHours]).replace(',','.')),minutes=Math.round(value*60);
  if(str(r[obCompany])!==companyUid||!str(r[obCode])||
     !['OPEN','LINKED_TO_VISIT'].includes(normal(r[obState]))||
     !Number.isFinite(value)||value<=0||!Number.isSafeInteger(minutes)||minutes<=0||
     Math.abs(value*60-minutes)>1e-8)
   throw Error('TOGETHER_OBLIGATION_HOURS_OR_IDENTITY_INVALID');
  return {auditId,companyUid,obligationId:str(r[obId]),scopeCode:str(r[obCode]),
   linkState:'ACTIVE',requiredMinutes:minutes,from:date(r[from]),to:date(r[to])};
 });
 if(required.reduce((n,r)=>n+r.requiredMinutes,0)!==formalTargetMinutes)
  throw Error('TOGETHER_FORMAL_HOURS_SOURCE_MISMATCH');
 const keyedBlocks=blocks.map(b=>{
  const fromMin=min(b.start),toMin=min(b.end),on=date(b.date);
  if(!on||fromMin>=toMin||fromMin<480||toMin>1080||fromMin%15||toMin%15)throw Error('TOGETHER_BLOCK_INVALID');
  for(const r of required)if(r.from&&on<r.from||r.to&&on>r.to)
   throw Error('TOGETHER_SCOPE_WINDOW_BLOCKED_'+r.scopeCode);
  return {...b,date:on,blockId:on+'|'+b.start+'|'+b.end};
 });
 const result=validateScopeVisitAllocation20({auditId,composition:'TOGETHER',
  obligations:required,blocks:keyedBlocks,allocations});
 if(result.scopes.some(x=>x.remainingMinutes!==0||x.plannedMinutes!==x.requiredMinutes)||
    result.blocks.some(x=>x.unallocatedMinutes!==0))
  throw Error('TOGETHER_SCOPE_MINUTES_INCOMPLETE');
 const offsiteBlocks=new Set(keyedBlocks.filter(b=>String(b.executionType||'ONSITE').toUpperCase()==='OFFSITE').map(b=>b.blockId));
 const offsiteAllocated=new Map(required.map(o=>[o.obligationId,0]));
 if(offsiteBlocks.size){
  if(!Array.isArray(scopeCatalog)||!scopeCatalog.length)
   throw Error('TOGETHER_OFFSITE_SCOPE_POLICY_MISSING');
  for(const b of keyedBlocks.filter(b=>offsiteBlocks.has(b.blockId)))
   if(str(b.execLoc)||str(b.executionLocation))throw Error('TOGETHER_OFFSITE_LOCATION_NOT_EMPTY');
  for(const a of allocations)if(offsiteBlocks.has(str(a.blockId)))
   offsiteAllocated.set(str(a.obligationId),offsiteAllocated.get(str(a.obligationId))+Number(a.minutes));
  for(const o of required){
   const matched=scopeCatalog.filter(c=>str(c.scopeCode).toLowerCase()===o.scopeCode.toLowerCase()&&c.active!==false&&c.archived!==true);
   if(matched.length!==1)throw Error('TOGETHER_OFFSITE_SCOPE_POLICY_AMBIGUOUS_'+o.scopeCode);
   const cap=Number(matched[0].maxOffsiteHours||0);
   if(!Number.isFinite(cap)||cap<0||offsiteAllocated.get(o.obligationId)>Math.round(cap*60))
    throw Error('TOGETHER_OFFSITE_SCOPE_MAX_EXCEEDED_'+o.scopeCode);
  }
 }
 const scopeAllocations=allocations.map(a=>({blockId:str(a.blockId),
  obligationId:str(a.obligationId),minutes:Number(a.minutes)}));
 return {composition:'TOGETHER',auditId,companyUid,
  scopeAllocation:{auditId,composition:'TOGETHER',
   obligations:required.map(({from,to,...x})=>x),blocks:keyedBlocks,allocations:scopeAllocations},
  scopeAllocations,offsiteMinutesByObligation:Object.fromEntries(offsiteAllocated),requiredMinutes:formalTargetMinutes,obligationIds:ids,
  canCommitOnlyViaAtomicOwner:true};
}
