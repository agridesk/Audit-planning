// Issue #45: DEV-only read-only candidate preflight. Never commits a Visit.
function RUN_AMS45_COMBINED_CANDIDATE_PREFLIGHT(){
 if(typeof V5_ENTRY_isDevEnv_!=='function'||!V5_ENTRY_isDevEnv_())throw Error('AMS45_PREFLIGHT_DEV_ONLY');
 if(typeof ModelCCombinedVisitPlanner20_plan!=='function')throw Error('AMS45_PREFLIGHT_PLANNER_UNAVAILABLE');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 function table(name){var sh=ss.getSheetByName(name);if(!sh)throw Error('AMS45_PREFLIGHT_SHEET_MISSING_'+name);
  var n=sh.getLastRow(),w=sh.getLastColumn();if(n>30000)throw Error('AMS45_PREFLIGHT_ROW_BOUND_'+name);
  var a=n?sh.getRange(1,1,n,w).getDisplayValues():[[]];return{h:a[0],r:a.slice(1)};}
 function idx(t,k){var i=t.h.indexOf(k);if(i<0)throw Error('AMS45_PREFLIGHT_HEADER_'+k);return i;}
 function c(x){return String(x==null?'':x).trim();}
 var ap=table('Audit planning'),lk=table('Audit_Visit_Obligations'),ob=table('Audit_Obligations'),av=table('Auditor Availability');
 var aid=idx(ap,'Audit ID'),status=idx(ap,'Status'),company=idx(ap,'Company_UID'),la=idx(lk,'Audit_ID'),lo=idx(lk,'Obligation_ID'),ls=idx(lk,'Link_State'),
  oi=idx(ob,'Obligation_ID'),os=idx(ob,'Obligation_State'),oc=idx(ob,'Company_UID'),osc=idx(ob,'ScopeCode'),
  av1=idx(av,'Audit_ID_1'),av2=idx(av,'Audit_ID_2');
 var audits=[],links=[],obligations=[],occupied={},groups={};
 ap.r.forEach(function(r){var id=c(r[aid]),uid=c(r[company]);if(!id)return;audits.push({auditId:id,status:c(r[status]),companyUid:uid});
  if(c(r[status]).toUpperCase()==='PENDING PLANNING'&&uid){if(!groups[uid])groups[uid]=[];groups[uid].push(id);}});
 lk.r.forEach(function(r){links.push({auditId:c(r[la]),obligationId:c(r[lo]),linkState:c(r[ls])});});
 ob.r.forEach(function(r){obligations.push({obligationId:c(r[oi]),obligationState:c(r[os]),companyUid:c(r[oc]),scopeCode:c(r[osc])});});
 av.r.forEach(function(r){[r[av1],r[av2]].forEach(function(id){id=c(id);if(id)occupied[id]=true;});});
 var out=[],eligible=0;
 Object.keys(groups).forEach(function(uid){var ids=groups[uid];if(ids.length<2)return;
  var item={companyUid:uid,memberCount:ids.length,memberAuditIds:ids.slice(),readOnly:true,eligible:false,reasons:[]};
  if(ids.length>20)item.reasons.push('MEMBER_LIMIT_EXCEEDED');
  if(ids.some(function(id){return occupied[id];}))item.reasons.push('SOURCE_OR_TARGET_AVAILABILITY_OCCUPIED');
  if(!item.reasons.length){try{var plan=ModelCCombinedVisitPlanner20_plan({targetAuditId:ids[0],memberAuditIds:ids.slice(1),audits:audits,links:links,obligations:obligations});
    item.eligible=true;item.targetAuditId=plan.targetAuditId;item.sourceAuditIds=plan.sourceAuditIds;
    item.obligationCount=plan.obligationIds.length;item.scopeCodes=plan.scopeCodes;eligible++;
   }catch(e){item.reasons.push(c(e&&e.message||e));}}
  out.push(item);
 });
 return{success:true,env:'DEV',readOnly:true,writesPerformed:false,candidateGroups:out.length,eligibleGroups:eligible,
  candidates:out,warning:'Preflight only: canonical revision, formal hours, reservations and write-boundary checks are still required'};
}
