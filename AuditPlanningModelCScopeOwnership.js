/** Model C Phase 2B: scope-ownership transition contract. Read-only until routed. */
var MODEL_C_SCOPE_OWNER_BUILD = '2026-09-21_AMS_01_6_MODEL_C_PHASE_2B_SCOPE_OWNER_R6_SAFE_SNAPSHOT';

function RUN_MODEL_C_PHASE2B_SCOPE_OWNER_PREFLIGHT() {
  var ss = SpreadsheetApp.getActive();
  var target = ModelCRecon_readTargets_(ss);
  var cs = (target.rows && target.rows[MODEL_C_SHEETS.COMPANY_SCOPES]) || [];
  var ob = (target.rows && target.rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]) || [];
  var lk = (target.rows && target.rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]) || [];
  var errors = (target.errors || []).slice(), csById = {}, obById = {}, activeLinks = 0;
  cs.forEach(function(x) { var id=String(x.Company_Scope_ID); if(!id||csById[id])errors.push('Duplicate Company Scope ID: '+id); csById[id]=x; });
  ob.forEach(function(x) { var id=String(x.Obligation_ID); if(!id||obById[id])errors.push('Duplicate Obligation ID: '+id); obById[id]=x; if(!csById[String(x.Company_Scope_ID)])errors.push('Orphan obligation: '+id); });
  lk.forEach(function(x) { if(String(x.Link_State).toUpperCase()!=='ACTIVE')return; activeLinks++; if(!obById[String(x.Obligation_ID)])errors.push('Orphan active link: '+x.Obligation_ID); });
  var out={success:errors.length===0,readyForScopeOwnerRouting:errors.length===0,build:MODEL_C_SCOPE_OWNER_BUILD,readOnly:true,writesPerformed:false,counts:{companyScopes:cs.length,obligations:ob.length,activeLinks:activeLinks},policy:{deselect:'DEACTIVATE_CANCEL_UNLINK',historyDeleted:false,abcExpiry:false,gapGraspSharedExpiry:true,currentAuditObligationRouting:true,legacyDateProjectionAsText:true,uiHoursReadFromModelC:true,safeSnapshotIntegrated:true},errors:errors.slice(0,25)};
  Logger.log(JSON.stringify(out,null,2)); return out;
}

function ModelCScopeOwner_indexCurrentObligations_(companyUid,auditId,obligations,links) {
  companyUid=String(companyUid||''); auditId=String(auditId||'');
  var obById={},byCs={},errors=[];
  (obligations||[]).forEach(function(x){var id=String(x.Obligation_ID||'');if(id)obById[id]=x;});
  (links||[]).forEach(function(link){
    if(String(link.Audit_ID)!==auditId||String(link.Link_State).toUpperCase()!=='ACTIVE')return;
    var obligation=obById[String(link.Obligation_ID||'')];
    if(!obligation)return;
    if(String(obligation.Company_UID)!==companyUid)return;
    if(['COMPLETED','CANCELLED','REJECTED'].indexOf(String(obligation.Obligation_State).toUpperCase())>=0)return;
    var csId=String(obligation.Company_Scope_ID||'');
    if(byCs[csId]&&String(byCs[csId].Obligation_ID)!==String(obligation.Obligation_ID))errors.push('Multiple active obligations for audit/company scope: '+auditId+'|'+csId);
    byCs[csId]=obligation;
  });
  (obligations||[]).forEach(function(obligation){
    if(String(obligation.Company_UID)!==companyUid||String(obligation.Source_Audit_ID)!==auditId)return;
    if(['COMPLETED','CANCELLED','REJECTED'].indexOf(String(obligation.Obligation_State).toUpperCase())>=0)return;
    var csId=String(obligation.Company_Scope_ID||'');
    if(!byCs[csId])byCs[csId]=obligation;
    else if(String(byCs[csId].Obligation_ID)!==String(obligation.Obligation_ID)&&String(obligation.Source_Audit_ID)===auditId)errors.push('Multiple current obligations for audit/company scope: '+auditId+'|'+csId);
  });
  return{success:errors.length===0,byCompanyScope:byCs,errors:errors};
}

