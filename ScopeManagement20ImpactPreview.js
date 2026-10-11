// Scope Management 2.0 — read-only material change impact inventory.
// Existing obligation hours are snapshots; this function never reprices them.
function ScopeImpact20_preview_(ss,scopeCode,proposedHours){
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();
  var code=String(scopeCode||'').trim(),hours=Number(String(proposedHours).replace(',','.'));
  if(!code||!isFinite(hours)||hours<0)return {success:false,readOnly:true,errors:['Valid ScopeCode and Hours_to_plan required']};
  var obligations=ss.getSheetByName('Audit_Obligations'),links=ss.getSheetByName('Audit_Visit_Obligations'),planning=ss.getSheetByName('Audit planning');
  if(!obligations||!links||!planning)return {success:false,readOnly:true,errors:['Required Model C or planning sheet missing']};
  function read(sh){var values=sh.getDataRange().getValues(),headers=(values.shift()||[]).map(function(x){return String(x||'').trim();});return values.map(function(r){var o={};headers.forEach(function(h,i){o[h]=r[i];});return o;});}
  var required=[{sheet:obligations,columns:['Obligation_ID','ScopeCode','Company_UID','Formal_Hours']},{sheet:links,columns:['Obligation_ID','Audit_ID','Link_State']},{sheet:planning,columns:['Audit ID','Status']}];
  var missing=[];required.forEach(function(x){var headers=(x.sheet.getDataRange().getValues()[0]||[]).map(function(h){return String(h||'').trim();});x.columns.forEach(function(h){if(headers.indexOf(h)<0)missing.push(x.sheet.getName?x.sheet.getName()+'.'+h:h);});});
  if(missing.length)return {success:false,readOnly:true,writesPerformed:false,errors:['Missing impact schema: '+missing.join(', ')]};
  var obs=read(obligations),lnks=read(links),audits=read(planning),byAudit={},byOb={};
  audits.forEach(function(a){var id=String(a['Audit ID']||'').trim();if(id)byAudit[id]=a;});
  obs.forEach(function(o){byOb[String(o.Obligation_ID||'')]=o;});
  var impacted=[],seen={},unresolved=[];
  lnks.forEach(function(link){
    if(String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;
    var ob=byOb[String(link.Obligation_ID||'')],auditId=String(link.Audit_ID||''),audit=byAudit[auditId];
    if(!ob){unresolved.push('Missing obligation for link '+String(link.Obligation_ID||''));return;}
    if(String(ob.ScopeCode||'')!==code)return;
    if(!audit){unresolved.push('Missing audit '+auditId+' for scope '+code);return;}
    var status=String(audit.Status||'').trim().toUpperCase();
    if(['COMPLETED','CANCELLED','REJECTED'].indexOf(status)>=0)return;
    var oldHours=Number(ob.Formal_Hours),changed=isFinite(oldHours)&&oldHours!==hours;
    if(!changed||seen[auditId+'|'+ob.Obligation_ID])return;
    seen[auditId+'|'+ob.Obligation_ID]=true;
    impacted.push({auditId:auditId,companyUid:String(ob.Company_UID||''),status:status,accepted:status==='ACCEPTED',obligationId:String(ob.Obligation_ID||''),currentHoursToPlan:oldHours,proposedHoursToPlan:hours,deltaHours:hours-oldHours});
  });
  if(unresolved.length)return {success:false,readOnly:true,writesPerformed:false,errors:unresolved};
  impacted.sort(function(a,b){return Number(b.accepted)-Number(a.accepted)||a.auditId.localeCompare(b.auditId);});
  return {success:true,readOnly:true,writesPerformed:false,scopeCode:code,proposedHoursToPlan:hours,impactedCount:impacted.length,acceptedCount:impacted.filter(function(x){return x.accepted;}).length,impacted:impacted};
}
