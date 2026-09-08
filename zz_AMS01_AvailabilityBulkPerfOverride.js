/**
 * FILE: zz_AMS01_AvailabilityBulkPerfOverride.js
 * BUILD: AMS01_AVAILABILITY_BULK_PERF_ZZ_20260908_R2
 * DEV-only late-load performance override.
 *
 * Replaces only AvailabilityService.getAuditorAvailabilityLite.
 * Canonical Auditor Availability sheet remains truth.
 * Index strategy: one contiguous Date+Auditor read, then in-memory filter.
 * R2 preserves canonical interval/day metadata contract while retaining bulk scan.
 */
var AMS01_AVAILABILITY_BULK_PERF_ZZ_BUILD='AMS01_AVAILABILITY_BULK_PERF_ZZ_20260908_R2';

(function(){
  if (typeof AvailabilityService === 'undefined' || !AvailabilityService) return;

  function clean_(v){
    return String(v == null ? '' : v)
      .replace(/\u00A0/g,' ')
      .replace(/[\u200B-\u200D\uFEFF]/g,'')
      .trim();
  }
  function email_(v){ return clean_(v).toLowerCase(); }
  function hk_(v){ return clean_(v).toLowerCase().replace(/\s+/g,'_'); }
  function find_(headers,names){
    var map={};
    for(var i=0;i<headers.length;i++){
      var k=hk_(headers[i]);
      if(k && map[k]===undefined) map[k]=i;
    }
    for(var j=0;j<names.length;j++){
      var n=hk_(names[j]);
      if(map[n]!==undefined) return map[n];
    }
    return -1;
  }
  function normDate_(v,tz){
    if(!v) return '';
    if(Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v,tz,'yyyy-MM-dd');
    }
    var s=clean_(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
  }
  function mins_(v){
    if(v==null || v==='') return null;
    if(Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())) return v.getHours()*60+v.getMinutes();
    var m=clean_(v).match(/^(\d{1,2}):(\d{2})$/);
    if(!m) return null;
    var hh=Number(m[1]), mm=Number(m[2]);
    if(!isFinite(hh)||!isFinite(mm)||hh<0||hh>23||mm<0||mm>59) return null;
    return hh*60+mm;
  }
  function hhmm_(m){
    m=Number(m);
    if(!isFinite(m)) return '';
    return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
  }
  function soft_(s){
    s=clean_(s).toUpperCase();
    return s==='MANUAL_AUDITOR_BLOCKED_SOFT'||s==='USER_MANUAL'||s==='MANUAL_SOFT'||s==='MANUAL_UNAVAILABLE_SOFT'||
      s==='DEFAULT_AUDITOR_BLOCKED_SOFT'||s==='DEFAULT_WEEKEND_SOFT'||s==='SYSTEM_DEFAULT'||s==='CALENDAR'||s==='CALENDER';
  }
  function avail_(v){
    if(v===false) return 'NO';
    if(v===true) return 'YES';
    var s=clean_(v).toUpperCase();
    if(!s) return '';
    if(s==='FALSE'||s==='NO'||s==='N'||s==='0'||s==='UNAVAILABLE'||s==='NOT AVAILABLE'||s==='NIET BESCHIKBAAR') return 'NO';
    if(s==='TRUE'||s==='YES'||s==='Y'||s==='1'||s==='AVAILABLE'||s==='BESCHIKBAAR') return 'YES';
    return s;
  }
  function blocks_(rows){
    var out=[];
    if(!rows.length) return out;
    rows=rows.slice().sort(function(a,b){return a-b;});
    var start=rows[0], prev=rows[0];
    for(var i=1;i<rows.length;i++){
      var n=rows[i];
      if(n===prev+1){ prev=n; continue; }
      out.push({start:start,count:prev-start+1});
      start=n; prev=n;
    }
    out.push({start:start,count:prev-start+1});
    return out;
  }
  function ensureDay_(days,dateISO,availableCell){
    if(!days[dateISO]){
      days[dateISO]={intervals:[],meta:{availableCell:availableCell||'',plannedAuditIds:[]}};
    }else{
      days[dateISO].meta=days[dateISO].meta||{};
      days[dateISO].meta.availableCell=availableCell||'';
      if(!Array.isArray(days[dateISO].meta.plannedAuditIds)) days[dateISO].meta.plannedAuditIds=[];
    }
    return days[dateISO];
  }

  AvailabilityService.getAuditorAvailabilityLite=function(auditorEmail,rangeStartISO,rangeEndISO,opts){
    opts=opts||{};
    var t0=Date.now(), tPack0=0, tRows0=0, tBuild0=0;
    var ss=SpreadsheetApp.getActive();
    var sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
    if(!sh) throw new Error("Missing sheet 'Auditor Availability'");
    var tz=ss.getSpreadsheetTimeZone();
    var lastCol=sh.getLastColumn();
    var headers=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
    var cm={
      iDate:find_(headers,['Date']),
      iAud:find_(headers,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']),
      iAvail:find_(headers,['Available']),
      iS1:find_(headers,['First_Audit_Start_Time','First Audit Start Time']),
      iE1:find_(headers,['First_Audit_End_Time','First Audit End Time']),
      iID1:find_(headers,['Audit_ID_1','Audit ID 1','AuditId1']),
      iS2:find_(headers,['Second_Audit_Start_Time','Second Audit Start Time']),
      iE2:find_(headers,['Second_Audit_End_Time','Second Audit End Time']),
      iID2:find_(headers,['Audit_ID_2','Audit ID 2','AuditId2']),
      iSt1:find_(headers,['Status_1','Status 1','Status','Source']),
      iSt2:find_(headers,['Status_2','Status 2'])
    };
    if(cm.iDate<0||cm.iAud<0||cm.iAvail<0) throw new Error('Auditor Availability headers missing');

    var auditorKey=email_(auditorEmail);
    var rangeStart=clean_(rangeStartISO), rangeEnd=clean_(rangeEndISO);
    if(!auditorKey) throw new Error('getAuditorAvailabilityLite: missing auditor email');
    if(!rangeStart||!rangeEnd) throw new Error('getAuditorAvailabilityLite: missing range');
    var days={};

    tPack0=Date.now();
    var lastRow=sh.getLastRow();
    var rowNumbers=[];
    if(lastRow>=2){
      var minCol=Math.min(cm.iDate,cm.iAud)+1;
      var maxCol=Math.max(cm.iDate,cm.iAud)+1;
      var width=maxCol-minCol+1;
      var ixDate=(cm.iDate+1)-minCol;
      var ixAud=(cm.iAud+1)-minCol;
      var idxVals=sh.getRange(2,minCol,lastRow-1,width).getValues();
      for(var r=0;r<idxVals.length;r++){
        if(email_(idxVals[r][ixAud])!==auditorKey) continue;
        var iso=normDate_(idxVals[r][ixDate],tz);
        if(!iso||iso<rangeStart||iso>rangeEnd) continue;
        rowNumbers.push(r+2);
      }
    }
    var packMs=Date.now()-tPack0;

    if(!rowNumbers.length){
      return {success:true,auditorKey:auditorKey,rangeStart:rangeStart,rangeEnd:rangeEnd,days:days,meta:{version:AMS01_AVAILABILITY_BULK_PERF_ZZ_BUILD,serverMs:Date.now()-t0,lite:true,optimized:true,rowsMatched:0,timing:{packMs:packMs,rowReadMs:0,buildMs:0},indexStrategy:'BULK_DATE_AUDITOR'}};
    }

    tRows0=Date.now();
    rowNumbers.sort(function(a,b){return a-b;});
    var rowByNumber={}, readBlocks=[];
    if(rowNumbers.length===1){
      rowByNumber[rowNumbers[0]]=sh.getRange(rowNumbers[0],1,1,lastCol).getValues()[0]||[];
      readBlocks=[{start:rowNumbers[0],count:1}];
    }else{
      var minR=rowNumbers[0], maxR=rowNumbers[rowNumbers.length-1], span=maxR-minR+1;
      var maxSpan=Math.max(rowNumbers.length*30,800);
      if(span<=maxSpan && span<=5000){
        var spanVals=sh.getRange(minR,1,span,lastCol).getValues();
        var set={};
        for(var x=0;x<rowNumbers.length;x++) set[rowNumbers[x]]=true;
        for(var k=0;k<span;k++){
          var actual=minR+k;
          if(set[actual]) rowByNumber[actual]=spanVals[k]||[];
        }
        readBlocks=[{start:minR,count:span}];
      }else{
        readBlocks=blocks_(rowNumbers);
        for(var b=0;b<readBlocks.length;b++){
          var bl=readBlocks[b];
          var vals=sh.getRange(bl.start,1,bl.count,lastCol).getValues();
          for(var q=0;q<vals.length;q++) rowByNumber[bl.start+q]=vals[q]||[];
        }
      }
    }
    var rowReadMs=Date.now()-tRows0;

    tBuild0=Date.now();
    for(var i=0;i<rowNumbers.length;i++){
      var rn=rowNumbers[i], row=rowByNumber[rn]||[];
      if(email_(row[cm.iAud])!==auditorKey) continue;
      var dateISO=normDate_(row[cm.iDate],tz);
      if(!dateISO||dateISO<rangeStart||dateISO>rangeEnd) continue;

      var info={
        avail:avail_(row[cm.iAvail]),
        s1:cm.iS1>=0?mins_(row[cm.iS1]):null,
        e1:cm.iE1>=0?mins_(row[cm.iE1]):null,
        id1:cm.iID1>=0?clean_(row[cm.iID1]):'',
        s2:cm.iS2>=0?mins_(row[cm.iS2]):null,
        e2:cm.iE2>=0?mins_(row[cm.iE2]):null,
        id2:cm.iID2>=0?clean_(row[cm.iID2]):'',
        st1:cm.iSt1>=0?clean_(row[cm.iSt1]):'',
        st2:cm.iSt2>=0?clean_(row[cm.iSt2]):''
      };

      var slot1Start=isFinite(info.s1)?hhmm_(info.s1):'09:00';
      var slot1End=isFinite(info.e1)?hhmm_(info.e1):'17:00';
      var slot2Start=isFinite(info.s2)?hhmm_(info.s2):'09:00';
      var slot2End=isFinite(info.e2)?hhmm_(info.e2):'17:00';
      var day=ensureDay_(days,dateISO,info.avail);

      if(info.id1){
        if(!day.meta.auditId1) day.meta.auditId1=info.id1;
        if(!day.meta.slot1Start) day.meta.slot1Start=slot1Start;
        if(!day.meta.slot1End) day.meta.slot1End=slot1End;
        if(!day.meta.status1) day.meta.status1=info.st1;
        if(day.meta.plannedAuditIds.indexOf(info.id1)<0) day.meta.plannedAuditIds.push(info.id1);
      }
      if(info.id2){
        if(!day.meta.auditId2) day.meta.auditId2=info.id2;
        if(!day.meta.slot2Start) day.meta.slot2Start=slot2Start;
        if(!day.meta.slot2End) day.meta.slot2End=slot2End;
        if(!day.meta.status2) day.meta.status2=info.st2;
        if(day.meta.plannedAuditIds.indexOf(info.id2)<0) day.meta.plannedAuditIds.push(info.id2);
      }

      if(info.avail==='NO'&&!info.id1&&!info.id2){
        var st1=clean_(info.st1).toUpperCase(), st2=clean_(info.st2).toUpperCase();
        var isSoft=soft_(st1)||soft_(st2);
        day.meta.softFullDay=!!isSoft;
        day.intervals.push({
          startTime:isFinite(info.s1)?hhmm_(info.s1):'08:00',
          endTime:isFinite(info.e1)?hhmm_(info.e1):'18:00',
          reason:isSoft?(info.st1||info.st2||'Soft unavailable'):'Available=NO',
          state:'BLOCKED',
          kind:isSoft?'soft':'hard',
          hard:!isSoft,
          auditId:'',
          slot:''
        });
        continue;
      }

      if(info.id1){
        day.intervals.push({
          startTime:slot1Start,
          endTime:slot1End,
          reason:'Occupied (Audit_ID_1='+info.id1+')',
          state:'BLOCKED',
          kind:'hard',
          hard:true,
          auditId:info.id1,
          slot:'S1'
        });
      }
      if(info.id2){
        day.intervals.push({
          startTime:slot2Start,
          endTime:slot2End,
          reason:'Occupied (Audit_ID_2='+info.id2+')',
          state:'BLOCKED',
          kind:'hard',
          hard:true,
          auditId:info.id2,
          slot:'S2'
        });
      }
    }

    Object.keys(days).forEach(function(d){
      var day=days[d];
      if(!day.meta) day.meta={};
      if(!Array.isArray(day.meta.plannedAuditIds)) day.meta.plannedAuditIds=[];
      if(day.meta.auditId1===undefined) day.meta.auditId1='';
      if(day.meta.auditId2===undefined) day.meta.auditId2='';
      if(day.meta.slot1Start===undefined) day.meta.slot1Start='';
      if(day.meta.slot1End===undefined) day.meta.slot1End='';
      if(day.meta.slot2Start===undefined) day.meta.slot2Start='';
      if(day.meta.slot2End===undefined) day.meta.slot2End='';
      if(day.meta.status1===undefined) day.meta.status1='';
      if(day.meta.status2===undefined) day.meta.status2='';
      if(day.meta.softFullDay===undefined) day.meta.softFullDay=false;
      if(!day.intervals||!day.intervals.length) delete days[d];
    });

    var buildMs=Date.now()-tBuild0;
    return {success:true,auditorKey:auditorKey,rangeStart:rangeStart,rangeEnd:rangeEnd,days:days,meta:{version:AMS01_AVAILABILITY_BULK_PERF_ZZ_BUILD,serverMs:Date.now()-t0,lite:true,optimized:true,rowsMatched:rowNumbers.length,rowBlocksRead:readBlocks.length,timing:{packMs:packMs,rowReadMs:rowReadMs,buildMs:buildMs},indexStrategy:'BULK_DATE_AUDITOR'}};
  };
})();

function AMS01_AvailabilityBulkPerfStatus(){
  return {success:true,active:typeof AvailabilityService!=='undefined'&&AvailabilityService&&typeof AvailabilityService.getAuditorAvailabilityLite==='function',build:AMS01_AVAILABILITY_BULK_PERF_ZZ_BUILD};
}