function ModelCScopeOwner_planTransition_(command, companyScopes, obligations, links) {
  command=command||{}; var companyUid=String(command.companyUid||''), auditId=String(command.auditId||''), selected=ModelCScopeOwner_normalizeSelected_(command.selectedScopes||[]), errors=[];
  if(!companyUid)errors.push('Missing companyUid'); if(!auditId)errors.push('Missing auditId');
  var csByCode={}, activeLinkByOb={};
  (companyScopes||[]).forEach(function(x){if(String(x.Company_UID)===companyUid)csByCode[String(x.ScopeCode)]=x;});
  var current=ModelCScopeOwner_indexCurrentObligations_(companyUid,auditId,obligations,links),obByCs=current.byCompanyScope||{};
  if(!current.success)errors=errors.concat(current.errors||[]);
  (links||[]).forEach(function(x){if(String(x.Audit_ID)===auditId&&String(x.Link_State).toUpperCase()==='ACTIVE')activeLinkByOb[String(x.Obligation_ID)]=x;});
  var retain=[],create=[],deactivate=[];
  Object.keys(selected).forEach(function(code){var item=selected[code],existing=csByCode[code]; if(existing){retain.push({scopeCode:code,companyScopeId:existing.Company_Scope_ID,obligation:obByCs[String(existing.Company_Scope_ID)]||null,formalHours:item.formalHours,baseExpiry:item.baseExpiry});}else create.push(item);});
  Object.keys(csByCode).forEach(function(code){var scope=csByCode[code]; if(String(scope.Active).toUpperCase()==='YES'&&!selected[code]){var obligation=obByCs[String(scope.Company_Scope_ID)]||null;deactivate.push({scopeCode:code,companyScopeId:scope.Company_Scope_ID,obligationId:obligation?obligation.Obligation_ID:'',activeLink:obligation?(activeLinkByOb[String(obligation.Obligation_ID)]||null):null});}});
  return{success:errors.length===0,errors:errors,retain:retain,create:create,deactivate:deactivate,counts:{retain:retain.length,create:create.length,deactivate:deactivate.length},policy:{deactivateCompanyScope:true,cancelOpenObligation:true,unlinkActiveVisit:true,deleteHistory:false,currentAuditObligationRouting:true}};
}

function ModelCScopeOwner_normalizeSelected_(items) {
  var out={};
  (items||[]).forEach(function(raw){
    raw=raw||{}; if(!(raw.enabled===true||String(raw.enabled).toLowerCase()==='true'))return;
    var code=String(raw.scopeCode||raw.scope||'').trim(); if(!code)return;
    var abc=ModelCFoundation_isAbc_(code,code);
    out[code]={scopeCode:code,formalHours:raw.formalHours===undefined?raw.customHours:raw.formalHours,baseExpiry:abc?'':String(raw.baseExpiry||raw.dateWillExpire||'').trim(),certificateBirthday:abc?'':String(raw.certificateBirthday||raw.birthdate||'').trim(),lifecycleType:abc?'EXTERNAL_ANNUAL':'CERTIFICATE_RECURRING'};
  });
  if(out.GRASP&&out['MPS-GAP']){out.GRASP.baseExpiry=out['MPS-GAP'].baseExpiry;out.GRASP.certificateBirthday=out['MPS-GAP'].certificateBirthday;}
  return out;
}

function ModelCScopeOwner_enrichUiScopes_(ss, companyUid, auditId, scopes) {
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{},cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[],ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var linked={},csById={},obByCs={};
  lk.forEach(function(x){if(String(x.Audit_ID)===String(auditId)&&String(x.Link_State).toUpperCase()==='ACTIVE')linked[String(x.Obligation_ID)]=true;});
  cs.forEach(function(x){if(String(x.Company_UID)===String(companyUid))csById[String(x.Company_Scope_ID)]=x;});
  ob.forEach(function(x){if(linked[String(x.Obligation_ID)]&&csById[String(x.Company_Scope_ID)])obByCs[String(x.Company_Scope_ID)]=x;});
  return (scopes||[]).map(function(row){
    var match=null; Object.keys(csById).some(function(id){if(String(csById[id].ScopeCode)===String(row.scope)){match={cs:csById[id],ob:obByCs[id]||null};return true;}return false;});
    var out={}; Object.keys(row).forEach(function(k){out[k]=row[k];});
    out.certificateBirthday=match?ModelCFoundation_clean_(match.cs.Certificate_Birthday):'';
    out.baseExpiry=match&&match.ob?ModelCExtension_dateInTz_(match.ob.Base_Expiry_Date,ss.getSpreadsheetTimeZone()):'';
    out.lifecycleType=match?String(match.cs.Lifecycle_Type||''):(ModelCFoundation_isAbc_(row.scope,row.scope)?'EXTERNAL_ANNUAL':'');
    if(match&&match.ob){
      var modelHours=ModelCScopeOwner_hours_(match.ob.Formal_Hours);
      out.customHours=modelHours;
      out.usedHours=modelHours;
    }
    return out;
  });
}

