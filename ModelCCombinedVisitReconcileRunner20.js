// AMS 2.0 issue #45, DEV-only read-only combined Visit reconciliation probe.
function ModelCCombinedVisitReconcile20_run(input){
 input=input||{};
 if(String(input.runtimeEnv||'')!=='DEV')throw Error('COMBINED_RECONCILE_DEV_ONLY');
 var target=String(input.targetAuditId||'').trim(),sources=Array.isArray(input.sourceAuditIds)?input.sourceAuditIds.map(function(x){return String(x||'').trim();}):[];
 if(!target||!sources.length||sources.length>19)throw Error('COMBINED_RECONCILE_MEMBERS_REQUIRED');
 if(typeof ModelCCombinedVisitReconcile20_classify!=='function')throw Error('COMBINED_RECONCILE_CLASSIFIER_UNAVAILABLE');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 function rows(name){var sh=ss.getSheetByName(name);if(!sh)throw Error('COMBINED_RECONCILE_SHEET_MISSING_'+name);var d=sh.getDataRange().getValues();return{h:d[0]||[],r:d.slice(1)};}
 function ix(h,n){var i=h.indexOf(n);if(i<0)throw Error('COMBINED_RECONCILE_COLUMN_MISSING_'+n);return i;}
 var audit=rows('Audit planning'),link=rows('Audit_Visit_Obligations'),concept=rows('Concept Reservations'),av=rows('Auditor Availability');
 var ai=ix(audit.h,'Audit ID'),as=ix(audit.h,'Status'),ap=ix(audit.h,'Planning JSON'),li=ix(link.h,'Audit_ID'),lo=ix(link.h,'Obligation_ID'),ls=ix(link.h,'Link_State'),ci=ix(concept.h,'Audit ID'),cs=ix(concept.h,'State'),av1=ix(av.h,'Audit_ID_1'),av2=ix(av.h,'Audit_ID_2');
 var ids=[target].concat(sources),visits=[],links=[],reservations=[],availability=[];
 audit.r.forEach(function(r){var id=String(r[ai]||'').trim();if(ids.indexOf(id)>=0)visits.push({auditId:id,status:r[as],planningJson:r[ap]});});
 link.r.forEach(function(r){var id=String(r[li]||'').trim();links.push({auditId:id,obligationId:r[lo],linkState:r[ls]});});
 concept.r.forEach(function(r){var id=String(r[ci]||'').trim();if(ids.indexOf(id)>=0)reservations.push({auditId:id,state:r[cs]});});
 av.r.forEach(function(r){[r[av1],r[av2]].forEach(function(id){id=String(id||'').trim();if(sources.indexOf(id)>=0)availability.push({auditId:id});});});
 var result=ModelCCombinedVisitReconcile20_classify({targetAuditId:target,sourceAuditIds:sources,visits:visits,links:links,reservations:reservations,availability:availability});
 result.runtimeEnv='DEV';result.readOnly=true;result.writesPerformed=false;
 return result;
}
