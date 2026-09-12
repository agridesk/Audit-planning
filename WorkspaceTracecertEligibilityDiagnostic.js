/***********************************************************************
 * WorkspaceTracecertEligibilityDiagnostic.js
 * BUILD: 2026-09-12_WORKSPACE_TRACECERT_ELIGIBILITY_DIAG_R2_CACHE_PARSE
 * Read-only diagnostic for Florimark Tracecert -> Leen qualification path.
 ***********************************************************************/
var WORKSPACE_TRACECERT_ELIGIBILITY_DIAG_BUILD='2026-09-12_WORKSPACE_TRACECERT_ELIGIBILITY_DIAG_R2_CACHE_PARSE';
function WTED_clean_(v){return String(v==null?'':v).trim();}
function WTED_norm_(v){return WTED_clean_(v).toLowerCase();}
function WTED_find_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++)m[WTED_norm_(hdr[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=WTED_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function WTED_isYes_(v){var s=WTED_norm_(v);return s==='x'||s==='yes'||s==='true'||s==='1';}
function WTED_scopes_(hdr,row){try{var r=v5_extractScopesForAuditPlanningRow_(hdr||[],row||[])||{},a=Array.isArray(r.scopes)?r.scopes:[];return a.map(function(s){return WTED_clean_(s&&(s.name||s.code||s.slot));}).filter(function(x){return!!x;});}catch(e){return[];}}
function WTED_joinChunks_(row,cols){var out=[];for(var i=0;i<cols.length;i++){var c=cols[i];if(c>=0&&row[c]!=null&&row[c]!=='')out.push(String(row[c]));}return out.join('');}
function WTED_auditorNames_(raw){if(!raw)return[];try{var parsed=JSON.parse(raw),arr=[];if(Array.isArray(parsed))arr=parsed;else if(parsed&&Array.isArray(parsed.auditors))arr=parsed.auditors;return arr.map(function(x){return WTED_clean_(x&&(x.name||x.email));}).filter(function(x){return!!x;});}catch(e){return[];}}
function RUN_WORKSPACE_TRACECERT_ELIGIBILITY_DIAGNOSTIC(){
  var ss=SpreadsheetApp.getActive(),ap=ss.getSheetByName('Audit planning'),au=ss.getSheetByName('Auditors'),ec=ss.getSheetByName('Eligibility_Cache');
  if(!ap||!au)throw new Error('Required sheet missing');
  var av=ap.getDataRange().getValues(),ah=av[0]||[],cId=WTED_find_(ah,['Audit ID','Audit_ID','AuditId']),cCo=WTED_find_(ah,['Company']);
  var audits=[];for(var r=1;r<av.length;r++){var scopes=WTED_scopes_(ah,av[r]||[]),isTrace=scopes.some(function(s){var n=WTED_norm_(s);return n.indexOf('tracecert')>=0||n==='florimark_tf';});if(!isTrace)continue;audits.push({auditId:cId>=0?WTED_clean_(av[r][cId]):'',company:cCo>=0?WTED_clean_(av[r][cCo]):'',scopes:scopes,canonicalScopes:scopes.map(function(s){try{return _mp_scopeCanonicalForRotation_(ss,s)}catch(e){return s;}})});}
  var uv=au.getDataRange().getValues(),uh=uv[0]||[],cName=WTED_find_(uh,['Name','Auditor','Auditor name']),cMail=WTED_find_(uh,['E-mail','Email','E-mail address','Mail']),cAct=WTED_find_(uh,['Active','Is active']),cRole=WTED_find_(uh,['Role','Function']),leen=null;
  for(var i=1;i<uv.length;i++){var nm=cName>=0?WTED_clean_(uv[i][cName]):'',em=cMail>=0?WTED_clean_(uv[i][cMail]):'';if(WTED_norm_(nm).indexOf('leen klaassen')>=0||WTED_norm_(em).indexOf('leen')>=0){leen={row:i+1,name:nm,email:em,active:cAct>=0?WTED_clean_(uv[i][cAct]):'',role:cRole>=0?WTED_clean_(uv[i][cRole]):'',qualification:[]};var req={};audits.forEach(function(a){a.canonicalScopes.forEach(function(s){req[s]=1;});});Object.keys(req).forEach(function(sc){var found=-1,rawHeader='';for(var h=0;h<uh.length;h++){var canon='';try{canon=_mp_scopeCanonicalForRotation_(ss,uh[h]);}catch(e){canon=WTED_clean_(uh[h]);}if(canon===sc){found=h;rawHeader=WTED_clean_(uh[h]);break;}}leen.qualification.push({scope:sc,column:found>=0?found+1:0,header:rawHeader,value:found>=0?WTED_clean_(uv[i][found]):'',qualified:found>=0&&WTED_isYes_(uv[i][found])});});break;}}
  var cache=[];if(ec&&audits.length){var ev=ec.getDataRange().getValues(),eh=ev[0]||[],eId=WTED_find_(eh,['Audit_ID','Audit ID']),eA1=WTED_find_(eh,['Eligible_Auditors_JSON']),eA2=WTED_find_(eh,['Eligible_Auditors_JSON_2']),eA3=WTED_find_(eh,['Eligible_Auditors_JSON_3']),eA4=WTED_find_(eh,['Eligible_Auditors_JSON_4']),eStale=WTED_find_(eh,['Stale']),eBuild=WTED_find_(eh,['Computed_Build']);var wanted={};audits.forEach(function(a){wanted[a.auditId]=1;});for(var er=1;er<ev.length;er++){var id=eId>=0?WTED_clean_(ev[er][eId]):'';if(!wanted[id])continue;var raw=WTED_joinChunks_(ev[er],[eA1,eA2,eA3,eA4]);cache.push({auditId:id,stale:eStale>=0?WTED_clean_(ev[er][eStale]):'',computedBuild:eBuild>=0?WTED_clean_(ev[er][eBuild]):'',eligibleAuditors:WTED_auditorNames_(raw)});}}
  var out={ok:true,build:WORKSPACE_TRACECERT_ELIGIBILITY_DIAG_BUILD,audits:audits,leen:leen,eligibilityCache:cache,meta:{readOnly:true,writes:false,auditCount:audits.length,chunkAwareCacheParse:true}};
  console.log(JSON.stringify(out,null,2));return out;
}
