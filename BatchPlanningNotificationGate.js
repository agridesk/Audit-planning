/** FILE: BatchPlanningNotificationGate.gs
 * BUILD: 2026-09-18_BATCH_PLANNING_NOTIFICATION_GATE_R1
 * Defers manager PLAN notifications during a private Batch transaction.
 */
var BATCH_PLANNING_NOTIFICATION_GATE_BUILD='2026-09-18_BATCH_PLANNING_NOTIFICATION_GATE_R1';
var BATCH_PLANNING_NOTIFICATION_GATE_CTX=null;
function BatchPlanningNotificationGate_begin_(){BATCH_PLANNING_NOTIFICATION_GATE_CTX={active:true,deferred:[]};}
function BatchPlanningNotificationGate_end_(){var x=BATCH_PLANNING_NOTIFICATION_GATE_CTX||{deferred:[]};BATCH_PLANNING_NOTIFICATION_GATE_CTX=null;return x.deferred||[];}
function BatchPlanningNotificationGate_abort_(){BATCH_PLANNING_NOTIFICATION_GATE_CTX=null;}
function BatchPlanningNotificationGate_shouldDefer_(action,actor,ctx,payload,result){return !!(BATCH_PLANNING_NOTIFICATION_GATE_CTX&&BATCH_PLANNING_NOTIFICATION_GATE_CTX.active&&Status_normalizeAction_(action)===ACTION.PLAN&&Status_normalizeRole_(actor)===ROLE.MANAGER);}
function BatchPlanningNotificationGate_defer_(action,actor,ctx,payload,result){var item={action:action,actor:actor,ctx:ctx,payload:payload,result:result};BATCH_PLANNING_NOTIFICATION_GATE_CTX.deferred.push(item);return{success:true,deferred:true,reason:'BATCH_TRANSACTION_PENDING_COMMIT'};}
function BatchPlanningNotificationGate_flush_(items){var out=[];(items||[]).forEach(function(x){out.push(StatusNotificationBridge_Dispatch_(x.action,x.actor,x.ctx,x.payload,x.result));});return out;}
