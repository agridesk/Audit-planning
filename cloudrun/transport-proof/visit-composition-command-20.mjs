// Issue #87: prepare a canonical Model C composition command without mutating state.
// This is a preflight contract, NOT a writer or permission to enable a cutover.
import {previewVisitComposition20} from './visit-composition-preview-20.mjs';
import {validateVisitScopeAllocation20} from './visit-scope-allocation-20.mjs';

const str = value => String(value ?? '').trim();
const fail = code => { const e = new Error(code); e.code=code; throw e; };
const minute = time => {
  if(!/^\d{2}:\d{2}$/.test(str(time)))fail('COMPOSITION_COMMAND_TIME_INVALID');
  const [h,m]=time.split(':').map(Number);
  if(h>23||m>59)fail('COMPOSITION_COMMAND_TIME_INVALID');
  return h*60+m;
};
const checkBlocks = blocks => {
  if(!Array.isArray(blocks)||!blocks.length||blocks.length>50)fail('COMPOSITION_COMMAND_BLOCKS_INVALID');
  const seen=[];
  for(const b of blocks){
    const date=str(b?.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(!Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))
      fail('COMPOSITION_COMMAND_DATE_INVALID');
    const start=minute(b.start),end=minute(b.end);
    if(end<=start||start%15||end%15)fail('COMPOSITION_COMMAND_BLOCK_QUARTER_HOUR_REQUIRED');
    if(seen.some(x=>x.date===date&&x.start<end&&start<x.end))fail('COMPOSITION_COMMAND_BLOCK_OVERLAP');
    seen.push({date,start,end});
  }
  return seen;
};
const hours = minutes => Math.round(minutes/60*100)/100;

/**
 * Together:
 *   one existing source Audit ID; explicit, exhaustive per-obligation time
 *   allocation; no unissued Visit identities.
 * Separately:
 *   source Audit ID is retained for one obligation; all others require
 *   canonical-issued, unique new Audit IDs and standalone block schedules.
 *   An actual writer must CAS-check source/links and atomically transfer
 *   obligations, capacity claims, notifications and projections.
 */
export function prepareVisitCompositionCommand20({
  auditId,companyUid,sourceRevision,obligations,mode,blocks,allocations,visits
}={}){
  const revision=str(sourceRevision);
  if(!/^[a-f0-9]{24}$/.test(revision))fail('COMPOSITION_COMMAND_CANONICAL_REVISION_REQUIRED');
  const preview=previewVisitComposition20({auditId,companyUid,obligations,mode});
  if(!preview.compositionRequired)fail('COMPOSITION_COMMAND_MULTISCOPE_REQUIRED');
  if(mode!==preview.mode)fail('COMPOSITION_COMMAND_MODE_NOT_CANONICAL');
  const expectedIds=preview.obligations.map(o=>o.obligationId);
  if(preview.mode==='TOGETHER'){
    const windows=checkBlocks(blocks);
    if(visits!==undefined)fail('COMPOSITION_COMMAND_UNEXPECTED_VISITS');
    const validated=validateVisitScopeAllocation20({obligations:preview.obligations,blocks,allocations});
    const required=preview.totalRequiredMinutes;
    if(validated.totalMinutes!==required)fail('COMPOSITION_COMMAND_TOTAL_MISMATCH');
    return Object.freeze({
      type:'MODEL_C_COMPOSITION_PREFLIGHT',mode:'TOGETHER',auditId:preview.sourceAuditId,
      companyUid:preview.companyUid,sourceRevision:revision,
      obligationIds:expectedIds,blocks:structuredClone(blocks),
      allocations:validated.allocations,totalMinutes:required,totalHours:hours(required),
      blockCount:windows.length,canCommit:false,writerRequired:'ATOMIC_MODEL_C_COMPOSITION'
    });
  }
  if(blocks!==undefined||allocations!==undefined)fail('COMPOSITION_COMMAND_UNEXPECTED_AGGREGATE_BLOCKS');
  if(!Array.isArray(visits)||visits.length!==expectedIds.length)fail('COMPOSITION_COMMAND_VISITS_REQUIRED');
  const expected=new Set(expectedIds),used=new Set(),auditIds=new Set(),prepared=[];
  for(const visit of visits){
    const obligationId=str(visit?.obligationId),visitAuditId=str(visit?.auditId);
    if(!expected.has(obligationId)||used.has(obligationId))fail('COMPOSITION_COMMAND_OBLIGATION_PARTITION_INVALID');
    used.add(obligationId);
    if(!visitAuditId||auditIds.has(visitAuditId))fail('COMPOSITION_COMMAND_AUDIT_ID_COLLISION');
    auditIds.add(visitAuditId);
    if(visitAuditId!==preview.sourceAuditId){
      if(visit?.identityIssuedBy!=='CANONICAL' || !/^[a-f0-9]{24}$/.test(str(visit?.identityIssueRevision)))
        fail('COMPOSITION_COMMAND_CANONICAL_VISIT_IDENTITY_REQUIRED');
    }else if(visit?.identityIssuedBy!==undefined||visit?.identityIssueRevision!==undefined)
      fail('COMPOSITION_COMMAND_SOURCE_IDENTITY_REISSUE_FORBIDDEN');
    const windows=checkBlocks(visit?.blocks);
    const planned=windows.reduce((sum,w)=>sum+w.end-w.start,0);
    const required=preview.obligations.find(o=>o.obligationId===obligationId).requiredMinutes;
    if(planned!==required)fail('COMPOSITION_COMMAND_SCOPE_MINUTES_MISMATCH');
    prepared.push({
      auditId:visitAuditId,obligationId,requiredMinutes:required,
      blocks:structuredClone(visit.blocks),sourceAuditId:preview.sourceAuditId
    });
  }
  if(!auditIds.has(preview.sourceAuditId))fail('COMPOSITION_COMMAND_SOURCE_AUDIT_MUST_REMAIN');
  const all=prepared.flatMap(x=>x.blocks.map(b=>({...b,owner:x.auditId})));
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    if(all[i].date===all[j].date&&minute(all[i].start)<minute(all[j].end)&&minute(all[j].start)<minute(all[i].end))
      fail('COMPOSITION_COMMAND_CROSS_VISIT_OVERLAP');
  }
  return Object.freeze({
    type:'MODEL_C_COMPOSITION_PREFLIGHT',mode:'SEPARATELY',auditId:preview.sourceAuditId,
    companyUid:preview.companyUid,sourceRevision:revision,
    obligationIds:expectedIds,visits:prepared,totalMinutes:preview.totalRequiredMinutes,
    totalHours:hours(preview.totalRequiredMinutes),
    canCommit:false,writerRequired:'ATOMIC_MODEL_C_SPLIT_AND_LINK_TRANSFER'
  });
}
