/**
 * AMS-01.6 Model C — ECAS MPS-ABC completion evidence diagnostic.
 * READ-ONLY. No writes.
 * Purpose: resolve company/year generic completion matches to actual MPS-ABC evidence
 * before canonical import may create replacement obligations.
 */
var MODEL_C_ECAS_COMPLETION_EVIDENCE_AUDIT_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_COMPLETION_EVIDENCE_AUDIT_R1';

function RUN_MODEL_C_ECAS_COMPLETION_EVIDENCE_AUDIT(){
  var ss=SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ECAS_COMPLETION_EVIDENCE_AUDIT_BUILD,readOnly:true,writesPerformed:false,batchYear:'',counts:{},items:[],staleCanonical:[],errors:[],warnings:[]};
  var source=ss.getSheetByName('BronBedrijfUrenScopes');
  var companies=ss.getSheetByName('Companies');
  var realized=ss.getSheetByName('Log realized audits');
  var ap=ss.getSheetByName('Audit planning');
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!source||!companies||!realized||!ap||!obSheet||!lkSheet){out.errors.push('Required sheet missing');Logger.log(JSON.stringify(out,null,2));return out;}
  var year=String(source.getRange('G1').getDisplayValue()||'').trim();out.batchYear=year;
  if(!/^20\d{2}$/.test(year)){out.errors.push('Invalid batch year');Logger.log(JSON.stringify(out,null,2));return out;}

  var cv=companies.getDataRange().getValues(),ch=cv[0]||[];
  var cxMps=ModelCEcasCompletionEvidence_header_(ch,['Number','MPS-nummer','MPS nummer']);
  var cxUid=ModelCEcasCompletionEvidence_header_(ch,['Company_UID','Company UID']);
  var cxName=ModelCEcasCompletionEvidence_header_(ch,['Company','Company name','Name']);
  var companyByMps={},companyByUid={};
  for(var c=1;c<cv.length;c++){
    var mps=cxMps>=0?String(cv[c][cxMps]||'').trim():'',uid=cxUid>=0?String(cv[c][cxUid]||'').trim():'';
    if(!mps||!uid)continue;
    var ci={mps:mps,uid:uid,name:cxName>=0?String(cv[c][cxName]||'').trim():''};companyByMps[mps]=ci;companyByUid[uid]=ci;
  }

  var sv=source.getDataRange().getValues(),sh=sv[0]||[];
  var sxMps=ModelCEcasCompletionEvidence_header_(sh,['MPS-nummer','MPS nummer','MPS-number','MPS number']);
  var sxSvc=ModelCEcasCompletionEvidence_header_(sh,['Services']);
  var sourceUids={};
  for(var s=1;s<sv.length;s++){
    var smps=sxMps>=0?String(sv[s][sxMps]||'').trim():'',svc=sxSvc>=0?String(sv[s][sxSvc]||'').trim().toUpperCase():'';
    if(!smps||!ModelCEcasCompletionEvidence_isAbc_(svc)||!companyByMps[smps])continue;
    sourceUids[companyByMps[smps].uid]=smps;
  }

  var apv=ap.getDataRange().getValues(),aph=apv[0]||[];
  var axId=ModelCEcasCompletionEvidence_header_(aph,['Audit ID','Audit_ID','AuditId','Audit Id']);
  var axUid=ModelCEcasCompletionEvidence_header_(aph,['Company_UID','Company UID']);
  var axStatus=ModelCEcasCompletionEvidence_header_(aph,['Status']);
  var axYear=ModelCEcasCompletionEvidence_header_(aph,['Year','Cycle year','Audit year']);
  var axPlanned=ModelCEcasCompletionEvidence_header_(aph,['Date - Planned','Date planned','Planned date']);
  var abcDef=null;
  try{
    var defs=m5t_scopeSlotDefs_(ss)||[];
    for(var di=0;di<defs.length;di++){
      var d=defs[di]||{};
      if(String(d.slotKey||'').toUpperCase()==='MPS-ABC'||String(d.scope||'').toUpperCase()==='MPS-ABC'||String(d.scopeCode||'').toUpperCase()==='MPS-ABC'){abcDef=d;break;}
    }
  }catch(eDefs){}
  var axAbc=-1;
  if(abcDef&&abcDef.flagCol0!=null)axAbc=Number(abcDef.flagCol0);
  if(axAbc<0)axAbc=ModelCEcasCompletionEvidence_header_(aph,['MPS-ABC']);
  var apByAudit={},apByUid={};
  for(var ar=1;ar<apv.length;ar++){
    var aid=axId>=0?String(apv[ar][axId]||'').trim():'',auid=axUid>=0?String(apv[ar][axUid]||'').trim():'';
    if(!aid&&!auid)continue;
    var abc=axAbc>=0?ModelCEcasCompletionEvidence_truthy_(apv[ar][axAbc]):false;
    var ay=axYear>=0?String(apv[ar][axYear]||'').trim().slice(0,4):'';
    if(!/^20\d{2}$/.test(ay)&&axPlanned>=0)ay=ModelCEcasCompletionEvidence_year_(apv[ar][axPlanned],ss);
    var ai={auditId:aid,uid:auid,status:axStatus>=0?String(apv[ar][axStatus]||'').trim():'',year:ay,abc:abc,row:ar+1};
    if(aid)apByAudit[aid]=ai;
    if(auid){if(!apByUid[auid])apByUid[auid]=[];apByUid[auid].push(ai);}
  }

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var obById={};obligations.forEach(function(o){obById[String(o.Obligation_ID||'')]=o;});
  var abcAuditIds={};
  links.forEach(function(l){
    var ob=obById[String(l.Obligation_ID||'')];if(!ob)return;
    if(String(ob.ScopeCode||'')==='MPS-ABC')abcAuditIds[String(l.Audit_ID||'')]=true;
  });

  var rv=realized.getDataRange().getValues(),rh=rv[0]||[];
  var rxUid=ModelCEcasCompletionEvidence_header_(rh,['Company_UID','Company UID','CompanyUid']);
  var rxYear=ModelCEcasCompletionEvidence_header_(rh,['Year','Audit year']);
  var rxStatus=ModelCEcasCompletionEvidence_header_(rh,['Status']);
  var rxAudit=ModelCEcasCompletionEvidence_header_(rh,['Audit ID','Audit_ID','AuditId','Audit Id']);
  var rxCompleted=ModelCEcasCompletionEvidence_header_(rh,['Date completed','Completed date','Completion date']);
  var rxPlanned=ModelCEcasCompletionEvidence_header_(rh,['Date planned','Planned date','Audit date']);
  var genericRowsByUid={};
  for(var rr=1;rr<rv.length;rr++){
    var ruid=rxUid>=0?String(rv[rr][rxUid]||'').trim():'';if(!ruid||!sourceUids[ruid])continue;
    if(rxStatus>=0&&String(rv[rr][rxStatus]||'').trim().toUpperCase()!=='COMPLETED')continue;
    var ry=rxYear>=0?String(rv[rr][rxYear]||'').trim().slice(0,4):'';
    if(!/^20\d{2}$/.test(ry)&&rxCompleted>=0)ry=ModelCEcasCompletionEvidence_year_(rv[rr][rxCompleted],ss);
    if(!/^20\d{2}$/.test(ry)&&rxPlanned>=0)ry=ModelCEcasCompletionEvidence_year_(rv[rr][rxPlanned],ss);
    if(ry!==year)continue;
    var raid=rxAudit>=0?String(rv[rr][rxAudit]||'').trim():'';
    if(!genericRowsByUid[ruid])genericRowsByUid[ruid]=[];
    genericRowsByUid[ruid].push({row:rr+1,auditId:raid,status:rxStatus>=0?String(rv[rr][rxStatus]||'').trim():'',year:ry});
  }

  var proven=0,ambiguous=0,notAbc=0,noAuditId=0;
  Object.keys(genericRowsByUid).sort().forEach(function(uid){
    var ci=companyByUid[uid]||{mps:sourceUids[uid]||'',name:''};
    var rows=genericRowsByUid[uid]||[];
    var evidence=[];
    rows.forEach(function(r){
      if(!r.auditId){noAuditId++;evidence.push({auditId:'',result:'NO_AUDIT_ID_IN_LOG'});return;}
      var api=apByAudit[r.auditId]||null;
      var modelAbc=!!abcAuditIds[r.auditId];
      var legacyAbc=!!(api&&api.abc);
      evidence.push({auditId:r.auditId,result:(modelAbc||legacyAbc)?'PROVEN_ABC':(api?'AUDIT_EXISTS_NOT_ABC':'AUDIT_ID_NOT_FOUND'),modelCAbc:modelAbc,legacyAbc:legacyAbc,auditPlanningStatus:api?api.status:'',auditPlanningYear:api?api.year:''});
    });
    var hasProof=evidence.some(function(e){return e.result==='PROVEN_ABC';});
    var hasNotAbc=evidence.some(function(e){return e.result==='AUDIT_EXISTS_NOT_ABC';});
    var sameCompanyLegacyAbc=(apByUid[uid]||[]).filter(function(a){return a.abc&&a.year===year;});
    var classification='AMBIGUOUS';
    if(hasProof){classification='PROVEN_ABC_COMPLETED';proven++;}
    else if(hasNotAbc&&sameCompanyLegacyAbc.length===0){classification='PROVEN_OTHER_SCOPE_COMPLETED';notAbc++;}
    else{ambiguous++;}
    out.items.push({companyUid:uid,mpsNumber:ci.mps||sourceUids[uid],company:ci.name||'',classification:classification,completedLogRows:rows.length,evidence:evidence,sameCompanyYearLegacyAbcAudits:sameCompanyLegacyAbc.map(function(a){return{auditId:a.auditId,status:a.status,row:a.row};})});
  });

  var sourceUidSet=sourceUids;
  obligations.forEach(function(ob){
    if(String(ob.ScopeCode||'')!=='MPS-ABC'||String(ob.Cycle_Key||'')!==year||String(ob.Trigger_Source||'').toUpperCase()!=='ECAS')return;
    var state=String(ob.Obligation_State||'').toUpperCase();if(state==='COMPLETED'||state==='CANCELLED'||state==='REJECTED')return;
    var uid=String(ob.Company_UID||'').trim();if(sourceUidSet[uid])return;
    var ci=companyByUid[uid]||{};
    out.staleCanonical.push({companyUid:uid,mpsNumber:ci.mps||'',company:ci.name||'',obligationId:String(ob.Obligation_ID||''),formalHours:Number(ob.Formal_Hours||0),state:state});
  });

  out.counts={sourceCompanies:Object.keys(sourceUids).length,genericCompletedCompanies:Object.keys(genericRowsByUid).length,provenAbcCompleted:proven,provenOtherScopeCompleted:notAbc,ambiguousCompletionCompanies:ambiguous,logRowsWithoutAuditId:noAuditId,staleCanonicalOpen:out.staleCanonical.length};
  out.gates={allGenericCompletionsResolved:ambiguous===0,readOnly:true};
  if(ambiguous)out.warnings.push(ambiguous+' generic completion company match(es) remain ambiguous; do not APPLY ECAS import yet.');
  out.success=out.errors.length===0;
  Logger.log(JSON.stringify(out,null,2));
  return out;
}

function ModelCEcasCompletionEvidence_header_(headers,names){var h=(headers||[]).map(function(x){return String(x||'').trim().toLowerCase();});for(var i=0;i<(names||[]).length;i++){var ix=h.indexOf(String(names[i]||'').trim().toLowerCase());if(ix>=0)return ix;}return-1;}
function ModelCEcasCompletionEvidence_truthy_(v){if(v===true)return true;var s=String(v===null||v===undefined?'':v).trim().toUpperCase();return s==='X'||s==='YES'||s==='TRUE'||s==='1'||s==='Y';}
function ModelCEcasCompletionEvidence_isAbc_(v){var s=String(v||'').trim().toUpperCase();return s==='MPS-ABC'||s.split(/[;,|]/).map(function(x){return x.trim();}).indexOf('MPS-ABC')>=0;}
function ModelCEcasCompletionEvidence_year_(v,ss){if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone(),'yyyy');var m=String(v||'').match(/(20\d{2})/);return m?m[1]:'';}
