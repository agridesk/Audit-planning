/***********************************************************************
 * AvailabilityServiceReleaseReconciler.js
 * BUILD: 2026-09-14_AVAILABILITY_RELEASE_RECONCILER_R1
 *
 * Targeted repair helper for canonical release flows.
 * Repairs only legacy anonymous NO rows on the OLD canonical planning dates:
 * - same auditor + old date;
 * - Available = NO;
 * - no Audit_ID_1 / Audit_ID_2;
 * - no start/end times;
 * - no Status_1 / Status_2.
 *
 * Any explicit/manual/default block or any remaining audit is preserved.
 * No full-sheet scan: TextFinder narrows to one auditor, then only old dates.
 ***********************************************************************/
var AVAILABILITY_RELEASE_RECONCILER_BUILD='2026-09-14_AVAILABILITY_RELEASE_RECONCILER_R1';
function ASRR_clean_(v){return String(v==null?'':v).trim();}
function ASRR_normEmail_(v){return ASRR_clean_(v).toLowerCase();}
function ASRR_date_(v){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){var ss=SpreadsheetApp.getActive();return Utilities.formatDate(v,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');}var s=ASRR_clean_(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function ASRR_hdr_(v){return ASRR_clean_(v).toLowerCase().replace(/\s+/g,'_');}
function ASRR_col_(headers,names){var map={};for(var i=0;i<headers.length;i++){var k=ASRR_hdr_(headers[i]);if(k&&map[k]===undefined)map[k]=i;}for(var j=0;j<names.length;j++){var x=ASRR_hdr_(names[j]);if(map[x]!==undefined)return map[x];}return-1;}
function AvailabilityServiceReleaseReconciler_reconcile(input){
  input=input||{};
  var email=ASRR_normEmail_(input.auditorEmail),blocks=Array.isArray(input.blocks)?input.blocks:[],wanted={};
  blocks.forEach(function(b){var d=ASRR_date_(b&&b.date);if(d)wanted[d]=1;});
  var dates=Object.keys(wanted).sort();
  if(!email||!dates.length)return{success:true,build:AVAILABILITY_RELEASE_RECONCILER_BUILD,repaired:0,checked:0,skipped:true,reason:'NO_CONTEXT'};
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
  if(!sh)return{success:false,build:AVAILABILITY_RELEASE_RECONCILER_BUILD,repaired:0,checked:0,reason:'AVAILABILITY_SHEET_MISSING'};
  var lastCol=sh.getLastColumn(),headers=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
  var cDate=ASRR_col_(headers,['Date']),cAud=ASRR_col_(headers,['Auditor_Email','Auditor Email','Email']),cAvail=ASRR_col_(headers,['Available']),cS1=ASRR_col_(headers,['First_Audit_Start_Time']),cE1=ASRR_col_(headers,['First_Audit_End_Time']),cId1=ASRR_col_(headers,['Audit_ID_1']),cS2=ASRR_col_(headers,['Second_Audit_Start_Time']),cE2=ASRR_col_(headers,['Second_Audit_End_Time']),cId2=ASRR_col_(headers,['Audit_ID_2']),cSt1=ASRR_col_(headers,['Status_1']),cSt2=ASRR_col_(headers,['Status_2']),cUpd=ASRR_col_(headers,['Last_Updated']);
  if(cDate<0||cAud<0||cAvail<0)return{success:false,build:AVAILABILITY_RELEASE_RECONCILER_BUILD,repaired:0,checked:0,reason:'REQUIRED_COLUMNS_MISSING'};
  var finder=sh.createTextFinder(email).matchEntireCell(true).matchCase(false),matches=finder.findAll()||[],rows=[],seen={};
  for(var i=0;i<matches.length;i++){if(matches[i].getColumn()!==cAud+1)continue;var rn=matches[i].getRow();if(rn<2||seen[rn])continue;seen[rn]=1;rows.push(rn);}
  var repaired=0,checked=0,now=Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd HH:mm'),months={};
  for(var r=0;r<rows.length;r++){
    var rn=rows[r],row=sh.getRange(rn,1,1,lastCol).getValues()[0]||[],date=ASRR_date_(row[cDate]);
    if(!wanted[date])continue;checked++;
    var avail=ASRR_clean_(row[cAvail]).toUpperCase(),id1=cId1>=0?ASRR_clean_(row[cId1]):'',id2=cId2>=0?ASRR_clean_(row[cId2]):'',st1=cSt1>=0?ASRR_clean_(row[cSt1]):'',st2=cSt2>=0?ASRR_clean_(row[cSt2]):'',s1=cS1>=0?ASRR_clean_(row[cS1]):'',e1=cE1>=0?ASRR_clean_(row[cE1]):'',s2=cS2>=0?ASRR_clean_(row[cS2]):'',e2=cE2>=0?ASRR_clean_(row[cE2]):'';
    if(avail!=='NO'||id1||id2||st1||st2||s1||e1||s2||e2)continue;
    row[cAvail]='YES';if(cUpd>=0)row[cUpd]=now;sh.getRange(rn,1,1,lastCol).setValues([row]);repaired++;months[date.slice(0,7)]=1;
  }
  if(repaired){SpreadsheetApp.flush();try{if(typeof AvailabilityService!=='undefined'&&AvailabilityService&&typeof AvailabilityService.resetExecCache==='function')AvailabilityService.resetExecCache();}catch(e1){}try{if(typeof AS_clearAvailabilitySummaryMapCache_==='function')AS_clearAvailabilitySummaryMapCache_();}catch(e2){}Object.keys(months).forEach(function(m){try{if(typeof TDM_invalidateAvailabilityMonthCache==='function')TDM_invalidateAvailabilityMonthCache(email,m,{reason:'release-reconcile'});}catch(e3){}});}
  return{success:true,build:AVAILABILITY_RELEASE_RECONCILER_BUILD,repaired:repaired,checked:checked,auditorEmail:email,dates:dates,meta:{targeted:true,anonymousNoOnly:true,preservesExplicitBlocks:true,newSsot:false}};
}
