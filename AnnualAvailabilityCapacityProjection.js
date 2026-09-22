/**
 * FILE: AnnualAvailabilityCapacityProjection.gs
 * BUILD: 2026-09-22_AMS03_AVAILABILITY_CAPACITY_PROJECTION_R2_WEEKDAY_CODES
 * PURPOSE:
 *   Read-only annual capacity projection using Auditor Availability semantics.
 *
 * Ownership / 3S:
 * - Primary operational source: Auditor Availability.
 * - Recurring default blocked weekdays: Auditors via PlanningProfilesService.
 * - No new persistence owner and no writes.
 * - One Availability sheet read + one bounded Auditor profile read.
 * - Missing Availability rows mean no explicit exception; standard working-day
 *   capacity is derived from the existing 08:00-18:00 full-day convention.
 * - Weekends and configured default blocked weekdays are excluded from standard
 *   capacity, but reported separately as soft/overrideable capacity.
 */
var ANNUAL_AVAILABILITY_CAPACITY_BUILD='2026-09-22_AMS03_AVAILABILITY_CAPACITY_PROJECTION_R2_WEEKDAY_CODES';
var ANNUAL_AVAILABILITY_DAY_START_MIN=8*60;
var ANNUAL_AVAILABILITY_DAY_END_MIN=18*60;

function getAnnualAvailabilityCapacityV5(payload){
  payload=payload||{};
  var year=Number(payload.year||new Date().getFullYear());
  if(!isFinite(year)||year<2000||year>3000)year=new Date().getFullYear();
  return AnnualAvailabilityCapacity_build_(SpreadsheetApp.getActive(),year);
}

