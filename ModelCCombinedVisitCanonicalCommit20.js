/*
 * AMS 2.0 / issue #45 — DEV-only canonical combined Visit commit boundary.
 * Model C membership and projection staging belong here; actual PLAN and
 * Availability commitment belong to PlanningCanonicalCommitService_commit.
 * Never invoke from PROD until full acceptance. No generic client-owned writes.
 */
var MODEL_C_COMBINED_CANONICAL_COMMIT20_BUILD='2026-10-22_ISSUE45_R1';
function MCC20_clean_(v){return String(v==null?'':v).trim();}
function MCC20_norm_(v){return MCC20_clean_(v).toUpperCase().replace(/[\s-]+/g,'_');}
function MCC20_col_(headers,names){for(var i=0;i<names.length;i++){var n=headers.indexOf(names[i]);if(n>=0)return n;}throw Error('COMBINED_CANONICAL_COLUMN_MISSING_'+names[0]);}
function MCC20_table_(ss,name){var sh=ss.getSheetByName(name);if(!sh)throw Error('COMBINED_CANONICAL_SHEET_MISSING_'+name);var data=sh.getDataRange().getValues();return{sheet:sh,headers:data[0]||[],rows:data.slice(1)};}
function MCC20_restore_(journal){
 var ok=true;
 for(var i=journal.length-1;i>=0;i--){var j=journal[i];
  try{
   if(j.created){var last=j.sheet.getLastRow();if(last!==j.row)throw Error('COMBINED_ROLLBACK_APPEND_ORDER_CHANGED');j.sheet.deleteRow(j.row);}
   else j.sheet.getRange(j.row,1,1,j.before.length).setValues([j.before]);
  }catch(e){ok=false;}
 }
 return ok;
}
function MCC20_stageRow_(journal,sheet,row,after){
 var before=sheet.getRange(row,1,1,after.length).getValues()[0];
 journal.push({sheet:sheet,row:row,before:before});
 sheet.getRange(row,1,1,after.length).setValues([after]);
}
function MCC20_append_(journal,sheet,after){
 var before=sheet.getLastRow();sheet.appendRow(after);var row=sheet.getLastRow();
 if(row!==before+1)throw Error('COMBINED_APPEND_RACE_REPAIR_REQUIRED');
 journal.push({sheet:sheet,row:row,created:true});
}
function ModelCCombinedVisitCanonicalCommit20_execute(input){
 input=input||{};
 if(MCC20_clean_(input.runtimeEnv)!=='DEV')throw Error('COMBINED_CANONICAL_DEV_ONLY');
 if(MCC20_norm_(input.actorRole)!=='MANAGER'||!MCC20_clean_(input.actorEmail))throw Error('COMBINED_CANONICAL_MANAGER_REQUIRED');
 if(!Array.isArray(input.blocks)||!input.blocks.length||!MCC20_clean_(input.auditorEmail))throw Error('COMBINED_CANONICAL_PLANNING_REQUIRED');
 if(typeof ModelCCombinedVisitPlanner20_plan!=='function'||typeof PlanningCanonicalCommitService_commit!=='function'||typeof PlanningRevisionTokenService_getMany!=='function')throw Error('COMBINED_CANONICAL_OWNER_UNAVAILABLE');
 var members=[MCC20_clean_(input.targetAuditId)].concat(Array.isArray(input.sourceAuditIds)?input.sourceAuditIds.map(MCC20_clean_):[]).filter(Boolean);
 if(new Set(members).size!==members.length||members.length<2||members.length>20)throw Error('COMBINED_CANONICAL_MEMBERS_INVALID');
 var expected=input.expectedRevisionsByAudit||{};
 members.forEach(function(id){if(!/^PRT1-[0-9a-f]{40}$/i.test(MCC20_clean_(expected[id])))throw Error('COMBINED_CANONICAL_REVISION_REQUIRED_'+id);});
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('COMBINED_CANONICAL_LOCK_BUSY');
 var journal=[],planned=false;
 var previousMarker=(typeof AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_!=='undefined'&&AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_===true);
 try{
  AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_=true;
  var ss=SpreadsheetApp.getActiveSpreadsheet(),ap=MCC20_table_(ss,'Audit planning'),ob=MCC20_table_(ss,'Audit_Obligations'),lk=MCC20_table_(ss,'Audit_Visit_Obligations'),cfg=MCC20_table_(ss,'Config_Scopes'),cr=MCC20_table_(ss,'Concept Reservations');
  var apId=MCC20_col_(ap.headers,['Audit ID']),apStatus=MCC20_col_(ap.headers,['Status']),apCompany=MCC20_col_(ap.headers,['Company_UID','Company UID']);
  var lkAudit=MCC20_col_(lk.headers,['Audit_ID']),lkOb=MCC20_col_(lk.headers,['Obligation_ID']),lkState=MCC20_col_(lk.headers,['Link_State']),lkEnd=MCC20_col_(lk.headers,['Unlinked_At']),lkStart=MCC20_col_(lk.headers,['Linked_At']);
  var obId=MCC20_col_(ob.headers,['Obligation_ID']),obState=MCC20_col_(ob.headers,['Obligation_State']),obCompany=MCC20_col_(ob.headers,['Company_UID']),obScope=MCC20_col_(ob.headers,['ScopeCode']),obHours=MCC20_col_(ob.headers,['Formal_Hours']);
  var auditById={},memberAudits=[];
  for(var ai=0;ai<ap.rows.length;ai++){var id=MCC20_clean_(ap.rows[ai][apId]);if(id&&members.indexOf(id)>=0){if(auditById[id])throw Error('COMBINED_CANONICAL_DUPLICATE_AUDIT');auditById[id]={row:ai+2,values:ap.rows[ai].slice()};}}
  members.forEach(function(id){var x=auditById[id];if(!x)throw Error('COMBINED_CANONICAL_AUDIT_NOT_FOUND');memberAudits.push({auditId:id,status:x.values[apStatus],companyUid:x.values[apCompany]});});
  var fresh=PlanningRevisionTokenService_getMany({auditIds:members}),tokens=fresh&&fresh.byAuditId||{};
  members.forEach(function(id){if(MCC20_clean_(tokens[id])!==MCC20_clean_(expected[id]))throw Error('COMBINED_CANONICAL_REVISION_CONFLICT_'+id);});
  var obligations=ob.rows.map(function(r){return{obligationId:r[obId],obligationState:r[obState],companyUid:r[obCompany],scopeCode:r[obScope]};});
  var links=lk.rows.map(function(r){return{auditId:r[lkAudit],obligationId:r[lkOb],linkState:r[lkState]};});
  var composition=ModelCCombinedVisitPlanner20_plan({targetAuditId:input.targetAuditId,memberAuditIds:input.sourceAuditIds,audits:memberAudits,obligations:obligations,links:links});
  var required=0,formalByOb={};for(var oi=0;oi<ob.rows.length;oi++)formalByOb[MCC20_clean_(ob.rows[oi][obId])]=Number(String(ob.rows[oi][obHours]||0).replace(',','.'))||0;
  composition.obligationIds.forEach(function(id){required+=formalByOb[id]||0;});
  if(required<=0)throw Error('COMBINED_CANONICAL_FORMAL_HOURS_INVALID');
  var target=auditById[MCC20_clean_(input.targetAuditId)],targetNext=target.values.slice();
  var hoursCol=MCC20_col_(ap.headers,['Total audit time in hours','Total time in hours','Required hours','Total hours']);targetNext[hoursCol]=Math.round(required*100)/100;
  var configH=cfg.headers,cfgCode=configH.indexOf('ScopeCode'),cfgDisplay=configH.indexOf('DisplayName');
  if(cfgCode<0)throw Error('COMBINED_CANONICAL_SCOPE_CATALOG_INVALID');
  var selected={};composition.scopeCodes.forEach(function(x){selected[x]=true;});
  cfg.rows.forEach(function(row){var code=MCC20_clean_(row[cfgCode]),name=cfgDisplay>=0?MCC20_clean_(row[cfgDisplay]):'';
   if(!code)return;[code,name].forEach(function(n){var idx=ap.headers.indexOf(n);if(idx>=0)targetNext[idx]=selected[code]?'X':'';});
  });
  // Stage all membership/projection changes BEFORE the canonical Plan writer.
  // Every changed row is retained in a reverse-order restoration journal.
  MCC20_stageRow_(journal,ap.sheet,target.row,targetNext);
  composition.sourceAuditIds.forEach(function(id){var src=auditById[id];MCC20_stageRow_(journal,ap.sheet,src.row,new Array(ap.headers.length).fill(''));});
  // Release source members' provisional reservations under the same journal.
  // The canonical Plan finalizer is responsible for the target reservation.
  var crAudit=MCC20_col_(cr.headers,['Audit ID']),crState=MCC20_col_(cr.headers,['State']);
  var crBy=cr.headers.indexOf('Released By'),crAt=cr.headers.indexOf('Released At'),crReason=cr.headers.indexOf('Release Reason'),crUpdated=cr.headers.indexOf('Updated At');
  for(var ci=0;ci<cr.rows.length;ci++){
    var crRow=cr.rows[ci],crId=MCC20_clean_(crRow[crAudit]);
    if(composition.sourceAuditIds.indexOf(crId)<0||MCC20_norm_(crRow[crState])!=='ACTIVE')continue;
    var changed=crRow.slice();changed[crState]='RELEASED';
    if(crBy>=0)changed[crBy]=MCC20_clean_(input.actorEmail);
    if(crAt>=0)changed[crAt]=new Date().toISOString();
    if(crUpdated>=0)changed[crUpdated]=new Date().toISOString();
    if(crReason>=0)changed[crReason]='CANONICAL_COMBINED_VISIT_COMMIT';
    MCC20_stageRow_(journal,cr.sheet,ci+2,changed);
  }
  var now=new Date().toISOString(),linkRows={};
  for(var li=0;li<lk.rows.length;li++){var lr=lk.rows[li],key=MCC20_clean_(lr[lkAudit])+'|'+MCC20_clean_(lr[lkOb]);if(MCC20_norm_(lr[lkState])==='ACTIVE')linkRows[key]={row:li+2,values:lr.slice()};}
  composition.closeLinks.forEach(function(ch){var link=linkRows[ch.auditId+'|'+ch.obligationId];if(!link)throw Error('COMBINED_CANONICAL_LINK_CHANGED');
   var next=link.values.slice();next[lkState]='INACTIVE';next[lkEnd]=now;MCC20_stageRow_(journal,lk.sheet,link.row,next);
  });
  composition.newLinks.forEach(function(ch){var nr=new Array(lk.headers.length).fill('');nr[lkAudit]=ch.auditId;nr[lkOb]=ch.obligationId;nr[lkState]='ACTIVE';nr[lkStart]=now;MCC20_append_(journal,lk.sheet,nr);});
  var result=PlanningCanonicalCommitService_commit({
   auditId:composition.targetAuditId,expectedRevision:expected[composition.targetAuditId],
   actorRole:'MANAGER',actorEmail:MCC20_clean_(input.actorEmail),
   auditorEmail:MCC20_clean_(input.auditorEmail),auditorName:MCC20_clean_(input.auditorName),blocks:input.blocks,
   waiverAccepted:input.waiverAccepted===true,allowWeekendOverride:input.allowWeekendOverride!==false,
   combinedVisitComposition:{sourceAuditIds:composition.sourceAuditIds,obligationIds:composition.obligationIds,scopeCodes:composition.scopeCodes,formalHours:Math.round(required*100)/100}
  });
  if(!result||result.committed!==true){
   var restored=MCC20_restore_(journal);journal=[];
   return{success:false,committed:false,error:MCC20_clean_(result&&result.reason)||'COMBINED_CANONICAL_PLAN_FAILED',
    repairRequired:!restored||!!(result&&result.meta&&result.meta.availabilityRepairRequired),rolledBack:restored,canonicalPlanResult:result||null};
  }
  planned=true;journal=[];
  try{if(typeof __mp_invalidateAuditPlanningPack_==='function')__mp_invalidateAuditPlanningPack_();}catch(ignore){}
  return{success:true,committed:true,combinedVisit:true,auditId:composition.targetAuditId,sourceAuditIds:composition.sourceAuditIds,
   obligationIds:composition.obligationIds,scopeCodes:composition.scopeCodes,formalHours:Math.round(required*100)/100,
   canonicalPlanResult:result,postCommitRepairRequired:!!(result.meta&&result.meta.postCommitRepairRequired),
   sourceAuditTrailRepairRequired:true,build:MODEL_C_COMBINED_CANONICAL_COMMIT20_BUILD};
 }catch(e){
  var restoredOnException=MCC20_restore_(journal);
  return{success:false,committed:planned,error:MCC20_clean_(e&&e.message||e),rolledBack:restoredOnException,
   repairRequired:!restoredOnException||planned,build:MODEL_C_COMBINED_CANONICAL_COMMIT20_BUILD};
 }finally{
  AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_=previousMarker;
  lock.releaseLock();
 }
}
