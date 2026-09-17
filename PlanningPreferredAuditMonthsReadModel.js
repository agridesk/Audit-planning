/***********************************************************************
 * PlanningPreferredAuditMonthsReadModel.js
 * BUILD: 2026-09-17_PREFERRED_AUDIT_MONTHS_READ_MODEL_R1
 *
 * Read-only Companies projection for Planning Workspace advisory.
 * Companies remains canonical owner. No new SSoT, no writes.
 ***********************************************************************/
var PPAM_BUILD='2026-09-17_PREFERRED_AUDIT_MONTHS_READ_MODEL_R1';
function PPAM_clean_(v){return String(v==null?'':v).trim();}
function PPAM_norm_(v){return PPAM_clean_(v).toLowerCase().replace(/\s+/g,' ');}
function PPAM_col_(h,names){var m={};for(var i=0;i<(h||[]).length;i++)m[PPAM_norm_(h[i])]=i;for(var j=0;j<(names||[]).length;j++){var k=PPAM_norm_(names[j]);if(Object.prototype.hasOwnProperty.call(m,k))return m[k];}return-1;}
function PPAM_months_(v){var map={jan:'Jan',january:'Jan',feb:'Feb',february:'Feb',mar:'Mar',march:'Mar',apr:'Apr',april:'Apr',may:'May',jun:'Jun',june:'Jun',jul:'Jul',july:'Jul',aug:'Aug',august:'Aug',sep:'Sep',sept:'Sep',september:'Sep',oct:'Oct',october:'Oct',nov:'Nov',november:'Nov',dec:'Dec',december:'Dec'},seen={},out=[];String(v==null?'':v).split(/[,;|\s]+/).forEach(function(x){var k=PPAM_norm_(x),m=map[k];if(m&&!seen[m]){seen[m]=true;out.push(m);}});return out;}
function PlanningPreferredAuditMonthsReadModel_get(input){
  input=input||{};var requested={},ids=Array.isArray(input.companyUids)?input.companyUids:[],names=Array.isArray(input.companyNames)?input.companyNames:[];
  ids.forEach(function(x){x=PPAM_clean_(x);if(x)requested['UID::'+x]=true;});names.forEach(function(x){x=PPAM_norm_(x);if(x)requested['NAME::'+x]=true;});
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Companies'),out={success:true,build:PPAM_BUILD,byKey:{},rowsRead:0,matched:0,meta:{source:'Companies',writes:false,newSsot:false,batchRead:true}};
  if(!sh||sh.getLastRow()<2||!Object.keys(requested).length)return out;
  var lc=sh.getLastColumn(),h=sh.getRange(1,1,1,lc).getValues()[0]||[],iu=PPAM_col_(h,['Company_UID','Company UID','CompanyUID','UID']),inm=PPAM_col_(h,['Company','Company name','Name','Bedrijf']),ip=PPAM_col_(h,['Preferred audit months','Preferred Audit Months','Preferred_audit_months','PreferredAuditMonths']);
  if(inm<0||ip<0){out.meta.preferredMonthsColumnFound=ip>=0;return out;}
  var used=[iu,inm,ip].filter(function(x){return x>=0;}),mn=Math.min.apply(null,used),mx=Math.max.apply(null,used),v=sh.getRange(2,mn+1,sh.getLastRow()-1,mx-mn+1).getValues();out.rowsRead=v.length;function rel(x){return x<0?-1:x-mn;}var ru=rel(iu),rn=rel(inm),rp=rel(ip),seen={};
  for(var r=0;r<v.length;r++){var row=v[r]||[],uid=ru>=0?PPAM_clean_(row[ru]):'',name=PPAM_clean_(row[rn]),uk=uid?'UID::'+uid:'',nk=name?'NAME::'+PPAM_norm_(name):'';if(!(uk&&requested[uk])&&!(nk&&requested[nk]))continue;var p={companyUid:uid,companyName:name,preferredAuditMonths:PPAM_months_(row[rp])};if(uk)out.byKey[uk]=p;if(nk)out.byKey[nk]=p;var sk=uk||nk;if(sk&&!seen[sk]){seen[sk]=true;out.matched++;}}
  out.meta.preferredMonthsColumnFound=true;return out;
}
function PlanningPreferredAuditMonthsReadModel_forDemand(rows){var ids=[],names=[],seenI={},seenN={};(rows||[]).forEach(function(r){var u=PPAM_clean_(r&&r.companyUid),n=PPAM_clean_(r&&r.company);if(u&&!seenI[u]){seenI[u]=true;ids.push(u);}if(n&&!seenN[PPAM_norm_(n)]){seenN[PPAM_norm_(n)]=true;names.push(n);}});return PlanningPreferredAuditMonthsReadModel_get({companyUids:ids,companyNames:names});}
function PlanningPreferredAuditMonthsReadModel_lookup(model,row){model=model||{};row=row||{};var u=PPAM_clean_(row.companyUid),n=PPAM_norm_(row.company),x=(u&&model.byKey&&model.byKey['UID::'+u])||(n&&model.byKey&&model.byKey['NAME::'+n])||null;return x&&Array.isArray(x.preferredAuditMonths)?x.preferredAuditMonths.slice():[];}