function AnnualAvailabilityCapacity_build_(ss,year){
  ss=ss||SpreadsheetApp.getActive();year=Number(year);
  var t0=Date.now(),out={success:false,build:ANNUAL_AVAILABILITY_CAPACITY_BUILD,readOnly:true,writesPerformed:false,year:year,source:{availability:'Auditor Availability',auditorDefaults:'Auditors',dayWindow:'08:00-18:00'},auditors:[],summary:{},diagnostics:{},warnings:[],errors:[],serverMs:0};
  var sh=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
  if(!sh){out.errors.push('Missing sheet: Auditor Availability');out.serverMs=Date.now()-t0;return out;}

  var profiles=PlanningProfilesService_get({includeCompanies:false});
  if(!profiles||profiles.success!==true){out.errors.push('PlanningProfilesService failed');out.serverMs=Date.now()-t0;return out;}
  var roster={};
  (profiles.auditors||[]).forEach(function(a){
    var active=String(a.active||'').trim().toLowerCase(),role=String(a.role||'').trim().toLowerCase();
    if(!(active==='yes'||active==='true'||active==='1'||active==='x')||role!=='auditor')return;
    var email=String(a.email||'').trim().toLowerCase();if(!email)return;
    roster[email]={auditorEmail:email,auditorName:String(a.name||email),blockedWeekdaysRaw:String(a.blockedWeekdays||''),blockedWeekdays:AnnualAvailabilityCapacity_parseBlockedWeekdays_(a.blockedWeekdays),standardDays:0,standardGrossHours:0,hardUnavailableHours:0,softUnavailableHours:0,occupiedAuditHours:0,availableHours:0,overrideableSoftHours:0,explicitRows:0};
  });

  var vals=sh.getDataRange().getValues();
  if(!vals.length){out.errors.push('Availability sheet empty');out.serverMs=Date.now()-t0;return out;}
  var h=vals[0]||[],hm={};h.forEach(function(v,i){var k=AnnualAvailabilityCapacity_key_(v);if(k)hm[k]=i;});
  function col(names){for(var i=0;i<names.length;i++){var k=AnnualAvailabilityCapacity_key_(names[i]);if(Object.prototype.hasOwnProperty.call(hm,k))return hm[k];}return-1;}
  var cDate=col(['Date']),cAud=col(['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']),cAvail=col(['Available']),cS1=col(['First_Audit_Start_Time','First Audit Start Time']),cE1=col(['First_Audit_End_Time','First Audit End Time']),cID1=col(['Audit_ID_1','Audit ID 1','AuditId1']),cS2=col(['Second_Audit_Start_Time','Second Audit Start Time']),cE2=col(['Second_Audit_End_Time','Second Audit End Time']),cID2=col(['Audit_ID_2','Audit ID 2','AuditId2']),cSt1=col(['Status_1','Status 1','Status','Source']),cSt2=col(['Status_2','Status 2']);
  if(cDate<0||cAud<0||cAvail<0){out.errors.push('Required Availability headers missing');out.serverMs=Date.now()-t0;return out;}

  var byAudDate={},tz=ss.getSpreadsheetTimeZone(),rowsInYear=0;
  for(var r=1;r<vals.length;r++){
    var row=vals[r]||[],iso=AnnualAvailabilityCapacity_date_(row[cDate],tz);if(!iso||iso.slice(0,4)!==String(year))continue;
    var email=String(row[cAud]||'').trim().toLowerCase();if(!roster[email])continue;
    rowsInYear++;roster[email].explicitRows++;
    var key=email+'|'+iso,day=byAudDate[key]||(byAudDate[key]={hard:[],soft:[],occupied:[]});
    var id1=cID1>=0?String(row[cID1]||'').trim():'',id2=cID2>=0?String(row[cID2]||'').trim():'';
    var st1=cSt1>=0?String(row[cSt1]||'').trim():'',st2=cSt2>=0?String(row[cSt2]||'').trim():'';
    if(id1)AnnualAvailabilityCapacity_pushInterval_(day.occupied,row[cS1],row[cE1]);
    if(id2)AnnualAvailabilityCapacity_pushInterval_(day.occupied,row[cS2],row[cE2]);
    if(!id1&&!id2&&AnnualAvailabilityCapacity_available_(row[cAvail])==='NO'){
      var soft=AnnualAvailabilityCapacity_softStatus_(st1)||AnnualAvailabilityCapacity_softStatus_(st2);
      var hard=AnnualAvailabilityCapacity_hardStatus_(st1)||AnnualAvailabilityCapacity_hardStatus_(st2);
      AnnualAvailabilityCapacity_pushInterval_(soft&&!hard?day.soft:day.hard,cS1>=0?(row[cS1]||'08:00'):'08:00',cE1>=0?(row[cE1]||'18:00'):'18:00');
    }
  }

  Object.keys(roster).forEach(function(email){
    var a=roster[email],d=new Date(year,0,1),end=new Date(year+1,0,1);
    for(;d<end;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
      var dow=d.getDay(),iso=Utilities.formatDate(d,tz,'yyyy-MM-dd');
      var weekend=(dow===0||dow===6),customBlocked=!!a.blockedWeekdays[dow];
      var standard=!weekend&&!customBlocked;
      var day=byAudDate[email+'|'+iso]||{hard:[],soft:[],occupied:[]};
      var hardMin=AnnualAvailabilityCapacity_unionMinutes_(day.hard),softMin=AnnualAvailabilityCapacity_unionMinutes_(day.soft),occMin=AnnualAvailabilityCapacity_unionMinutes_(day.occupied);
      if(standard){
        a.standardDays++;a.standardGrossHours+=10;
        var unavailableUnion=AnnualAvailabilityCapacity_unionMinutes_((day.hard||[]).concat(day.soft||[],day.occupied||[]));
        a.availableHours+=Math.max(0,600-unavailableUnion)/60;
        a.hardUnavailableHours+=hardMin/60;
        a.softUnavailableHours+=softMin/60;
        a.occupiedAuditHours+=occMin/60;
      } else {
        var blockedByDefault=600;
        var unavailableNonStd=AnnualAvailabilityCapacity_unionMinutes_((day.hard||[]).concat(day.occupied||[]));
        a.overrideableSoftHours+=Math.max(0,blockedByDefault-unavailableNonStd)/60;
      }
    }
    ['standardGrossHours','hardUnavailableHours','softUnavailableHours','occupiedAuditHours','availableHours','overrideableSoftHours'].forEach(function(k){a[k]=AnnualAvailabilityCapacity_round_(a[k]);});
  });

  out.auditors=Object.keys(roster).map(function(k){return roster[k];}).sort(function(a,b){return String(a.auditorName||a.auditorEmail).localeCompare(String(b.auditorName||b.auditorEmail));});
  var s={activeAuditors:out.auditors.length,standardGrossHours:0,hardUnavailableHours:0,softUnavailableHours:0,occupiedAuditHours:0,availableHours:0,overrideableSoftHours:0};
  out.auditors.forEach(function(a){Object.keys(s).forEach(function(k){if(k!=='activeAuditors')s[k]+=Number(a[k]||0);});});
  Object.keys(s).forEach(function(k){if(k!=='activeAuditors')s[k]=AnnualAvailabilityCapacity_round_(s[k]);});
  out.summary=s;
  out.diagnostics={availabilityRowsScanned:Math.max(0,vals.length-1),availabilityRowsInYear:rowsInYear,profilesBuild:profiles.build||'',standardDayHours:10,missingAvailabilityRowSemantics:'NO_EXPLICIT_EXCEPTION',weekendSemantics:'SOFT_NON_STANDARD',customBlockedWeekdaySemantics:'SOFT_NON_STANDARD'};
  out.success=out.errors.length===0;out.serverMs=Date.now()-t0;return out;
}

