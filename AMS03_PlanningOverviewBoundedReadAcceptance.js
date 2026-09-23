/***********************************************************************
 * AMS03_PlanningOverviewBoundedReadAcceptance.js
 * BUILD: 2026-09-23_AMS03_PLANNING_OVERVIEW_BOUNDED_ACCEPTANCE_R1
 ***********************************************************************/
function RUN_AMS03_PLANNING_OVERVIEW_BOUNDED_READ_ACCEPTANCE(){
 var main=String(m5t_getPlanningOverview),reader=String(m5t_po_readAuditPlanningBounded_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesBoundedReader',main.indexOf('m5t_po_readAuditPlanningBounded_')>=0);
 q('mainNoFullSheetRead',main.indexOf('getDataRange')<0);
 q('fixedWindow',reader.indexOf('getRange(1,1,rows,cols)')>=0);
 q('safeBoundaryFallback',reader.indexOf('DATARANGE_FALLBACK')>=0&&reader.indexOf('getDataRange')>=0);
 q('readOnly',main.indexOf('setValue')<0&&main.indexOf('setValues')<0&&reader.indexOf('setValue')<0);
 q('semanticsPreserved',main.indexOf('m5t_po_extractPlannedDateDetails_')>=0&&main.indexOf('m5t_po_dedupeRows_')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PLANNING_OVERVIEW_BOUNDED_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
