/**
 * Fail-closed auditor UID resolution against canonical Auditors SSOT.
 * UID is never inferred from email or a client-supplied value.
 */
function Swap20_auditorIdentityRows_(){
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
 if(!id)throw Error('Canonical SSOT spreadsheet ID unavailable');
 var sh=SpreadsheetApp.openById(id).getSheetByName('Auditors');
 if(!sh)throw Error('Canonical Auditors sheet unavailable');
 var rows=sh.getDataRange().getValues();
 if(rows.length<2)throw Error('Canonical Auditors directory empty');
 var heads=rows.shift().map(function(x){return String(x||'').trim().toLowerCase().replace(/[ _-]/g,'');});
 function col(names){for(var i=0;i<names.length;i++){var j=heads.indexOf(names[i]);if(j>=0)return j;}return -1;}
 var uid=col(['auditoruid','auditoruuid','uid','uuid']),email=col(['email','emailaddress']),active=col(['active']);
 if(uid<0||email<0)throw Error('Auditor UID/Email canonical columns unavailable');
 var byEmail={},byUid={};
 rows.forEach(function(row){
  var u=String(row[uid]||'').trim(),e=String(row[email]||'').trim().toLowerCase();
  if(!u||!e)return;
  if(active>=0&&!['YES','TRUE','1','ACTIVE'].includes(String(row[active]||'').trim().toUpperCase()))return;
  if(byEmail[e]||byUid[u])throw Error('Duplicate canonical auditor identity');
  byEmail[e]=u;byUid[u]=e;
 });
 return byEmail;
}
function Swap20_resolveAuditorUidByEmail_(email){
 var key=String(email||'').trim().toLowerCase();
 if(!key)throw Error('Auditor email required');
 var uid=Swap20_auditorIdentityRows_()[key];
 if(!uid)throw Error('Canonical auditor identity missing');
 return uid;
}
function Swap20_resolveAuditorUidForAudit_(auditId){
 var audit=PlanningWorkspacePlannedAuditReadService_get({auditId:auditId});
 if(!audit||!audit.success||String(audit.normalizedStatus).toUpperCase()!=='ACCEPTED')throw Error('Accepted audit required');
 return Swap20_resolveAuditorUidByEmail_(audit.auditorEmail);
}
