// AMS 2.0 — Issue #45. Read-only Model C integrity diagnostic.
// Only returns aggregate data; does not mutate Sheets, lifecycle or Availability.
var MODEL_C_REJECTED_LINK_INTEGRITY_BUILD='2026-10-22_ISSUE45_READONLY_R1';
function RUN_MODEL_C_REJECTED_LINK_INTEGRITY_20(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw Error('MODEL_C_SPREADSHEET_UNAVAILABLE');
  function table(name){
    var sh=ss.getSheetByName(name);if(!sh)throw Error('MODEL_C_MISSING_SHEET_'+name.replace(/\s/g,'_'));
    var n=sh.getLastRow();if(n<1)return{h:[],rows:[]};
    if(n>30000)throw Error('MODEL_C_DIAGNOSTIC_ROW_BOUND_'+name);
    var data=sh.getRange(1,1,n,Math.min(sh.getLastColumn(),60)).getDisplayValues();
    return{h:data[0].map(function(v){return String(v||'').trim();}),rows:data.slice(1)};
  }
  function idx(t,key){var i=t.h.indexOf(key);if(i<0)throw Error('MODEL_C_DIAGNOSTIC_HEADER_MISSING_'+key);return i;}
  var links=table('Audit_Visit_Obligations'),ob=table('Audit_Obligations'),planning=table('Audit planning'),rejected=table('Rejected audits');
  var li=idx(links,'Audit_ID'),lo=idx(links,'Obligation_ID'),ls=idx(links,'Link_State'),oi=idx(ob,'Obligation_ID'),ps=idx(planning,'Audit ID'),ri=idx(rejected,'Audit ID');
  var live={},archived={},obligations={};planning.rows.forEach(function(r){if(r[ps])live[String(r[ps]).trim()]=true;});rejected.rows.forEach(function(r){if(r[ri])archived[String(r[ri]).trim()]=true;});ob.rows.forEach(function(r){if(r[oi])obligations[String(r[oi]).trim()]=true;});
  var seen={},out={ok:true,build:MODEL_C_REJECTED_LINK_INTEGRITY_BUILD,readOnly:true,linksActive:0,linksInactive:0,activeDuplicateObligationLinks:0,activeMissingObligation:0,activeRejectedAuditLinks:0,activeUnknownAuditLinks:0};
  links.rows.forEach(function(r){var state=String(r[ls]||'').trim().toUpperCase();if(state!=='ACTIVE'){out.linksInactive++;return;}
    out.linksActive++;var oid=String(r[lo]||'').trim(),aid=String(r[li]||'').trim();
    if(seen[oid])out.activeDuplicateObligationLinks++;seen[oid]=true;
    if(!oid||!obligations[oid])out.activeMissingObligation++;
    if(!live[aid]){if(archived[aid])out.activeRejectedAuditLinks++;else out.activeUnknownAuditLinks++;}
  });
  out.ok=out.activeDuplicateObligationLinks===0&&out.activeMissingObligation===0&&out.activeRejectedAuditLinks===0&&out.activeUnknownAuditLinks===0;
  return out;
}

/**
 * DEV-only, read-only candidate preview for pre-existing rejected Visit links.
 * Does not close links: that is a separate approved canonical repair action.
 */
function RUN_MODEL_C_REJECTED_LINK_REPAIR_PREVIEW_20(){
  if(typeof V5_ENTRY_isDevEnv_!=='function'||!V5_ENTRY_isDevEnv_())throw Error('MODEL_C_REPAIR_PREVIEW_DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw Error('MODEL_C_REPAIR_PREVIEW_NO_SPREADSHEET');
  function rows(name){
    var sh=ss.getSheetByName(name);if(!sh)throw Error('MODEL_C_REPAIR_PREVIEW_MISSING_SHEET_'+name);
    var last=sh.getLastRow();if(last>30000)throw Error('MODEL_C_REPAIR_PREVIEW_ROW_BOUND');
    var data=last?sh.getRange(1,1,last,Math.min(sh.getLastColumn(),60)).getDisplayValues():[[]];
    return{h:(data[0]||[]).map(function(x){return String(x||'').trim();}),r:data.slice(1)};
  }
  function col(t,k){var i=t.h.indexOf(k);if(i<0)throw Error('MODEL_C_REPAIR_PREVIEW_MISSING_HEADER_'+k);return i;}
  var planning=rows('Audit planning'),rejected=rows('Rejected audits'),links=rows('Audit_Visit_Obligations'),ob=rows('Audit_Obligations');
  var pi=col(planning,'Audit ID'),ri=col(rejected,'Audit ID'),la=col(links,'Audit_ID'),lo=col(links,'Obligation_ID'),ls=col(links,'Link_State'),oi=col(ob,'Obligation_ID');
  var active={},archived={},known={},occurrences={},candidates=[];
  planning.r.forEach(function(r){var id=String(r[pi]||'').trim();if(id)active[id]=true;});
  rejected.r.forEach(function(r){var id=String(r[ri]||'').trim();if(id)archived[id]=true;});
  ob.r.forEach(function(r){var id=String(r[oi]||'').trim();if(id)known[id]=true;});
  links.r.forEach(function(r,i){
    if(String(r[ls]||'').trim().toUpperCase()!=='ACTIVE')return;
    var oid=String(r[lo]||'').trim();if(oid)occurrences[oid]=(occurrences[oid]||0)+1;
    var aid=String(r[la]||'').trim();
    if(archived[aid]&&!active[aid])candidates.push({rowNumber:i+2,auditId:aid,obligationId:oid,linkState:'ACTIVE'});
  });
  var conflicts=[];
  candidates.forEach(function(c){
    if(!known[c.obligationId])conflicts.push('OBLIGATION_MISSING:'+c.obligationId);
    if(occurrences[c.obligationId]!==1)conflicts.push('MULTIPLE_ACTIVE_OWNERS:'+c.obligationId);
  });
  return{success:true,readOnly:true,writesPerformed:false,canonicalRepairExecuted:false,
    candidates:candidates,conflicts:conflicts,eligibleForReviewedRepair:candidates.length>0&&conflicts.length===0,
    nextStep:'MANUAL_CANONICAL_REPAIR_APPROVAL_REQUIRED'};
}
