/**
 * FILE: zz_AMS01_AuditorAvailabilitySummaryPerfOverride.js
 * BUILD: AMS01_AUDITOR_AVAIL_SUMMARY_PERF_ZZ_20260909_R2
 * DEV late-load performance override for Auditor Portal fallback summary.
 *
 * Keeps Auditor Availability as canonical truth and preserves the existing
 * auditId -> {days, mins} summary contract. Replaces a full-width sheet read
 * with one contiguous read spanning only the columns needed for summary data.
 * Spreadsheet timezone is resolved once per execution instead of once per row.
 * No status/planning/availability writes and no UI/render-owner changes.
 */
var AMS01_AUDITOR_AVAIL_SUMMARY_PERF_ZZ_BUILD='AMS01_AUDITOR_AVAIL_SUMMARY_PERF_ZZ_20260909_R2';
var AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE=null;

function auditorV5_buildAvailabilitySummaryMap_(){
  if(AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE) return AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE;

  var t0=Date.now();
  var ss=auditorV5_getSs_();
  var sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
  if(!sh){ AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE={}; return AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE; }

  var lastRow=sh.getLastRow();
  var lastCol=sh.getLastColumn();
  if(lastRow<2||lastCol<1){ AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE={}; return AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE; }

  var tz='Europe/Amsterdam';
  try{
    if(typeof auditorV5_getTz_==='function') tz=String(auditorV5_getTz_()||tz).trim()||tz;
    else tz=String(ss.getSpreadsheetTimeZone()||tz).trim()||tz;
  }catch(eTz){}

  var hdr=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
  function hk_(v){return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,'_');}
  function find_(names){
    var map={};
    for(var i=0;i<hdr.length;i++){var k=hk_(hdr[i]); if(k&&map[k]===undefined) map[k]=i;}
    for(var j=0;j<names.length;j++){var n=hk_(names[j]); if(map[n]!==undefined) return map[n];}
    return -1;
  }
  function clean_(v){return String(v==null?'':v).trim();}
  function date_(v){
    if(!v) return '';
    if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())) return Utilities.formatDate(v,tz,'yyyy-MM-dd');
    var s=clean_(v); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
  }
  function mins_(v){
    if(v==null||v==='') return null;
    if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())) return v.getHours()*60+v.getMinutes();
    var m=clean_(v).match(/^(\d{1,2}):(\d{2})$/); if(!m) return null;
    var hh=Number(m[1]),mm=Number(m[2]); return isFinite(hh)&&isFinite(mm)?hh*60+mm:null;
  }

  var iDate=find_(['Date']);
  var iID1=find_(['Audit_ID_1','Audit ID 1','AuditId1']);
  var iS1=find_(['First_Audit_Start_Time','First Audit Start Time']);
  var iE1=find_(['First_Audit_End_Time','First Audit End Time']);
  var iID2=find_(['Audit_ID_2','Audit ID 2','AuditId2']);
  var iS2=find_(['Second_Audit_Start_Time','Second Audit Start Time']);
  var iE2=find_(['Second_Audit_End_Time','Second Audit End Time']);
  var needed=[iDate,iID1,iS1,iE1,iID2,iS2,iE2].filter(function(x){return x>=0;});
  if(iDate<0||(!(iID1>=0||iID2>=0))||!needed.length){
    AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE={};
    return AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE;
  }

  var minIdx=Math.min.apply(null,needed), maxIdx=Math.max.apply(null,needed);
  var width=maxIdx-minIdx+1;
  var vals=sh.getRange(2,minIdx+1,lastRow-1,width).getValues();
  function at_(row,idx){return idx>=0?row[idx-minIdx]:'';}
  var out={};
  function ensure_(id){id=clean_(id); if(!id) return null; if(!out[id]) out[id]={days:{},mins:0}; return out[id];}
  function add_(rec,rawDate,rawStart,rawEnd){
    if(!rec) return;
    var d=date_(rawDate); if(d) rec.days[d]=true;
    var s=mins_(rawStart),e=mins_(rawEnd); if(isFinite(s)&&isFinite(e)&&e>s) rec.mins+=(e-s);
  }
  for(var r=0;r<vals.length;r++){
    var row=vals[r]||[];
    if(iID1>=0) add_(ensure_(at_(row,iID1)),at_(row,iDate),at_(row,iS1),at_(row,iE1));
    if(iID2>=0) add_(ensure_(at_(row,iID2)),at_(row,iDate),at_(row,iS2),at_(row,iE2));
  }

  AMS01_AUDITOR_AVAIL_SUMMARY_EXEC_CACHE=out;
  try{Logger.log('[AMS01_AUDITOR_AVAIL_SUMMARY] '+JSON.stringify({build:AMS01_AUDITOR_AVAIL_SUMMARY_PERF_ZZ_BUILD,rows:lastRow-1,sourceColumns:lastCol,readStartColumn:minIdx+1,readWidth:width,mapSize:Object.keys(out).length,wallMs:Date.now()-t0}));}catch(eLog){}
  return out;
}

function AMS01_AuditorAvailabilitySummaryPerfStatus(){
  return {success:true,active:true,build:AMS01_AUDITOR_AVAIL_SUMMARY_PERF_ZZ_BUILD};
}