function ModelCScopeOwner_commit(command) {
  command=command||{}; var ss=SpreadsheetApp.getActive(),lock=LockService.getScriptLock(); lock.waitLock(15000);
  var snapshots=[];
  try {
    var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS),apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
    if(!csSheet||!obSheet||!lkSheet||!apSheet)throw new Error('Model C scope-owner sheets missing');
    var csValues=csSheet.getDataRange().getValues(),obValues=obSheet.getDataRange().getValues(),lkValues=lkSheet.getDataRange().getValues();
    var cs=ModelCMigration_rowsToObjects_(csValues),ob=ModelCMigration_rowsToObjects_(obValues),lk=ModelCMigration_rowsToObjects_(lkValues);
    var selected=ModelCScopeOwner_normalizeSelected_(command.selectedScopes||[]),codes=Object.keys(selected);
    if(!String(command.companyUid||'').trim())throw new Error('Missing companyUid');
    if(!String(command.auditId||'').trim())throw new Error('Missing auditId');
    if(!codes.length)throw new Error('At least one scope is required');
    ModelCScopeOwner_validateSelection_(selected);
    snapshots=[ModelCScopeOwner_snapshotSheet_(csSheet),ModelCScopeOwner_snapshotSheet_(obSheet),ModelCScopeOwner_snapshotSheet_(lkSheet),ModelCExtension_snapshotLegacy_(apSheet,command.auditId)];
    var stamp=new Date().toISOString(),csByCode={},activeLinkByOb={},activeAuditByOb={};
    cs.forEach(function(x){if(String(x.Company_UID)===String(command.companyUid))csByCode[String(x.ScopeCode)]=x;});
    var current=ModelCScopeOwner_indexCurrentObligations_(command.companyUid,command.auditId,ob,lk);if(!current.success)throw new Error((current.errors||[]).join('; '));var obByCs=current.byCompanyScope||{};
    lk.forEach(function(x){if(String(x.Link_State).toUpperCase()!=='ACTIVE')return;activeAuditByOb[String(x.Obligation_ID)]=String(x.Audit_ID);if(String(x.Audit_ID)===String(command.auditId))activeLinkByOb[String(x.Obligation_ID)]=x;});
    codes.forEach(function(code){
      var item=selected[code],scope=csByCode[code];
      if(!scope){if(ModelCFoundation_isAbc_(code,code))throw new Error('MPS-ABC must be created by the ECAS import');scope=ModelCScopeOwner_newCompanyScope_(command,item,stamp);cs.push(scope);csByCode[code]=scope;}
      scope.Active='YES'; scope.Lifecycle_Type=item.lifecycleType; scope.Certificate_Birthday=item.certificateBirthday; scope.Company_Formal_Hours_Override=ModelCScopeOwner_hours_(item.formalHours); scope.Updated_At=stamp;
      var obligation=obByCs[String(scope.Company_Scope_ID)];
      if(!obligation){if(ModelCFoundation_isAbc_(code,code))throw new Error('MPS-ABC obligation must be created by the ECAS import');obligation=ModelCScopeOwner_newObligation_(command,scope,item,stamp,ss);ob.push(obligation);obByCs[String(scope.Company_Scope_ID)]=obligation;}
      if(activeAuditByOb[String(obligation.Obligation_ID)]&&activeAuditByOb[String(obligation.Obligation_ID)]!==String(command.auditId))throw new Error('Scope is linked to another active audit: '+code);
      ModelCScopeOwner_updateObligation_(obligation,command,item,stamp,ss);
      var link=activeLinkByOb[String(obligation.Obligation_ID)];
      if(!link){link={Audit_ID:String(command.auditId),Obligation_ID:String(obligation.Obligation_ID),Link_State:'ACTIVE',Migration_Batch_ID:'',Linked_At:stamp,Unlinked_At:''};lk.push(link);activeLinkByOb[String(obligation.Obligation_ID)]=link;}
    });
    Object.keys(csByCode).forEach(function(code){
      if(selected[code]||String(csByCode[code].Active).toUpperCase()!=='YES')return;
      var scope=csByCode[code],obligation=obByCs[String(scope.Company_Scope_ID)]; scope.Active='NO';scope.Updated_At=stamp;
      if(obligation){obligation.Obligation_State='CANCELLED';obligation.Closed_At=stamp;obligation.Updated_At=stamp;var link=activeLinkByOb[String(obligation.Obligation_ID)];if(link){link.Link_State='INACTIVE';link.Unlinked_At=stamp;}}
    });
    ModelCScopeOwner_writeObjects_(csSheet,MODEL_C_SCHEMA.Company_Scopes,cs,['Certificate_Birthday']);
    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,ob,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    ModelCScopeOwner_writeObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,lk);
    var projection=ModelCScopeOwner_projectLegacy_(apSheet,command,selected,ob,lk,ss);
    SpreadsheetApp.flush();
    return{success:true,build:MODEL_C_SCOPE_OWNER_BUILD,owner:'Company_Scopes/Audit_Obligations',writesPerformed:true,auditId:String(command.auditId),counts:{selected:codes.length,companyScopes:cs.length,obligations:ob.length,links:lk.length},projection:projection};
  } catch(e) {
    for(var i=snapshots.length-1;i>=0;i--)try{ModelCScopeOwner_restoreSnapshot_(snapshots[i]);}catch(ignore){}
    return{success:false,build:MODEL_C_SCOPE_OWNER_BUILD,writesPerformed:snapshots.length>0,rolledBack:snapshots.length>0,error:String(e&&e.message?e.message:e)};
  } finally {try{lock.releaseLock();}catch(ignoreLock){}}
}

