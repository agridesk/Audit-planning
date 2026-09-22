/**
 * FILE: AnnualAvailabilityCapacityDiagnostic.gs
 * BUILD: 2026-09-22_AMS03_AVAILABILITY_CAPACITY_DIAGNOSTIC_R1
 * PURPOSE:
 *   Read-only diagnostic to verify whether Auditor Availability can serve as
 *   the canonical operational source for annual capacity.
 *
 * 3S:
 * - Speed: single sheet read for diagnostic only; no per-auditor N+1 reads.
 * - Scalability: aggregates in memory by auditor/year.
 * - Stability: no writes; reports coverage before capacity logic is activated.
 */
var ANNUAL_AVAILABILITY_CAPACITY_DIAG_BUILD='2026-09-22_AMS03_AVAILABILITY_CAPACITY_DIAGNOSTIC_R1';

function RUN_AMS03_AVAILABILITY_CAPACITY_DIAGNOSTIC(){
  var year=new Date().getFullYear()+1,t0=Date.now(),ss=SpreadsheetApp.getActive();
  var out={success:false,build:ANNUAL_AVAILABILITY_CAPACITY_DIAG_BUILD,readOnly:true,writesPerformed:false,year:year,sheet:'',headers:{},counts:{rowsScanned:0,rowsInYear:0,auditors:0},auditors:[],gates:{},errors:[],serverMs:0};
  var sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
  if(!sh){out.errors.push('Missing sheet: Auditor Availability');out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;}
  out.sheet=sh.getName();
  var values=sh.getDataRange().getValues();out.counts.rowsScanned=Math.max(0,values.length-1);
  if(!values.length){out.errors.push('Availability sheet is empty');out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;}
  var h=values[0]||[],hm={};h.forEach(function(v,i){var k=String(v||'').trim().toLowerCase().replace(/\s+/g,'_');if(k)hm[k]=i;});
  function col(names){for(var i=0;i<names.length;i++){var k=String(names[i]||'').trim().toLowerCase().replace(/\s+/g,'_');if(Object.prototype.hasOwnProperty.call(hm,k))return hm[k];}return-1;}
  var cDate=col(['Date']),cAud=col(['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']),cAvail=col(['Available']),cS1=col(['First_Audit_Start_Time','First Audit Start Time']),cE1=col(['First_Audit_End_Time','First Audit End Time']),cID1=col(['Audit_ID_1','Audit ID 1','AuditId1']),cS2=col(['Second_Audit_Start_Time','Second Audit Start Time']),cE2=col(['Second_Audit_End_Time','Second Audit End Time']),cID2=col(['Audit_ID_2','Audit ID 2','AuditId2']),cSt1=col(['Status_1','Status 1','Status','Source']),cSt2=col(['Status_2','Status 2']);
  out.headers={date:cDate>=0,auditor:cAud>=0,available:cAvail>=0,start1:cS1>=0,end1:cE1>=0,auditId1:cID1>=0,start2:cS2>=0,end2:cE2>=0,auditId2:cID2>=0,status1:cSt1>=0,status2:cSt2>=0};
  if(cDate<0||cAud<0||cAvail<0){out.errors.push('Required Availability headers missing');out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;}
  var tz=ss.getSpreadsheetTimeZone(),byAud={};
  function dateKey(v){if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz,'yyyy-MM-dd');var s=String(v||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function mins(v){if(v==null||v==='')return null;if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return v.getHours()*60+v.getMinutes();var m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;var n=Number(m[1])*60+Number(m[2]);return isFinite(n)?n:null;}
  function yes(v){var s=String(v==null?'':v).trim().toUpperCase();return v===true||s==='YES'||s==='TRUE'||s==='1'||s==='Y'||s==='AVAILABLE'||s==='BESCHIKBAAR';}
  for(var r=1;r<values.length;r++){
    var row=values[r]||[],d=dateKey(row[cDate]);if(!d||d.slice(0,4)!==String(year))continue;
    var aud=String(row[cAud]||'').trim().toLowerCase();if(!aud)continue;out.counts.rowsInYear++;
    var a=byAud[aud]||(byAud[aud]={auditor:aud,rows:0,minDate:'',maxDate:'',availableYesRows:0,unavailableRows:0,firstAuditRows:0,secondAuditRows:0,scheduledMinutes:0,statuses:{}});
    a.rows++;if(!a.minDate||d<a.minDate)a.minDate=d;if(!a.maxDate||d>a.maxDate)a.maxDate=d;
    if(yes(row[cAvail]))a.availableYesRows++;else a.unavailableRows++;
    var s1=mins(cS1>=0?row[cS1]:''),e1=mins(cE1>=0?row[cE1]:'');if(cID1>=0&&String(row[cID1]||'').trim())a.firstAuditRows++;if(s1!=null&&e1!=null&&e1>s1)a.scheduledMinutes+=e1-s1;
    var s2=mins(cS2>=0?row[cS2]:''),e2=mins(cE2>=0?row[cE2]:'');if(cID2>=0&&String(row[cID2]||'').trim())a.secondAuditRows++;if(s2!=null&&e2!=null&&e2>s2)a.scheduledMinutes+=e2-s2;
    [cSt1,cSt2].forEach(function(ci){if(ci<0)return;var s=String(row[ci]||'').trim();if(s)a.statuses[s]=(a.statuses[s]||0)+1;});
  }
  out.auditors=Object.keys(byAud).sort().map(function(k){var a=byAud[k];a.scheduledHours=Math.round(a.scheduledMinutes/6)/10;delete a.scheduledMinutes;a.statuses=Object.keys(a.statuses).sort().map(function(s){return{status:s,count:a.statuses[s]};});return a;});
  out.counts.auditors=out.auditors.length;
  out.gates={requiredHeadersPresent:cDate>=0&&cAud>=0&&cAvail>=0,yearRowsPresent:out.counts.rowsInYear>0,auditorsPresent:out.counts.auditors>0,coverageDatesPresent:out.auditors.every(function(a){return!!a.minDate&&!!a.maxDate;}),readOnly:true,noWrites:true};
  out.success=out.errors.length===0;out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;
}
