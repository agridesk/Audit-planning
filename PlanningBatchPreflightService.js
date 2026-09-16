/***********************************************************************
 * PlanningBatchPreflightService.js
 * BUILD: 2026-09-16_ROADMAP_2_4_BATCH_PREFLIGHT_R1_BOUNDED_CANONICAL
 *
 * Read-only preview for a bounded batch before canonical Batch Commit.
 * Each item is evaluated by the existing canonical Commit gate.
 ***********************************************************************/
var PLANNING_BATCH_PREFLIGHT_BUILD='2026-09-16_ROADMAP_2_4_BATCH_PREFLIGHT_R1_BOUNDED_CANONICAL';
var PLANNING_BATCH_PREFLIGHT_MAX_ITEMS=20;
function PBP_clean_(v){return String(v==null?'':v).trim();}
function PBP_normalize_(input){
 input=input||{};var items=Array.isArray(input.items)?input.items:[];
 if(!items.length)throw new Error('PlanningBatchPreflightService: items are required');
 if(items.length>PLANNING_BATCH_PREFLIGHT_MAX_ITEMS)throw new Error('PlanningBatchPreflightService: maximum 20 items per batch');
 var out=[],seen={};for(var i=0;i<items.length;i++){var x=items[i]||{},id=PBP_clean_(x.auditId);if(!id)throw new Error('PlanningBatchPreflightService: auditId is required for item '+(i+1));if(seen[id])throw new Error('PlanningBatchPreflightService: duplicate auditId '+id);seen[id]=1;if(!PBP_clean_(x.expectedRevision))throw new Error('PlanningBatchPreflightService: expectedRevision is required for '+id);if(!Array.isArray(x.blocks)||!x.blocks.length)throw new Error('PlanningBatchPreflightService: blocks are required for '+id);out.push({auditId:id,expectedRevision:PBP_clean_(x.expectedRevision),auditorEmail:PBP_clean_(x.auditorEmail).toLowerCase(),auditorName:PBP_clean_(x.auditorName),blocks:x.blocks,waiverAccepted:x.waiverAccepted===true});}return out;
}
function PlanningBatchPreflightService_evaluate(input){
 if(typeof PlanningCommitGateService_evaluate!=='function')throw new Error('PlanningBatchPreflightService: PlanningCommitGateService_evaluate unavailable');
 var items=PBP_normalize_(input),started=Date.now(),outcomes=[],ready=0,blocked=0,errors=0;
 for(var i=0;i<items.length;i++){var x=items[i],t0=Date.now(),gate=null,error=null;try{gate=PlanningCommitGateService_evaluate(x);}catch(e){error=e;}var canCommit=!error&&gate&&gate.canCommit===true;if(canCommit)ready++;else if(error)errors++;else blocked++;outcomes.push({auditId:x.auditId,ok:!error,canCommit:canCommit,reason:error?'EXCEPTION':PBP_clean_(gate&&gate.reason),message:error?PBP_clean_(error&&error.message||error):'',elapsedMs:Date.now()-t0,gate:gate||null});}
 return{success:errors===0,build:PLANNING_BATCH_PREFLIGHT_BUILD,requested:items.length,ready:ready,blocked:blocked,errors:errors,allReady:ready===items.length,outcomes:outcomes,durationMs:Date.now()-started,meta:{readOnly:true,writes:false,bounded:true,maxItems:20,perItemCanonicalGate:true,canonicalGateOwner:'PlanningCommitGateService_evaluate',newSsot:false,directSheetWrites:false}};
}
function PlanningBatchPreflightService_contract(){return{build:PLANNING_BATCH_PREFLIGHT_BUILD,maxItems:20,dependency:'PlanningCommitGateService_evaluate',meta:{readOnly:true,writes:false,bounded:true,perItemCanonicalGate:true,newSsot:false,directSheetWrites:false}};}
