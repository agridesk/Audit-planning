/**
 * AMS-01.6 Model C compatibility projection repair.
 * Repairs legacy Audit planning aggregate date fields from canonical Model C obligations.
 * Lifecycle eligibility is owned exclusively by Config_Scopes.Recurring.
 */
var MODEL_C_COMPATIBILITY_REPAIR_BUILD='2026-09-20_AMS_01_6_MODEL_C_COMPATIBILITY_REPAIR_R2_RECURRING_CONFIG';

function RUN_MODEL_C_COMPATIBILITY_PROJECTION_REPAIR(){
  var ss=SpreadsheetApp.getActive();
  var ap=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!ap)throw new Error('Missing Audit planning');
  var values=ap.getDataRange().getValues(),headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{},obRows=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],linkRows=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var obById={},activeByAudit={};
  obRows.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  linkRows.forEach(function(link){
    if(String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(link.Obligation_ID||'')];
    if(!ob)return;
    var auditId=String(link.Audit_ID||'');
    if(!activeByAudit[auditId])activeByAudit[auditId]=[];
    activeByAudit[auditId].push(ob);
  });

  var cols={
    birthday:map[ModelCFoundation_normHeader_('Birthdate certificate')],
    expiry:map[ModelCFoundation_normHeader_('Date - Will Expire')],
    effective:map[ModelCFoundation_normHeader_('Extended Expiration Date')],
    extension:map[ModelCFoundation_normHeader_('Extension applied')],
    from:map[ModelCFoundation_normHeader_('Planning window from')],
    to:map[ModelCFoundation_normHeader_('Planning window to')]
  };
  Object.keys(cols).forEach(function(k){if(cols[k]===undefined)throw new Error('Missing compatibility header: '+k);});

  var writes=0,auditsRepaired=0;
  for(var r=1;r<values.length;r++){
    var row=values[r],auditId=ModelCFoundation_valueByHeader_(row,map,['Audit ID']);
    if(!auditId)continue;
    var recurring=(activeByAudit[auditId]||[]).filter(function(x){
      return ModelCRecurringConfig_isRecurring_(ss,String(x.ScopeCode||''));
    });
    var earliest='',effectiveEarliest='',from='',to='',extension='';
    recurring.forEach(function(x){
      var e=ModelCExtension_dateInTz_(x.Base_Expiry_Date,tz),z=ModelCExtension_dateInTz_(x.Effective_Expiry_Date,tz),f=ModelCExtension_dateInTz_(x.Planning_Window_From,tz),t=ModelCExtension_dateInTz_(x.Planning_Window_To,tz);
      if(e&&(!earliest||e<earliest))earliest=e;
      if(z&&(!effectiveEarliest||z<effectiveEarliest))effectiveEarliest=z;
      if(f&&(!from||f>from))from=f;
      if(t&&(!to||t<to))to=t;
      if(String(x.Extension_Applied||'').trim())extension='Yes';
    });
    var expected=['',earliest,effectiveEarliest||earliest,extension,from,to],idx=[cols.birthday,cols.expiry,cols.effective,cols.extension,cols.from,cols.to],changed=false;
    if(recurring.length){
      expected[0]=ModelCFoundation_clean_(row[cols.birthday]);
    }
    for(var i=0;i<idx.length;i++){
      var actual=ModelCFoundation_clean_(row[idx[i]]);
      if(actual!==expected[i]){row[idx[i]]=expected[i];changed=true;writes++;}
    }
    if(changed)auditsRepaired++;
  }

  if(auditsRepaired){
    [cols.birthday,cols.expiry,cols.effective,cols.from,cols.to].forEach(function(c){if(values.length>1)ap.getRange(2,c+1,values.length-1,1).setNumberFormat('@');});
    ap.getRange(2,1,values.length-1,headers.length).setValues(values.slice(1));
    SpreadsheetApp.flush();
    try{if(typeof ModelCAnnualCycle_invalidateAuditPlanningCaches_==='function')ModelCAnnualCycle_invalidateAuditPlanningCaches_();}catch(ignore){}
  }

  var out={success:true,build:MODEL_C_COMPATIBILITY_REPAIR_BUILD,writesPerformed:auditsRepaired>0,auditsRepaired:auditsRepaired,cellsRepaired:writes,owner:'Config_Scopes.Recurring'};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
