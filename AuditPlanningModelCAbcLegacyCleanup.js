/**
 * AMS-01.6 Model C: remove obsolete legacy compatibility dates from ABC-only audits.
 * Canonical rule: MPS-ABC has no certificate expiry/birthday lifecycle.
 */
var MODEL_C_ABC_LEGACY_CLEANUP_BUILD='2026-09-20_AMS_01_6_MODEL_C_ABC_LEGACY_CLEANUP_R1';

function RUN_MODEL_C_ABC_LEGACY_CLEANUP(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!sh)throw new Error('Missing Audit planning');
  var values=sh.getDataRange().getValues();
  var headers=values[0]||[];
  var map=ModelCFoundation_headerMap_(headers);
  var source=ModelCMigration_readSource_(ss);
  if(!source||source.success!==true)throw new Error('Unable to read Model C migration source');
  var target=ModelCRecon_readTargets_(ss);
  if(!target||target.success!==true)throw new Error('Unable to read Model C targets');

  var obRows=(target.rows&&target.rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS])||[];
  var lkRows=(target.rows&&target.rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS])||[];
  var obById={},activeByAudit={};
  obRows.forEach(function(ob){obById[String(ob.Obligation_ID||'')]=ob;});
  lkRows.forEach(function(link){
    if(String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(link.Obligation_ID||'')];
    if(!ob)return;
    var auditId=String(link.Audit_ID||'');
    if(!activeByAudit[auditId])activeByAudit[auditId]=[];
    activeByAudit[auditId].push(ob);
  });

  var auditCol=map[ModelCFoundation_normHeader_('Audit ID')];
  var clearHeaders=['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'];
  var clearCols=clearHeaders.map(function(h){return map[ModelCFoundation_normHeader_(h)];});
  var rowsChanged=0,cellsCleared=0,auditIds=[];

  for(var r=1;r<values.length;r++){
    var row=values[r];
    var auditId=auditCol!==undefined?String(row[auditCol]||'').trim():'';
    if(!auditId)continue;
    var active=activeByAudit[auditId]||[];
    if(!active.length)continue;
    var abcOnly=active.every(function(ob){return ModelCFoundation_isAbc_(ob.ScopeCode,ob.ScopeCode);});
    if(!abcOnly)continue;
    var changed=false;
    clearCols.forEach(function(col){
      if(col===undefined)return;
      if(row[col]!==''&&row[col]!==null&&row[col]!==undefined){row[col]='';cellsCleared++;changed=true;}
    });
    if(changed){rowsChanged++;auditIds.push(auditId);}
  }

  if(rowsChanged){
    clearCols.forEach(function(col){if(col!==undefined)sh.getRange(2,col+1,Math.max(0,values.length-1),1).setNumberFormat('@');});
    sh.getRange(2,1,values.length-1,headers.length).setValues(values.slice(1));
    SpreadsheetApp.flush();
  }
  try{if(typeof ModelCAnnualCycle_invalidateAuditPlanningCaches_==='function')ModelCAnnualCycle_invalidateAuditPlanningCaches_();}catch(ignore){}

  var source2=ModelCMigration_readSource_(ss);
  var target2=ModelCRecon_readTargets_(ss);
  var recon=(source2&&source2.success&&target2&&target2.success)?ModelCPhase2BRecon_compare_(ss,source2,target2):{success:false,errors:['Unable to reconcile after ABC cleanup']};
  var out={
    success:recon.success===true&&Number(recon.warningCount||0)===0,
    build:MODEL_C_ABC_LEGACY_CLEANUP_BUILD,
    writesPerformed:rowsChanged>0,
    abcRowsCleaned:rowsChanged,
    cellsCleared:cellsCleared,
    auditIds:auditIds,
    reconciliation:(typeof ModelCPhase2BRecon_compact_==='function'?ModelCPhase2BRecon_compact_(recon):recon)
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ABC legacy cleanup failed');
  return out;
}
