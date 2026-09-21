/**
 * AMS-01.6 Model C compatibility projection repair.
 * Repairs legacy Audit planning aggregate compatibility fields from canonical Model C obligations.
 *
 * HARD RULES:
 * - Config_Scopes.Recurring owns certificate lifecycle semantics.
 * - Planning windows are independent of Recurring and use ALL active linked obligations.
 * - Writes are targeted per cell; never rewrite the full Audit planning data range.
 */
var MODEL_C_COMPATIBILITY_REPAIR_BUILD='2026-09-21_AMS_01_6_MODEL_C_COMPATIBILITY_REPAIR_R3_TARGETED_WINDOWS_ALL_SCOPES';

function RUN_MODEL_C_COMPATIBILITY_PROJECTION_REPAIR(){
  var ss=SpreadsheetApp.getActive();
  var ap=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var linkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!ap||!obSheet||!linkSheet)throw new Error('Missing Model C compatibility repair sheet');

  var values=ap.getDataRange().getValues();
  var headers=values[0]||[];
  var map=ModelCFoundation_headerMap_(headers);
  var tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links=ModelCMigration_rowsToObjects_(linkSheet.getDataRange().getValues());
  var recurringByCode=ModelCRecurringConfig_byCode_(ss);
  var obById={},activeByAudit={};

  obligations.forEach(function(ob){
    var id=String(ob.Obligation_ID||'').trim();
    if(id)obById[id]=ob;
  });
  links.forEach(function(link){
    if(String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(link.Obligation_ID||'').trim()];
    if(!ob)return;
    var state=String(ob.Obligation_State||'').toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED'||state==='COMPLETED')return;
    var auditId=String(link.Audit_ID||'').trim();
    if(!auditId)return;
    (activeByAudit[auditId]=activeByAudit[auditId]||[]).push(ob);
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

  var writes=0,auditsRepaired=0,windowConflicts=0;
  var textCols={};
  [cols.birthday,cols.expiry,cols.effective,cols.from,cols.to].forEach(function(c){textCols[c]=true;});

  for(var r=1;r<values.length;r++){
    var row=values[r]||[];
    var auditId=ModelCFoundation_valueByHeader_(row,map,['Audit ID']);
    if(!auditId)continue;
    var active=activeByAudit[auditId]||[];
    var recurring=[],allWindows=[];

    active.forEach(function(ob){
      var code=String(ob.ScopeCode||'').trim();
      var cfg=recurringByCode[code];
      if(cfg&&cfg.recurring===true)recurring.push(ob);
      var wf=ModelCExtension_dateInTz_(ob.Planning_Window_From,tz);
      var wt=ModelCExtension_dateInTz_(ob.Planning_Window_To,tz);
      if(wf||wt)allWindows.push({from:wf,to:wt});
    });

    var earliest='',effectiveEarliest='',extension='';
    recurring.forEach(function(ob){
      var e=ModelCExtension_dateInTz_(ob.Base_Expiry_Date,tz);
      var z=ModelCExtension_dateInTz_(ob.Effective_Expiry_Date,tz)||e;
      if(e&&(!earliest||e<earliest))earliest=e;
      if(z&&(!effectiveEarliest||z<effectiveEarliest))effectiveEarliest=z;
      if(String(ob.Extension_Applied||'').trim())extension='Yes';
    });

    var from='',to='',unionFrom='',unionTo='';
    allWindows.forEach(function(w){
      if(w.from){
        if(!from||w.from>from)from=w.from;
        if(!unionFrom||w.from<unionFrom)unionFrom=w.from;
      }
      if(w.to){
        if(!to||w.to<to)to=w.to;
        if(!unionTo||w.to>unionTo)unionTo=w.to;
      }
    });
    if(from&&to&&from>to){
      windowConflicts++;
      from=unionFrom;
      to=unionTo;
    }

    var birthday=recurring.length?ModelCFoundation_clean_(row[cols.birthday]):'';
    var expected={};
    expected[cols.birthday]=birthday;
    expected[cols.expiry]=earliest;
    expected[cols.effective]=effectiveEarliest||earliest;
    expected[cols.extension]=extension;
    expected[cols.from]=from;
    expected[cols.to]=to;

    var changed=false;
    Object.keys(expected).forEach(function(colKey){
      var col=Number(colKey),next=String(expected[colKey]||''),actual=ModelCFoundation_clean_(row[col]);
      if(actual===next)return;
      var cell=ap.getRange(r+1,col+1);
      if(textCols[col])cell.setNumberFormat('@');
      cell.setValue(next);
      row[col]=next;
      writes++;
      changed=true;
    });
    if(changed)auditsRepaired++;
  }

  if(writes){
    SpreadsheetApp.flush();
    try{if(typeof ModelCAnnualCycle_invalidateAuditPlanningCaches_==='function')ModelCAnnualCycle_invalidateAuditPlanningCaches_();}catch(ignore){}
  }

  var verify=ap.getDataRange().getValues(),mismatches=0;
  for(var vr=1;vr<verify.length;vr++){
    var auditId2=ModelCFoundation_valueByHeader_(verify[vr],map,['Audit ID']);
    if(!auditId2)continue;
    var active2=activeByAudit[auditId2]||[],hasRecurring=false;
    active2.forEach(function(ob2){
      var cfg2=recurringByCode[String(ob2.ScopeCode||'').trim()];
      if(cfg2&&cfg2.recurring===true)hasRecurring=true;
    });
    if(!hasRecurring){
      if(ModelCFoundation_clean_(verify[vr][cols.expiry])||ModelCFoundation_clean_(verify[vr][cols.effective])||ModelCFoundation_clean_(verify[vr][cols.birthday]))mismatches++;
    }
  }

  var out={
    success:mismatches===0,
    build:MODEL_C_COMPATIBILITY_REPAIR_BUILD,
    writesPerformed:writes>0,
    auditsRepaired:auditsRepaired,
    cellsRepaired:writes,
    planningWindowConflicts:windowConflicts,
    postVerifyMismatches:mismatches,
    owner:'Config_Scopes.Recurring + all active obligation planning windows',
    targetedWritesOnly:true
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Compatibility projection repair verification failed');
  return out;
}