function AnnualAvailabilityCapacity_key_(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');}
function AnnualAvailabilityCapacity_date_(v,tz){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz,'yyyy-MM-dd');var s=String(v||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function AnnualAvailabilityCapacity_timeMin_(v){if(v==null||v==='')return null;if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return v.getHours()*60+v.getMinutes();var m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})/);if(!m)return null;var n=Number(m[1])*60+Number(m[2]);return isFinite(n)?n:null;}
function AnnualAvailabilityCapacity_pushInterval_(arr,s,e){var a=AnnualAvailabilityCapacity_timeMin_(s),b=AnnualAvailabilityCapacity_timeMin_(e);if(a==null)a=ANNUAL_AVAILABILITY_DAY_START_MIN;if(b==null)b=ANNUAL_AVAILABILITY_DAY_END_MIN;a=Math.max(ANNUAL_AVAILABILITY_DAY_START_MIN,a);b=Math.min(ANNUAL_AVAILABILITY_DAY_END_MIN,b);if(b>a)arr.push([a,b]);}
function AnnualAvailabilityCapacity_unionMinutes_(arr){arr=(arr||[]).slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});if(!arr.length)return 0;var total=0,s=arr[0][0],e=arr[0][1];for(var i=1;i<arr.length;i++){var x=arr[i];if(x[0]<=e)e=Math.max(e,x[1]);else{total+=e-s;s=x[0];e=x[1];}}return total+(e-s);}
function AnnualAvailabilityCapacity_available_(v){if(v===false)return'NO';if(v===true)return'YES';var s=String(v==null?'':v).trim().toUpperCase();if(s==='NO'||s==='FALSE'||s==='0'||s==='N'||s==='UNAVAILABLE'||s==='NOT AVAILABLE'||s==='NIET BESCHIKBAAR')return'NO';if(s==='YES'||s==='TRUE'||s==='1'||s==='Y'||s==='AVAILABLE'||s==='BESCHIKBAAR')return'YES';return s;}
function AnnualAvailabilityCapacity_softStatus_(s){s=String(s||'').trim().toUpperCase();return s==='SYSTEM_DEFAULT'||s==='USER_MANUAL'||s==='CALENDAR'||s==='CALENDER'||s.indexOf('DEFAULT_')===0||s.indexOf('MANUAL_')===0;}
function AnnualAvailabilityCapacity_hardStatus_(s){s=String(s||'').trim().toUpperCase();return!!s&&!AnnualAvailabilityCapacity_softStatus_(s);}
function AnnualAvailabilityCapacity_round_(n){return Math.round(Number(n||0)*100)/100;}
function AnnualAvailabilityCapacity_parseBlockedWeekdays_(raw){
  var out={},s=String(raw==null?'':raw).trim().toLowerCase();if(!s)return out;
  var names={
    su:0,sun:0,sunday:0,zondag:0,dom:0,domingo:0,
    mo:1,mon:1,monday:1,maandag:1,lun:1,lunes:1,
    tu:2,tue:2,tues:2,tuesday:2,dinsdag:2,mar:2,martes:2,
    we:3,wed:3,wednesday:3,woensdag:3,mie:3,miercoles:3,'miércoles':3,
    th:4,thu:4,thur:4,thurs:4,thursday:4,donderdag:4,jue:4,jueves:4,
    fr:5,fri:5,friday:5,vrijdag:5,vie:5,viernes:5,
    sa:6,sat:6,saturday:6,zaterdag:6,sab:6,sabado:6,'sábado':6
  };
  s.split(/[;,|/\s]+/).forEach(function(t){t=t.trim();if(Object.prototype.hasOwnProperty.call(names,t))out[names[t]]=true;else if(/^[0-6]$/.test(t))out[Number(t)]=true;});
  return out;
}