function ModelCScopeOwner_validateSelection_(selected){
  if(selected.GRASP&&!selected['MPS-GAP'])throw new Error('GRASP requires MPS-GAP');
  Object.keys(selected).forEach(function(code){var x=selected[code];if(ModelCFoundation_isAbc_(code,code))return;if(!/^\d{4}-\d{2}-\d{2}$/.test(x.baseExpiry))throw new Error('Expiry date required for '+code);if(x.certificateBirthday&&!/^\d{4}-\d{2}-\d{2}$/.test(x.certificateBirthday))throw new Error('Invalid certificate birthday for '+code);});
}

function ModelCScopeOwner_newCompanyScope_(command,item,stamp){return{Company_Scope_ID:ModelCMigration_newId_('CS_'),Company_UID:String(command.companyUid),ScopeCode:item.scopeCode,Active:'YES',Lifecycle_Type:item.lifecycleType,Certificate_Birthday:item.certificateBirthday,Company_Formal_Hours_Override:ModelCScopeOwner_hours_(item.formalHours),Certificate_Metadata_JSON:'',Migration_Batch_ID:'',Source_Audit_ID:String(command.auditId),Created_At:stamp,Updated_At:stamp};}

function ModelCScopeOwner_newObligation_(command,scope,item,stamp,ss){return{Obligation_ID:ModelCMigration_newId_('OBL_'),Company_Scope_ID:scope.Company_Scope_ID,Company_UID:String(command.companyUid),ScopeCode:item.scopeCode,Cycle_Key:'',Trigger_Source:ModelCFoundation_isAbc_(item.scopeCode,item.scopeCode)?'ECAS':'CERTIFICATE_LIFECYCLE',Obligation_State:'OPEN',Base_Expiry_Date:'',Extension_Applied:'',Extension_Metadata_JSON:'',Effective_Expiry_Date:'',Planning_Window_From:'',Planning_Window_To:'',Formal_Hours:ModelCScopeOwner_hours_(item.formalHours),Preassigned_Auditor_Email:'',Allow_Self_Planning:'',Migration_Batch_ID:'',Source_Audit_ID:String(command.auditId),Created_At:stamp,Updated_At:stamp,Closed_At:''};}

