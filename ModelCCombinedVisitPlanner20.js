// AMS 2.0, issue #45: pure canonical Model C combined-Visit membership planner.
// No SpreadsheetApp, Availability writes, lifecycle status writes or notifications.
// Input is an authenticated, fresh snapshot held under the canonical write lock.
var MODEL_C_COMBINED_VISIT_PLANNER_20_BUILD='2026-10-22_ISSUE45_COMPOSITION_R1';
function ModelCCombinedVisitPlanner20_plan(input){
 input=input||{};
 function clean(v){return String(v==null?'':v).trim();}
 var target=clean(input.targetAuditId),raw=Array.isArray(input.memberAuditIds)?input.memberAuditIds:[],members=[],memberSet={};
 [target].concat(raw).forEach(function(v){var id=clean(v);if(id&&!memberSet[id]){members.push(id);memberSet[id]=true;}});
 if(!target||members.length<2)throw Error('COMBINED_VISIT_MEMBER_SET_INVALID');
 if(members.length>20)throw Error('COMBINED_VISIT_MAX_MEMBERS_EXCEEDED');
 var audits=Array.isArray(input.audits)?input.audits:[],links=Array.isArray(input.links)?input.links:[],obligations=Array.isArray(input.obligations)?input.obligations:[];
 var auditsById={},obById={},linksByOb={},activeByAudit={},companyUid='';
 audits.forEach(function(a){var id=clean(a&&a.auditId);if(id){if(auditsById[id])throw Error('COMBINED_VISIT_DUPLICATE_AUDIT_ID');auditsById[id]=a;}});
 obligations.forEach(function(o){var id=clean(o&&o.obligationId);if(id){if(obById[id])throw Error('COMBINED_VISIT_DUPLICATE_OBLIGATION');obById[id]=o;}});
 members.forEach(function(id){var a=auditsById[id];if(!a)throw Error('COMBINED_VISIT_AUDIT_MISSING');
   if(clean(a.status).toUpperCase().replace(/[\s-]+/g,'_')!=='PENDING_PLANNING')throw Error('COMBINED_VISIT_STATUS_CONFLICT');
   var uid=clean(a.companyUid);if(!uid)throw Error('COMBINED_VISIT_COMPANY_UID_REQUIRED');
   if(companyUid&&uid!==companyUid)throw Error('COMBINED_VISIT_COMPANY_MISMATCH');
   companyUid=uid;
 });
 links.forEach(function(link){if(clean(link&&link.linkState).toUpperCase()!=='ACTIVE')return;
   var ob=clean(link.obligationId),aid=clean(link.auditId);
   if(!ob||!aid)throw Error('COMBINED_VISIT_ACTIVE_LINK_ID_MISSING');
   if(linksByOb[ob])throw Error('COMBINED_VISIT_DUPLICATE_ACTIVE_OBLIGATION');
   linksByOb[ob]=link;
   if(!activeByAudit[aid])activeByAudit[aid]=[];
   activeByAudit[aid].push(link);
 });
 var selected=[],close=[],newLinks=[],scope={},obligationSet={};
 members.forEach(function(aid){var active=activeByAudit[aid]||[];if(!active.length)throw Error('COMBINED_VISIT_MEMBER_WITHOUT_ACTIVE_LINK');
   active.forEach(function(link){
     var oid=clean(link.obligationId),ob=obById[oid];if(!ob)throw Error('COMBINED_VISIT_LINK_ORPHAN_OBLIGATION');
     var state=clean(ob.obligationState).toUpperCase();
     if(state==='COMPLETED'||state==='REJECTED'||state==='CANCELLED')throw Error('COMBINED_VISIT_TERMINAL_OBLIGATION_ACTIVE_LINK');
     if(clean(ob.companyUid)&&clean(ob.companyUid)!==companyUid)throw Error('COMBINED_VISIT_OBLIGATION_COMPANY_CONFLICT');
     if(obligationSet[oid])throw Error('COMBINED_VISIT_DUPLICATE_SELECTED_OBLIGATION');
     obligationSet[oid]=true;selected.push(oid);if(clean(ob.scopeCode))scope[clean(ob.scopeCode)]=true;
     if(aid!==target){close.push({auditId:aid,obligationId:oid,expectedLinkState:'ACTIVE'});
       newLinks.push({auditId:target,obligationId:oid,linkState:'ACTIVE'});}
   });
 });
 return {success:true,build:MODEL_C_COMBINED_VISIT_PLANNER_20_BUILD,targetAuditId:target,companyUid:companyUid,
  memberAuditIds:members,sourceAuditIds:members.filter(function(id){return id!==target;}),
  obligationIds:selected,scopeCodes:Object.keys(scope).sort(),closeLinks:close,newLinks:newLinks,
  unchangedTargetLinks:(activeByAudit[target]||[]).length,readsOnly:true,writesPerformed:false};
}
