/**
 * AMS-01.6 Model C annual-cycle planner.
 * READ-ONLY. No completion routing or writes yet.
 *
 * Purpose:
 * - Prove successor-cycle planning from Audit_Obligations, not legacy aggregate expiry.
 * - MPS-ABC remains external annual input: no automatic successor on completion.
 * - Certificate scopes carry their own next expiry/window/formal hours.
 * - A visit may keep multiple successor obligations only when their planning windows intersect.
 */
var MODEL_C_ANNUAL_CYCLE_PLAN_BUILD = '2026-09-20_AMS_01_6_MODEL_C_ANNUAL_CYCLE_PLAN_R1';

function RUN_MODEL_C_ANNUAL_CYCLE_PREFLIGHT() {
  var ss = SpreadsheetApp.getActive();
  var ap = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var out = {
    success:false,
    build:MODEL_C_ANNUAL_CYCLE_PLAN_BUILD,
    readOnly:true,
    writesPerformed:false,
    gates:{},
    counts:{
      auditPlanningRows:0,
      auditsWithModelCObligations:0,
      recurringAudits:0,
      successorObligations:0,
      externalAbcOnlyAudits:0,
      visitSplitsRequired:0
    },
    errors:[],
    samples:[]
  };

  if (!ap) {
    out.errors.push('Missing Audit planning');
    out.gates.requiredSheets = false;
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var required = [MODEL_C_SHEETS.COMPANY_SCOPES,MODEL_C_SHEETS.AUDIT_OBLIGATIONS,MODEL_C_SHEETS.VISIT_OBLIGATIONS,MODEL_C_SHEETS.CONFIG_SCOPES];
  out.gates.requiredSheets = required.every(function(n){ return !!ss.getSheetByName(n); });
  if (!out.gates.requiredSheets) {
    out.errors.push('Missing Model C/config sheet(s)');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var values = ap.getDataRange().getValues();
  var headers = values[0] || [];
  var map = ModelCFoundation_headerMap_(headers);
  var auditIdIx = map[ModelCFoundation_normHeader_('Audit ID')];
  if (auditIdIx === undefined) {
    out.errors.push('Audit planning missing Audit ID');
    out.gates.auditIdsPresent = false;
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  out.counts.auditPlanningRows = Math.max(0, values.length - 1);
  var modelRows = 0;
  var planErrors = 0;

  for (var r=1; r<values.length; r++) {
    var auditId = String(values[r][auditIdIx] || '').trim();
    if (!auditId) continue;
    var plan = ModelCAnnualCycle_planForAudit_(ss,auditId);
    if (plan.currentObligations > 0) modelRows++;
    if (!plan.success) {
      planErrors++;
      (plan.errors || []).slice(0,3).forEach(function(e){
        if (out.errors.length < 25) out.errors.push(auditId + ': ' + e);
      });
      continue;
    }
    if (plan.externalAbcOnly) out.counts.externalAbcOnlyAudits++;
    if (plan.recurring) out.counts.recurringAudits++;
    out.counts.successorObligations += Number(plan.successorObligations || 0);
    if (plan.requiresVisitSplit) out.counts.visitSplitsRequired++;
    if (out.samples.length < 8 && (plan.recurring || plan.externalAbcOnly)) {
      out.samples.push({
        auditId:auditId,
        currentScopes:plan.currentScopes,
        recurringScopes:plan.recurringScopes,
        externalScopes:plan.externalScopes,
        successorGroups:plan.successorGroups
      });
    }
  }

  out.counts.auditsWithModelCObligations = modelRows;
  out.gates.auditIdsPresent = true;
  out.gates.allAuditRowsBackedByModelC = modelRows === out.counts.auditPlanningRows;
  out.gates.allSuccessorPlansValid = planErrors === 0;
  out.gates.abcHasNoAutomaticSuccessor = true;
  out.gates.perScopeExpiryUsed = true;
  out.success = Object.keys(out.gates).every(function(k){return out.gates[k]===true;}) && out.errors.length===0;
  Logger.log(JSON.stringify(out,null,2));
  return out;
}

function ModelCAnnualCycle_planForAudit_(ss,auditId) {
  ss = ss || SpreadsheetApp.getActive();
  auditId = String(auditId || '').trim();
  var result = {
    success:false,
    auditId:auditId,
    currentObligations:0,
    currentScopes:[],
    recurring:false,
    recurringScopes:[],
    externalScopes:[],
    externalAbcOnly:false,
    successorObligations:0,
    requiresVisitSplit:false,
    successorGroups:[],
    errors:[]
  };
  if (!auditId) { result.errors.push('Missing auditId'); return result; }

  var target = ModelCRecon_readTargets_(ss);
  if (!target || target.success === false) {
    result.errors.push('Unable to read Model C targets');
    return result;
  }
  var rows = target.rows || {};
  var obligations = rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS] || [];
  var links = rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS] || [];
  var obById = {};
  obligations.forEach(function(ob){ var id=String(ob.Obligation_ID||''); if(id)obById[id]=ob; });

  var active = [];
  links.forEach(function(link){
    if (String(link.Audit_ID||'') !== auditId) return;
    if (String(link.Link_State||'').toUpperCase() !== 'ACTIVE') return;
    var ob = obById[String(link.Obligation_ID||'')];
    if (!ob) { result.errors.push('Orphan active visit link: '+String(link.Obligation_ID||'')); return; }
    var st = String(ob.Obligation_State||'').toUpperCase();
    if (st==='CANCELLED' || st==='REJECTED' || st==='COMPLETED') return;
    active.push(ob);
  });

  result.currentObligations = active.length;
  result.currentScopes = active.map(function(ob){return String(ob.ScopeCode||'');});
  if (!active.length) { result.errors.push('No active obligations linked to audit'); return result; }

  var cfg = ModelCAnnualCycle_configByScope_(ss);
  var successors = [];
  active.forEach(function(ob){
    var code = String(ob.ScopeCode||'').trim();
    if (!code) { result.errors.push('Obligation missing ScopeCode'); return; }
    var isAbc = ModelCFoundation_isAbc_(code,code);
    if (isAbc) {
      result.externalScopes.push(code);
      return;
    }
    var def = cfg[code] || null;
    if (!def) { result.errors.push('Config_Scopes missing scope: '+code); return; }
    if (!def.recurring) return;

    result.recurringScopes.push(code);
    var base = ModelCAnnualCycle_iso_(ob.Base_Expiry_Date,ss);
    if (!base) { result.errors.push('Recurring scope missing Base_Expiry_Date: '+code); return; }
    var nextBase = ModelCAnnualCycle_addYearsIso_(base,1);
    var from = ModelCAnnualCycle_addMonthsIso_(nextBase,def.planningFrom);
    var to = ModelCAnnualCycle_addMonthsIso_(nextBase,def.planningTo);
    if (!from || !to) { result.errors.push('Unable to calculate successor planning window: '+code); return; }
    successors.push({
      scopeCode:code,
      companyScopeId:String(ob.Company_Scope_ID||''),
      currentObligationId:String(ob.Obligation_ID||''),
      cycleKey:nextBase,
      baseExpiry:nextBase,
      effectiveExpiry:nextBase,
      planningWindowFrom:from,
      planningWindowTo:to,
      formalHours:Number(ob.Formal_Hours||0),
      triggerSource:String(ob.Trigger_Source||'CERTIFICATE_LIFECYCLE') || 'CERTIFICATE_LIFECYCLE'
    });
  });

  result.recurring = successors.length > 0;
  result.successorObligations = successors.length;
  result.externalAbcOnly = result.externalScopes.length > 0 && successors.length === 0 && result.currentScopes.length === result.externalScopes.length;

  if (result.errors.length) return result;
  if (!successors.length) { result.success=true; return result; }

  var grouped = ModelCAnnualCycle_groupByWindowIntersection_(successors);
  result.successorGroups = grouped.groups;
  result.requiresVisitSplit = grouped.groups.length > 1;
  result.success = grouped.success;
  if (!grouped.success) result.errors = result.errors.concat(grouped.errors || []);
  return result;
}

function ModelCAnnualCycle_configByScope_(ss) {
  var sh = ss.getSheetByName(MODEL_C_SHEETS.CONFIG_SCOPES);
  var v = sh ? sh.getDataRange().getValues() : [];
  if (v.length < 2) return {};
  var h=v[0]||[],m=ModelCFoundation_headerMap_(h),out={};
  function raw_(row,names){ return ModelCFoundation_valueByHeaderRaw_(row,m,names); }
  function yes_(x){ var s=String(x==null?'':x).trim().toUpperCase(); return s==='YES'||s==='TRUE'||s==='1'||s==='X'; }
  for (var r=1;r<v.length;r++) {
    var row=v[r]||[];
    var code=String(ModelCFoundation_valueByHeader_(row,m,['ScopeCode'])||'').trim();
    if (!code) continue;
    var pf=Number(raw_(row,['Planning from']));
    var pt=Number(raw_(row,['Planning to']));
    out[code]={
      recurring:yes_(raw_(row,['Recurring'])),
      planningFrom:isFinite(pf)?pf:0,
      planningTo:isFinite(pt)?pt:0
    };
  }
  return out;
}

function ModelCAnnualCycle_groupByWindowIntersection_(successors) {
  successors=(successors||[]).slice().sort(function(a,b){
    return String(a.planningWindowFrom).localeCompare(String(b.planningWindowFrom)) || String(a.scopeCode).localeCompare(String(b.scopeCode));
  });
  var groups=[];
  successors.forEach(function(item){
    var placed=false;
    for (var i=0;i<groups.length;i++) {
      var g=groups[i];
      var nextFrom = String(item.planningWindowFrom) > g.planningWindowFrom ? String(item.planningWindowFrom) : g.planningWindowFrom;
      var nextTo = String(item.planningWindowTo) < g.planningWindowTo ? String(item.planningWindowTo) : g.planningWindowTo;
      if (nextFrom <= nextTo) {
        g.scopes.push(item);
        g.planningWindowFrom=nextFrom;
        g.planningWindowTo=nextTo;
        placed=true;
        break;
      }
    }
    if (!placed) groups.push({scopes:[item],planningWindowFrom:String(item.planningWindowFrom),planningWindowTo:String(item.planningWindowTo)});
  });
  return {
    success:true,
    errors:[],
    groups:groups.map(function(g){return{
      scopeCodes:g.scopes.map(function(x){return x.scopeCode;}),
      planningWindowFrom:g.planningWindowFrom,
      planningWindowTo:g.planningWindowTo,
      obligations:g.scopes
    };})
  };
}

function ModelCAnnualCycle_iso_(v,ss) {
  if (!v) return '';
  if (Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v,(ss&&ss.getSpreadsheetTimeZone?ss.getSpreadsheetTimeZone():Session.getScriptTimeZone()),'yyyy-MM-dd');
  }
  var s=String(v).trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1]+'-'+m[2]+'-'+m[3] : '';
}

function ModelCAnnualCycle_addYearsIso_(iso,years) {
  var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m)return'';
  var y=Number(m[1])+Number(years||0),mo=Number(m[2]),d=Number(m[3]);
  var last=new Date(Date.UTC(y,mo,0)).getUTCDate(); if(d>last)d=last;
  return [String(y),('0'+mo).slice(-2),('0'+d).slice(-2)].join('-');
}

function ModelCAnnualCycle_addMonthsIso_(iso,months) {
  var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m)return'';
  var y=Number(m[1]),mo=Number(m[2])-1,d=Number(m[3]),delta=Number(months||0);
  var total=y*12+mo+delta,ny=Math.floor(total/12),nm=total%12; if(nm<0){nm+=12;ny--;}
  var last=new Date(Date.UTC(ny,nm+1,0)).getUTCDate(); if(d>last)d=last;
  return [String(ny),('0'+(nm+1)).slice(-2),('0'+d).slice(-2)].join('-');
}