function ModelCScopeOwner_updateObligation_(obligation,command,item,stamp,ss){
  var abc=ModelCFoundation_isAbc_(item.scopeCode,item.scopeCode),tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  obligation.Obligation_State='OPEN'; obligation.Closed_At=''; obligation.Formal_Hours=ModelCScopeOwner_hours_(item.formalHours); obligation.Preassigned_Auditor_Email=String(command.preassignedAuditorEmail||'').toLowerCase(); obligation.Allow_Self_Planning=String(command.allowSelfPlanning||''); obligation.Updated_At=stamp;
  if(abc){obligation.Base_Expiry_Date='';obligation.Effective_Expiry_Date='';obligation.Extension_Applied='';obligation.Extension_Metadata_JSON='';if(!String(obligation.Cycle_Key||''))obligation.Cycle_Key=String(new Date().getFullYear());return;}
  var previousBase=ModelCExtension_dateInTz_(obligation.Base_Expiry_Date,tz),baseChanged=previousBase!==item.baseExpiry;
  obligation.Base_Expiry_Date=item.baseExpiry; obligation.Cycle_Key=item.baseExpiry;
  if(baseChanged||!ModelCExtension_dateInTz_(obligation.Effective_Expiry_Date,tz)){obligation.Effective_Expiry_Date=item.baseExpiry;obligation.Extension_Applied='';obligation.Extension_Metadata_JSON='';var window=ModelCScopeOwner_window_(item.scopeCode,item.baseExpiry,tz);obligation.Planning_Window_From=window.from;obligation.Planning_Window_To=window.to;}
}

function ModelCScopeOwner_window_(scopeCode,expiry,tz){var info=AC_loadConfigScopesInfoMap_()[AC_normKey_(scopeCode)];if(!info)throw new Error('Missing Config_Scopes planning offsets for '+scopeCode);var parts=expiry.split('-'),date=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));var from=Utilities.formatDate(AC_addMonthsPreserveDay_(date,info.fromMonths),tz,'yyyy-MM-dd'),to=Utilities.formatDate(AC_addMonthsPreserveDay_(date,info.toMonths),tz,'yyyy-MM-dd');if(from>to){var swap=from;from=to;to=swap;}return{from:from,to:to};}
function ModelCScopeOwner_hours_(value){var raw=String(value===null||value===undefined?'':value).trim().replace(',','.');var n=Number(raw);if(!isFinite(n)||n<0)throw new Error('Invalid formal hours');return n;}

