/***********************************************************************
 * PlanningWorkspaceDecisionReadModel.js
 * BUILD: 2026-09-23_AMS01_3_WORKSPACE_DECISION_READ_MODEL_R2_SOURCE_TELEMETRY_CONTEXT
 *
 * Compact, read-only decision projection over existing canonical/read-model
 * owners. No new SSoT, cache or write path.
 ***********************************************************************/
var PLANNING_WORKSPACE_DECISION_READ_MODEL_BUILD='2026-09-23_AMS01_3_WORKSPACE_DECISION_READ_MODEL_R2_SOURCE_TELEMETRY_CONTEXT';
function PWDRM_clean_(v){return String(v==null?'':v).trim();}
function PWDRM_candidate_(x){return{email:PWDRM_clean_(x&&x.email).toLowerCase(),name:PWDRM_clean_(x&&x.name),preassigned:x&&x.isPreassigned===true,rotationWarning:x&&x.rotationWarning===true,performedCount:Number(x&&x.performedCount||0)||0,maxAllowed:Number(x&&x.maxAllowed||0)||0,blockedWeekdays:Array.isArray(x&&x.blockedWeekdays)?x.blockedWeekdays.slice():[]};}
function PWDRM_audit_(r){return{auditId:PWDRM_clean_(r&&r.auditId),companyUid:PWDRM_clean_(r&&r.companyUid),company:PWDRM_clean_(r&&r.company),country:PWDRM_clean_(r&&r.country),region:PWDRM_clean_(r&&r.region),status:PWDRM_clean_(r&&r.status),planningWindowFrom:PWDRM_clean_(r&&r.planningWindowFrom),planningWindowTo:PWDRM_clean_(r&&r.planningWindowTo),urgency:PWDRM_clean_(r&&r.urgency),scopes:Array.isArray(r&&r.scopes)?r.scopes.slice():[],hoursToPlan:Number(r&&r.hoursToPlan||0)||0,advisoryState:PWDRM_clean_(r&&r.advisoryState),advisoryReason:PWDRM_clean_(r&&r.advisoryReason),requiresCanonicalRefresh:r&&r.requiresCanonicalRefresh===true,candidateAuditors:(r&&r.candidateAuditors||[]).map(PWDRM_candidate_)};}
function PlanningWorkspaceDecisionReadModel_get(input){
 input=input||{};if(typeof ConceptPlanningService_get!=='function')throw new Error('PlanningWorkspaceDecisionReadModel: ConceptPlanningService_get unavailable');
 var t=Date.now(),a=ConceptPlanningService_get(input),rows=(a&&a.rows||[]).map(PWDRM_audit_),emails=[],seen={};
 for(var i=0;i<rows.length;i++)for(var j=0;j<rows[i].candidateAuditors.length;j++){var e=rows[i].candidateAuditors[j].email;if(e&&!seen[e]){seen[e]=1;emails.push(e);}}
 var sourceMeta=a&&a.meta||{},meta={};for(var mk in sourceMeta)if(Object.prototype.hasOwnProperty.call(sourceMeta,mk))meta[mk]=sourceMeta[mk];meta.writes=false;meta.newSsot=false;meta.compactDecisionProjection=true;meta.sourceOwner='ConceptPlanningService_get';meta.candidateAuditors=emails.length;meta.sourceBuild=a.build||'';meta.durationMs=Date.now()-t;var auditContextById={};for(var ai=0;ai<rows.length;ai++){var rr=rows[ai],id=PWDRM_clean_(rr.auditId);if(id)auditContextById[id]={company:rr.company,scopes:rr.scopes.slice(),status:rr.status};}var out={success:true,build:PLANNING_WORKSPACE_DECISION_READ_MODEL_BUILD,period:a.period,rows:rows,totals:a.totals||{},candidateAuditorEmails:emails,auditContextById:auditContextById,refreshPolicy:a.refreshPolicy||null,meta:meta};
 return out;
}
function PlanningWorkspaceDecisionReadModel_contract(){return{build:PLANNING_WORKSPACE_DECISION_READ_MODEL_BUILD,readOnly:true,newSsot:false,persistentCache:false,canonicalRulesReimplemented:false,sourceOwner:'ConceptPlanningService_get',purpose:'Compact Workspace decision payload shared by browser-facing Workspace orchestration.'};}
