/***********************************************************************
 * PlanningBatchCommitService.js
 * BUILD: 2026-09-16_ROADMAP_2_4_BATCH_COMMIT_R1_BOUNDED_CANONICAL
 *
 * PURPOSE
 *   Bounded batch orchestration for already-staged Concept Planning items.
 *   Returns an outcome per audit and never turns Concept into a second SSoT.
 *
 * GOVERNANCE
 *   - PlanningCanonicalCommitService_commit remains the only planning writer.
 *   - Every item is canonically revalidated at Commit.
 *   - One failed item does not suppress outcomes for the remaining items.
 *   - Input is bounded to protect GAS visible-work latency.
 *   - No speculative RPC/prefetch behavior.
 *   - Execution-local canonical caches/indexes can be reused naturally across
 *     the serial item commits; no new persistent cache or truth is introduced.
 ***********************************************************************/
var PLANNING_BATCH_COMMIT_BUILD='2026-09-16_ROADMAP_2_4_BATCH_COMMIT_R1_BOUNDED_CANONICAL';
var PLANNING_BATCH_COMMIT_MAX_ITEMS=20;

function PBC_clean_(v){return String(v==null?'':v).trim();}
function PBC_dependencies_(){return{canonicalCommit:typeof PlanningCanonicalCommitService_commit==='function'};}
function PBC_normalizeItems_(input){
  var items=input&&Array.isArray(input.items)?input.items:[];
  if(!items.length)throw new Error('PlanningBatchCommitService: items are required');
  if(items.length>PLANNING_BATCH_COMMIT_MAX_ITEMS)throw new Error('PlanningBatchCommitService: maximum '+PLANNING_BATCH_COMMIT_MAX_ITEMS+' items per batch');
  var out=[],seen={};
  for(var i=0;i<items.length;i++){
    var x=items[i]||{},id=PBC_clean_(x.auditId);
    if(!id)throw new Error('PlanningBatchCommitService: auditId is required for item '+(i+1));
    if(seen[id])throw new Error('PlanningBatchCommitService: duplicate auditId '+id);
    seen[id]=true;
    if(!PBC_clean_(x.expectedRevision))throw new Error('PlanningBatchCommitService: expectedRevision is required for '+id);
    if(!Array.isArray(x.blocks)||!x.blocks.length)throw new Error('PlanningBatchCommitService: blocks are required for '+id);
    out.push({
      auditId:id,
      expectedRevision:PBC_clean_(x.expectedRevision),
      auditorEmail:PBC_clean_(x.auditorEmail).toLowerCase(),
      auditorName:PBC_clean_(x.auditorName),
      blocks:x.blocks,
      actorRole:PBC_clean_(x.actorRole||input.actorRole||'MANAGER').toUpperCase(),
      actorEmail:PBC_clean_(x.actorEmail||input.actorEmail),
      waiverAccepted:x.waiverAccepted===true,
      allowWeekendOverride:x.allowWeekendOverride!==false
    });
  }
  return out;
}
function PBC_itemOutcome_(item,result,error,elapsedMs){
  if(error)return{auditId:item.auditId,ok:false,committed:false,reason:'EXCEPTION',message:PBC_clean_(error&&error.message||error),elapsedMs:elapsedMs,result:null};
  return{auditId:item.auditId,ok:!!(result&&result.success===true),committed:!!(result&&result.committed===true),reason:PBC_clean_(result&&result.reason),message:'',elapsedMs:elapsedMs,result:result||null};
}
function PlanningBatchCommitService_commit(input){
  input=input||{};
  var deps=PBC_dependencies_();
  if(!deps.canonicalCommit)throw new Error('PlanningBatchCommitService: PlanningCanonicalCommitService_commit unavailable');
  var items=PBC_normalizeItems_(input),started=Date.now(),outcomes=[],committed=0,blocked=0,errors=0;
  for(var i=0;i<items.length;i++){
    var item=items[i],t0=Date.now(),result=null,error=null;
    try{result=PlanningCanonicalCommitService_commit(item);}catch(e){error=e;}
    var outcome=PBC_itemOutcome_(item,result,error,Date.now()-t0);
    outcomes.push(outcome);
    if(outcome.committed)committed++;else if(error||outcome.ok!==true)errors++;else blocked++;
  }
  return{
    success:errors===0,
    build:PLANNING_BATCH_COMMIT_BUILD,
    requested:items.length,
    committed:committed,
    blocked:blocked,
    errors:errors,
    outcomes:outcomes,
    durationMs:Date.now()-started,
    meta:{
      bounded:true,
      maxItems:PLANNING_BATCH_COMMIT_MAX_ITEMS,
      serialVisibleWork:true,
      speculativeRpcCount:0,
      failIsolated:true,
      perItemCanonicalRevalidation:true,
      canonicalWriter:'PlanningCanonicalCommitService_commit',
      executionLocalCachesReusable:true,
      newSsot:false,
      directSheetWrites:false,
      conceptRemainsNonCanonical:true
    }
  };
}
function PlanningBatchCommitService_contract(){return{
  build:PLANNING_BATCH_COMMIT_BUILD,
  maxItems:PLANNING_BATCH_COMMIT_MAX_ITEMS,
  dependency:'PlanningCanonicalCommitService_commit',
  meta:{bounded:true,serialVisibleWork:true,speculativeRpcCount:0,failIsolated:true,perItemCanonicalRevalidation:true,executionLocalCachesReusable:true,newSsot:false,directSheetWrites:false,conceptRemainsNonCanonical:true}
};}
