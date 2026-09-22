/**
 * FILE: PlanningReAdjustModelCPolicy.gs
 * BUILD: 2026-09-22_AMS03_READJUST_MODEL_C_POLICY_R1
 *
 * Read-only policy/read model for controlled planning re-adjustment.
 * No writes, no Availability mutation, no status mutation.
 *
 * Canonical ownership:
 * - Audit visit operational status/planning: Audit planning projection.
 * - Scope/cycle/window/formal hours: Audit_Obligations.
 * - Visit <-> obligation membership: Audit_Visit_Obligations.
 *
 * Policy R1:
 * - Pending Approval: date/time re-adjust allowed, status preserved.
 * - Approved: date/time re-adjust allowed, status preserved.
 * - Accepted: date/time re-adjust allowed, returns to Approved and requires re-acceptance.
 * - Other statuses: not re-adjustable by this workflow.
 * - Auditor change remains outside this workflow.
 * - Planning-window truth is the intersection of active linked obligations.
 */
var PLANNING_READJUST_MODEL_C_POLICY_BUILD='2026-09-22_AMS03_READJUST_MODEL_C_POLICY_R1';

function getPlanningReAdjustModelCPolicyV5(payload){
  payload=payload||{};
  var auditId=String(payload.auditId||'').trim();
  if(!auditId)return{success:false,build:PLANNING_READJUST_MODEL_C_POLICY_BUILD,readOnly:true,writesPerformed:false,error:'AUDIT_ID_REQUIRED'};
  return PlanningReAdjustModelCPolicy_build_(SpreadsheetApp.getActive(),auditId);
}

function PlanningReAdjustModelCPolicy_statusRule_(raw){
  var s=String(raw||'').trim().toLowerCase().replace(/_/g,' ' ).replace(/\s+/g,' ');
  if(s==='pending approval')return{modifiable:true,before:'Pending Approval',after:'Pending Approval',statusPreserved:true,reacceptanceRequired:false};
  if(s==='approved')return{modifiable:true,before:'Approved',after:'Approved',statusPreserved:true,reacceptanceRequired:false};
  if(s==='accepted')return{modifiable:true,before:'Accepted',after:'Approved',statusPreserved:false,reacceptanceRequired:true};
  return{modifiable:false,before:String(raw||'').trim(),after:String(raw||'').trim(),statusPreserved:true,reacceptanceRequired:false};
}

