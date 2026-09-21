/**
 * AMS-01.6 Model C — ECAS MPS-ABC integrity audit.
 * READ-ONLY. No writes.
 */
var MODEL_C_ECAS_INTEGRITY_AUDIT_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_INTEGRITY_AUDIT_R2_SCOPE_AWARE_COMPLETION';

function RUN_MODEL_C_ECAS_IMPORT_INTEGRITY_AUDIT(){
  var ss=SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ECAS_INTEGRITY_AUDIT_BUILD,readOnly:true,writesPerformed:false,batchYear:'',counts:{},gates:{},sourceMpsNumbers:[],genericOnlyCompletedSuppression:[],duplicateScopeCompanies:[],recoverablePlanningWindows:[],staleCanonical:[],errors:[],warnings:[]};

  var source=ss.getSheetByName('BronBedrijfUrenScopes'),companies=ss.getSheetByName('Companies'),realized=ss.getSheetByName('Log realized audits'),csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS),apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  [source,companies,csSheet,obSheet,lkSheet,apSheet].forEach(function(sh){if(!sh)out.errors.push('Required sheet missing');});
  if(out.errors.length){Logger.log(JSON.stringify(out,null,2));return out;}

  var batchYear=String(source.getRange('G1').getDisplayValue()||'').trim();out.batchYear=batchYear;if(!/^20\d{2}$/.test(batchYear))out.errors.push('Invalid explicit batch year in BronBedrijfUrenScopes!G1');

  var sv=source.getDataRange().getValues(),sh=sv[0]||[],sxMps=ModelCEcasIntegrity_header_(sh,['MPS-nummer','MPS nummer','MPS-number','MPS number']),sxHours=ModelCEcasIntegrity_header_(sh,['Mandated time']),sxServices=ModelCEcasIntegrity_header_(sh,['Services']);
  if(sxMps<0||sxHours<0||sxServices<0)out.errors.push('Required ECAS staging headers missing');
  var sourceByMps={};
  if(!out.errors.length){for(var r=1;r<sv.length;r++){var mps=String(sv[r][sxMps]||'').trim();if(!mps)continue;var services=String(sv[r][sxServices]||'').trim().toUpperCase(),isAbc=services==='MPS-ABC'||services.split(/[;,|]/).map(function(x){return x.trim();}).indexOf('MPS-ABC')>=0;if(!isAbc)continue;var hours=Number(String(sv[r][sxHours]===null||sv[r][sxHours]===undefined?'':sv[r][sxHours]).replace(',','.'));if(!isFinite(hours)||hours<=0){out.errors.push('Invalid MPS-ABC Mandated time: '+mps+' row '+(r+1));continue;}if(sourceByMps[mps]&&Math.abs(sourceByMps[mps].hours-hours)>0.000001)out.errors.push('Conflicting duplicate source MPS-ABC: '+mps);if(!sourceByMps[mps])sourceByMps[mps]={mps:mps,hours:hours,row:r+1};}}
  out.sourceMpsNumbers=Object.keys(sourceByMps).sort();

  var cv=companies.getDataRange().getValues(),ch=cv[0]||[],cxMps=ModelCEcasIntegrity_header_(ch,['Number','MPS-nummer','MPS nummer']),cxUid=ModelCEcasIntegrity_header_(ch,['Company_UID','Company UID']),cxName=ModelCEcasIntegrity_header_(ch,['Company','Company name','Name']),companyByMps={},companyByUid={};
  for(var c=1;c<cv.length;c++){var cmps=cxMps>=0?String(cv[c][cxMps]||'').trim():'',uid=cxUid>=0?String(cv[c][cxUid]||'').trim():'';if(!cmps||!uid)continue;var item={mps:cmps,uid:uid,name:cxName>=0?String(cv[c][cxName]||'').trim():''};companyByMps[cmps]=item;companyByUid[uid]=item;}
  var sourceUids={};out.sourceMpsNumbers.forEach(function(m){if(companyByMps[m])sourceUids[companyByMps[m].uid]=m;});

  var cs=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues()),scopesByUid={};
  cs.forEach(function(x){if(String(x.ScopeCode||'')!=='MPS-ABC')return;var uid=String(x.Company_UID||'').trim();if(!uid)return;if(!scopesByUid[uid])scopesByUid[uid]=[];scopesByUid[uid].push(x);});
  Object.keys(scopesByUid).forEach(function(uid){var rows=scopesByUid[uid],active=rows.filter(function(x){return ModelCEcasIntegrity_truthy_(x.Active);}),inactive=rows.filter(function(x){return !ModelCEcasIntegrity_truthy_(x.Active);});if(rows.length>1)out.duplicateScopeCompanies.push({companyUid:uid,mpsNumber:companyByUid[uid]?companyByUid[uid].mps:'',company:companyByUid[uid]?companyByUid[uid].name:'',total:rows.length,active:active.length,inactive:inactive.length,scopeIds:rows.map(function(x){return String(x.Company_Scope_ID||'');})});});
  var multipleActive=out.duplicateScopeCompanies.filter(function(x){return x.active>1;}),ambiguousInactive=out.duplicateScopeCompanies.filter(function(x){return x.active===0&&x.inactive>1;});

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var completion=realized?ModelCEcasAnnualImport_completedIndexScopeAware_(ss,realized,batchYear,obligations,links):{byCompanyUid:{},genericByCompanyUid:{},matchedByAuditId:0,matchedByScopeColumns:0,mode:'NO_REALIZED_SHEET'};
  Object.keys(sourceUids).forEach(function(uid){if(completion.genericByCompanyUid[uid]&&!completion.byCompanyUid[uid])out.genericOnlyCompletedSuppression.push({companyUid:uid,mpsNumber:sourceUids[uid],company:companyByUid[uid]?companyByUid[uid].name:''});});

  var activeAuditByOb={};links.forEach(function(l){if(String(l.Link_State||'').toUpperCase()==='ACTIVE')activeAuditByOb[String(l.Obligation_ID||'')]=String(l.Audit_ID||'');});
  var apv=apSheet.getDataRange().getValues(),aph=apv[0]||[],axId=ModelCEcasIntegrity_header_(aph,['Audit ID','Audit_ID','AuditId','Audit Id']),axFrom=ModelCEcasIntegrity_header_(aph,['Planning window from','Planning Window From']),axTo=ModelCEcasIntegrity_header_(aph,['Planning window to','Planning Window To']),legacyByAudit={};
  for(var ar=1;ar<apv.length;ar++){var aid=axId>=0?String(apv[ar][axId]||'').trim():'';if(aid)legacyByAudit[aid]={from:axFrom>=0?String(apv[ar][axFrom]||'').trim():'',to:axTo>=0?String(apv[ar][axTo]||'').trim():''};}

  var sameCycleOpen=0,sourceBackedOpen=0,canonicalWindowComplete=0,bothWindowsBlank=0,recoverable=0,stale=0;
  obligations.forEach(function(ob){if(String(ob.ScopeCode||'')!=='MPS-ABC'||String(ob.Cycle_Key||'')!==batchYear||String(ob.Trigger_Source||'').toUpperCase()!=='ECAS')return;var state=String(ob.Obligation_State||'').toUpperCase();if(state==='COMPLETED'||state==='CANCELLED'||state==='REJECTED')return;sameCycleOpen++;var uid=String(ob.Company_UID||'').trim(),mps=sourceUids[uid]||'';if(mps)sourceBackedOpen++;else{stale++;out.staleCanonical.push({companyUid:uid,mpsNumber:companyByUid[uid]?companyByUid[uid].mps:'',company:companyByUid[uid]?companyByUid[uid].name:'',obligationId:String(ob.Obligation_ID||'')});}var cf=String(ob.Planning_Window_From||'').trim(),ct=String(ob.Planning_Window_To||'').trim();if(cf&&ct){canonicalWindowComplete++;return;}var aid=activeAuditByOb[String(ob.Obligation_ID||'')]||'',legacy=aid&&legacyByAudit[aid]?legacyByAudit[aid]:{from:'',to:''};if(!cf&&!ct&&legacy.from&&legacy.to){recoverable++;out.recoverablePlanningWindows.push({mpsNumber:mps||(companyByUid[uid]?companyByUid[uid].mps:''),company:companyByUid[uid]?companyByUid[uid].name:'',obligationId:String(ob.Obligation_ID||''),auditId:aid,legacyFrom:legacy.from,legacyTo:legacy.to});}else if(!cf&&!ct&&!legacy.from&&!legacy.to)bothWindowsBlank++;});

  out.counts={sourceRows:out.sourceMpsNumbers.length,sourceCompaniesMatched:Object.keys(sourceUids).length,companyScopeRows:cs.filter(function(x){return String(x.ScopeCode||'')==='MPS-ABC';}).length,companiesWithMultipleScopeRows:out.duplicateScopeCompanies.length,companiesWithMultipleActiveScopes:multipleActive.length,companiesWithAmbiguousInactiveScopes:ambiguousInactive.length,genericCompletedSourceCompanies:Object.keys(sourceUids).filter(function(uid){return !!completion.genericByCompanyUid[uid];}).length,abcProvenCompletedSourceCompanies:Object.keys(sourceUids).filter(function(uid){return !!completion.byCompanyUid[uid];}).length,abcCompletedMatchedByAuditId:completion.matchedByAuditId||0,abcCompletedMatchedByScopeColumns:completion.matchedByScopeColumns||0,genericOnlyCompletedSuppression:out.genericOnlyCompletedSuppression.length,sameCycleOpenObligations:sameCycleOpen,sourceBackedOpenObligations:sourceBackedOpen,staleCanonicalOpenObligations:stale,canonicalCompletePlanningWindows:canonicalWindowComplete,recoverablePlanningWindowsFromLegacy:recoverable,bothCanonicalAndLegacyWindowBlank:bothWindowsBlank};
  out.completionEvidenceMode=completion.mode;
  out.gates={explicitBatchYear:/^20\d{2}$/.test(batchYear),allSourceCompaniesMatched:Object.keys(sourceUids).length===out.sourceMpsNumbers.length,noMultipleActiveCompanyScopes:multipleActive.length===0,noAmbiguousInactiveCompanyScopes:ambiguousInactive.length===0,completionSuppressionScopeAware:true,nonRecurringCycleWindowRuntime:true,readOnly:true};
  if(out.genericOnlyCompletedSuppression.length)out.warnings.push(out.genericOnlyCompletedSuppression.length+' generic company/year completion(s) are not proven MPS-ABC and must not suppress the import.');
  if(recoverable)out.warnings.push(recoverable+' blank canonical planning window(s) have legacy values, but they are not auto-restored; Cycle_Key supplies the non-recurring annual runtime window.');
  if(stale)out.warnings.push(stale+' same-cycle open canonical MPS-ABC obligation(s) are not present in current source.');
  out.success=out.errors.length===0&&out.gates.explicitBatchYear&&out.gates.allSourceCompaniesMatched&&out.gates.noMultipleActiveCompanyScopes&&out.gates.noAmbiguousInactiveCompanyScopes;
  Logger.log(JSON.stringify(out,null,2));return out;
}

function ModelCEcasIntegrity_header_(headers,names){var norm=(headers||[]).map(function(x){return String(x||'').trim().toLowerCase();});for(var i=0;i<(names||[]).length;i++){var ix=norm.indexOf(String(names[i]||'').trim().toLowerCase());if(ix>=0)return ix;}return-1;}
function ModelCEcasIntegrity_truthy_(v){if(v===true)return true;var s=String(v===null||v===undefined?'':v).trim().toUpperCase();return s==='YES'||s==='TRUE'||s==='1'||s==='X'||s==='Y';}
