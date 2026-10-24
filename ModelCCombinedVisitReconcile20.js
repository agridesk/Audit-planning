// AMS 2.0 issue #45 — read-only recovery classifier, no automatic writes.
// The caller passes fresh canonical rows after acquiring its read snapshot.
function ModelCCombinedVisitReconcile20_classify(input){
 input=input||{};
 var clean=function(x){return String(x==null?'':x).trim();};
 var target=clean(input.targetAuditId),sources=Array.isArray(input.sourceAuditIds)?input.sourceAuditIds.map(clean):[];
 if(!target||!sources.length||new Set([target].concat(sources)).size!==sources.length+1)throw Error('RECONCILE_COMBINED_MEMBER_SET_INVALID');
 var visits=Array.isArray(input.visits)?input.visits:[],links=Array.isArray(input.links)?input.links:[],reservations=Array.isArray(input.reservations)?input.reservations:[],availability=Array.isArray(input.availability)?input.availability:[],obligations=Array.isArray(input.obligations)?input.obligations:[];
 var byId={},issues=[];
 visits.forEach(function(v){var id=clean(v.auditId);if(id){if(byId[id])issues.push('DUPLICATE_VISIT_ID:'+id);byId[id]=v;}});
 var parent=byId[target],p={};
 if(parent&&clean(parent.planningJson)){try{p=JSON.parse(parent.planningJson);}catch(e){issues.push('TARGET_PLANNING_JSON_INVALID');}}
 var expectedSources=sources.slice().sort().join('|'),storedSources=Array.isArray(p.sourceAuditIds)?p.sourceAuditIds.map(clean).sort().join('|'):'';
 var accepted=parent&&['APPROVED','ACCEPTED'].indexOf(clean(parent.status).toUpperCase().replace(/[\s-]+/g,'_'))>=0;
 var provenance=accepted&&storedSources===expectedSources&&Array.isArray(p.obligationIds)&&p.obligationIds.length>0;
 if(!parent)issues.push('TARGET_MISSING');
 else if(!accepted)issues.push('TARGET_NOT_COMMITTED');
 else if(!provenance)issues.push('TARGET_PROVENANCE_MISMATCH');
 var sourcePresent=sources.filter(function(id){return !!byId[id];});
 if(sourcePresent.length)issues.push('SOURCE_VISIT_STILL_ACTIVE');
 var activeByOb={},activeByAudit={},duplicate=false;
 links.forEach(function(l){if(clean(l.linkState).toUpperCase()!=='ACTIVE')return;var ob=clean(l.obligationId),aid=clean(l.auditId);
 if(activeByOb[ob]){duplicate=true;issues.push('DUPLICATE_ACTIVE_OBLIGATION_LINK');}
 activeByOb[ob]=aid;if(!activeByAudit[aid])activeByAudit[aid]=[];activeByAudit[aid].push(ob);
 });
 var obligationById={};
 obligations.forEach(function(o){var id=clean(o.obligationId);if(id)obligationById[id]=clean(o.obligationState).toUpperCase();});
 Object.keys(activeByOb).forEach(function(id){
   if(obligations.length&&!(id in obligationById))issues.push('ACTIVE_LINK_OBLIGATION_MISSING');
   if(['REJECTED','CANCELLED','COMPLETED'].indexOf(obligationById[id])>=0)issues.push('ACTIVE_LINK_TERMINAL_OBLIGATION');
 });
 var expectedOb=Array.isArray(p.obligationIds)?p.obligationIds.map(clean):[];
 expectedOb.forEach(function(id){if(activeByOb[id]!==target)issues.push('OBLIGATION_OWNER_MISMATCH');});
 (activeByAudit[target]||[]).forEach(function(id){if(expectedOb.indexOf(id)<0)issues.push('UNEXPECTED_TARGET_ACTIVE_OBLIGATION');});
 if((activeByAudit[target]||[]).length!==expectedOb.length)issues.push('TARGET_LINK_CARDINALITY_MISMATCH');
 sources.forEach(function(id){if((activeByAudit[id]||[]).length)issues.push('SOURCE_ACTIVE_LINK_REMAINS');});
 if(duplicate)issues.push('MULTIPLE_ACTIVE_LINKS');
 reservations.forEach(function(r){if(sources.indexOf(clean(r.auditId))>=0&&clean(r.state).toUpperCase()==='ACTIVE')issues.push('SOURCE_RESERVATION_ACTIVE');});
 availability.forEach(function(a){if(sources.indexOf(clean(a.auditId))>=0)issues.push('SOURCE_AVAILABILITY_SLOT_STILL_ASSIGNED');});
 issues=Array.from(new Set(issues));
 var healthy=issues.length===0;
 return{success:true,readOnly:true,consistent:healthy,reconcileRequired:!healthy,
  classification:healthy?'COMMITTED_CONSISTENT':'MANUAL_RECONCILIATION_REQUIRED',
  issues:issues,sourceVisitsStillActive:sourcePresent.length,expectedObligations:expectedOb.length,
  automaticWritesAllowed:false};
}