function PlanningReAdjustModelCPolicy_build_(ss,auditId){
  ss=ss||SpreadsheetApp.getActive();
  auditId=String(auditId||'').trim();
  var t0=Date.now(),out={success:false,build:PLANNING_READJUST_MODEL_C_POLICY_BUILD,readOnly:true,writesPerformed:false,auditId:auditId,status:'',policy:{},obligations:[],planningWindow:{from:'',to:'',valid:true},summary:{},warnings:[],errors:[],serverMs:0};
  var shAp=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING),shOb=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),shLink=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!shAp)out.errors.push('Missing sheet: '+MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!shOb)out.errors.push('Missing sheet: '+MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  if(!shLink)out.errors.push('Missing sheet: '+MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(out.errors.length){out.serverMs=Date.now()-t0;return out;}

  var ap=PlanningReAdjustModelCPolicy_rows_(shAp.getDataRange().getValues()),obs=PlanningReAdjustModelCPolicy_rows_(shOb.getDataRange().getValues()),links=PlanningReAdjustModelCPolicy_rows_(shLink.getDataRange().getValues());
  var apRow=null;
  for(var i=0;i<ap.length;i++){
    if(String(PlanningReAdjustModelCPolicy_pick_(ap[i],['Audit ID','Audit_ID','AuditId'])||'').trim()===auditId){apRow=ap[i];break;}
  }
  if(!apRow){out.errors.push('Audit not found: '+auditId);out.serverMs=Date.now()-t0;return out;}

  out.status=String(PlanningReAdjustModelCPolicy_pick_(apRow,['Status'])||'').trim();
  var rule=PlanningReAdjustModelCPolicy_statusRule_(out.status);
  out.policy={
    modifiable:rule.modifiable,
    beforeStatus:rule.before,
    afterStatus:rule.after,
    statusPreserved:rule.statusPreserved,
    reacceptanceRequired:rule.reacceptanceRequired,
    sameAuditorOnly:true,
    allowedChanges:['DATE','TIME','BLOCK_DISTRIBUTION'],
    disallowedChanges:['AUDITOR'],
    planningWindowOwner:'Audit_Obligations intersection',
    availabilityMutationOwner:'PlanningCanonicalModifyService',
    writeOwner:'PlanningCanonicalModifyService'
  };

  var obById={};obs.forEach(function(o){var id=String(o.Obligation_ID||'').trim();if(id)obById[id]=o;});
  var active=[];
  links.forEach(function(l){
    if(String(l.Audit_ID||'').trim()!==auditId)return;
    if(String(l.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(l.Obligation_ID||'').trim()];if(!ob)return;
    var state=String(ob.Obligation_State||'').trim().toUpperCase();
    if(state==='CANCELLED'||state==='CANCELED'||state==='INACTIVE'||state==='CLOSED')return;
    active.push(ob);
  });

  var from='',to='',totalHours=0,scopeSet={};
  active.forEach(function(ob){
    var f=PlanningReAdjustModelCPolicy_date_(ob.Planning_Window_From),t=PlanningReAdjustModelCPolicy_date_(ob.Planning_Window_To),h=PlanningReAdjustModelCPolicy_num_(ob.Formal_Hours),scope=String(ob.ScopeCode||'').trim();
    if(f&&(!from||f>from))from=f;
    if(t&&(!to||t<to))to=t;
    totalHours+=h;if(scope)scopeSet[scope]=true;
    out.obligations.push({obligationId:String(ob.Obligation_ID||''),companyScopeId:String(ob.Company_Scope_ID||''),scopeCode:scope,cycleKey:String(ob.Cycle_Key||''),formalHours:h,planningWindowFrom:f,planningWindowTo:t,obligationState:String(ob.Obligation_State||'')});
  });
  out.obligations.sort(function(a,b){return a.scopeCode.localeCompare(b.scopeCode)||a.obligationId.localeCompare(b.obligationId);});
  out.planningWindow={from:from,to:to,valid:!(from&&to&&from>to)};
  if(!out.planningWindow.valid)out.errors.push('Linked obligation planning windows have empty intersection.');
  if(!active.length)out.warnings.push('No active Model C obligations linked to this Audit ID.');
  out.summary={linkedObligations:active.length,scopes:Object.keys(scopeSet).sort(),formalHours:Math.round(totalHours*100)/100};
  out.success=out.errors.length===0;
  out.serverMs=Date.now()-t0;
  return out;
}

function PlanningReAdjustModelCPolicy_rows_(values){
  values=values||[];if(!values.length)return[];var h=values[0]||[],out=[];
  for(var r=1;r<values.length;r++){var o={},has=false;for(var c=0;c<h.length;c++){var k=String(h[c]||'').trim();if(!k)continue;o[k]=values[r][c];if(values[r][c]!==''&&values[r][c]!=null)has=true;}if(has)out.push(o);}return out;
}
function PlanningReAdjustModelCPolicy_pick_(obj,names){var n={};Object.keys(obj||{}).forEach(function(k){n[String(k).trim().toLowerCase()]=obj[k];});for(var i=0;i<(names||[]).length;i++){var k=String(names[i]||'').trim().toLowerCase();if(Object.prototype.hasOwnProperty.call(n,k))return n[k];}return'';}
function PlanningReAdjustModelCPolicy_num_(v){var n=typeof v==='number'?v:Number(String(v==null?'':v).replace(',','.').trim());return isFinite(n)?n:0;}
function PlanningReAdjustModelCPolicy_date_(v){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');var s=String(v||'').trim(),m=s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);return m?m[1]+'-'+m[2]+'-'+m[3]:'';}