function ModelCScopeOwner_projectLegacy_(sheet,command,selected,obligations,links,ss){
  var values=sheet.getDataRange().getValues(),headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),rowIndex=ModelCExtension_findRow_(values,map,'Audit ID',command.auditId);if(!rowIndex)throw new Error('Legacy projection row missing');
  var row=values[rowIndex-1].slice(),defs=m5t_scopeSlotDefs_(ss),total=0,linked={},active=[];
  links.forEach(function(x){if(String(x.Audit_ID)===String(command.auditId)&&String(x.Link_State).toUpperCase()==='ACTIVE')linked[String(x.Obligation_ID)]=true;});obligations.forEach(function(x){if(linked[String(x.Obligation_ID)])active.push(x);});
  defs.forEach(function(d){var item=selected[d.scope];if(d.flagCol0!=null)row[d.flagCol0]=item?'x':'';if(d.hourCol0!=null){row[d.hourCol0]=item?ModelCScopeOwner_hours_(item.formalHours):'';if(item)total+=ModelCScopeOwner_hours_(item.formalHours);}});
  ModelCScopeOwner_setLegacy_(row,map,'Total audit time in hours',total); ModelCScopeOwner_setLegacy_(row,map,'Preassigned Auditor',String(command.preassignedAuditorEmail||'').toLowerCase()); ModelCScopeOwner_setLegacy_(row,map,'Allow self planning',String(command.allowSelfPlanning||''));
  var cert=active.filter(function(x){return !ModelCFoundation_isAbc_(x.ScopeCode,x.ScopeCode);}),from='',to='',earliest='',effectiveEarliest='',birthday='',extension='';
  cert.forEach(function(x){var f=ModelCExtension_dateInTz_(x.Planning_Window_From,ss.getSpreadsheetTimeZone()),t=ModelCExtension_dateInTz_(x.Planning_Window_To,ss.getSpreadsheetTimeZone()),e=ModelCExtension_dateInTz_(x.Base_Expiry_Date,ss.getSpreadsheetTimeZone()),z=ModelCExtension_dateInTz_(x.Effective_Expiry_Date,ss.getSpreadsheetTimeZone());if(f&&(!from||f>from))from=f;if(t&&(!to||t<to))to=t;if(e&&(!earliest||e<earliest))earliest=e;if(z&&(!effectiveEarliest||z<effectiveEarliest))effectiveEarliest=z;if(String(x.Extension_Applied||'').trim())extension='Yes';var it=selected[String(x.ScopeCode)];if(it&&it.certificateBirthday&&!birthday)birthday=it.certificateBirthday;});
  if(from&&to&&from>to)throw new Error('Selected scopes have no shared planning window');
  ModelCScopeOwner_setLegacy_(row,map,'Birthdate certificate',birthday);ModelCScopeOwner_setLegacy_(row,map,'Date - Will Expire',earliest);ModelCScopeOwner_setLegacy_(row,map,'Extended Expiration Date',effectiveEarliest||earliest);ModelCScopeOwner_setLegacy_(row,map,'Extension applied',extension);ModelCScopeOwner_setLegacy_(row,map,'Planning window from',from);ModelCScopeOwner_setLegacy_(row,map,'Planning window to',to);ModelCScopeOwner_setLegacy_(row,map,'Scopes_List',Object.keys(selected).join(', '));
  var textHeaders=['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'];
  textHeaders.forEach(function(header){var col=map[ModelCFoundation_normHeader_(header)];if(col!==undefined)sheet.getRange(rowIndex,col+1).setNumberFormat('@');});
  var range=sheet.getRange(rowIndex,1,1,headers.length);range.setValues([row]);return{rowIndex:rowIndex,totalHours:total,planningWindowFrom:from,planningWindowTo:to,compatibilityExpiry:earliest};
}
function ModelCScopeOwner_setLegacy_(row,map,header,value){var col=map[ModelCFoundation_normHeader_(header)];if(col!==undefined)row[col]=value;}

function ModelCScopeOwner_snapshotSheet_(sheet){
  var range=sheet.getDataRange(),values=range.getValues(),numberFormats=range.getNumberFormats(),textDateColumns=[];
  if(String(sheet.getName())===String(MODEL_C_SHEETS.AUDIT_PLANNING)&&values.length){
    var headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),tz=sheet.getParent().getSpreadsheetTimeZone()||Session.getScriptTimeZone();
    ['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'].forEach(function(h){
      var c=map[ModelCFoundation_normHeader_(h)];
      if(c===undefined)return;
      textDateColumns.push(c);
      for(var r=1;r<values.length;r++){
        var v=values[r][c];
        if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))values[r][c]=Utilities.formatDate(v,tz,'yyyy-MM-dd');
        else if(v!==''&&v!==null&&v!==undefined)values[r][c]=ModelCFoundation_clean_(v);
      }
    });
  }
  return{range:range,values:values,numberFormats:numberFormats,sheet:sheet,textDateColumns:textDateColumns};
}
function ModelCScopeOwner_restoreSnapshot_(snap){
  if(!snap||!snap.sheet||!snap.range)return;
  snap.sheet.clearContents();
  if(snap.numberFormats)snap.range.setNumberFormats(snap.numberFormats);
  (snap.textDateColumns||[]).forEach(function(c){if(snap.values.length>1)snap.sheet.getRange(2,c+1,snap.values.length-1,1).setNumberFormat('@');});
  snap.range.setValues(snap.values);
}
function ModelCScopeOwner_writeObjects_(sheet,headers,objects,textHeaders){sheet.clearContents();sheet.getRange(1,1,1,headers.length).setValues([headers]);if(!objects.length)return;var rows=objects.map(function(x){return headers.map(function(h){return x[h]===undefined?'':x[h];});});(textHeaders||[]).forEach(function(h){var c=headers.indexOf(h)+1;if(c>0)sheet.getRange(2,c,rows.length,1).setNumberFormat('@');});sheet.getRange(2,1,rows.length,headers.length).setValues(rows);}