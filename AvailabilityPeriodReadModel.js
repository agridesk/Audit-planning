/***********************************************************************
 * AvailabilityPeriodReadModel.js
 * BUILD: 2026-09-10_AMS01_2_AVAILABILITY_PERIOD_READ_MODEL_R4_SINGLE_WINDOW
 *
 * Read-only compact period projection of canonical Auditor Availability.
 * Canonical owner remains AvailabilityService / Auditor Availability.
 * No writes, no new truth, no persistent cache.
 *
 * AMS-01.2 SPEED
 * - Normal path uses ONE fixed-window sheet read.
 * - Date filtering and auditor filtering are in-memory.
 * - Boundary guard falls back to full canonical sheet read when window capacity
 *   may be exceeded; no silent truncation on a populated boundary row/column.
 ***********************************************************************/
var AVAILABILITY_PERIOD_READ_MODEL_BUILD='2026-09-10_AMS01_2_AVAILABILITY_PERIOD_READ_MODEL_R4_SINGLE_WINDOW';
var APRM_WINDOW_ROWS=768;
var APRM_WINDOW_COLS=16;
function APRM_clean_(v){return String(v==null?'':v).replace(/\u00A0/g,' ').trim();}
function APRM_norm_(v){return APRM_clean_(v).toLowerCase();}
function APRM_headerKey_(v){return APRM_norm_(v).replace(/\s+/g,'_');}
function APRM_findCol_(headers,candidates){var map={};for(var i=0;i<(headers||[]).length;i++){var key=APRM_headerKey_(headers[i]);if(key&&map[key]===undefined)map[key]=i;}for(var j=0;j<(candidates||[]).length;j++){var k=APRM_headerKey_(candidates[j]);if(map[k]!==undefined)return map[k];}return-1;}
function APRM_isoDate_(v,tz){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'yyyy-MM-dd');var s=APRM_clean_(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function APRM_time_(v,tz){if(v==null||v==='')return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz||Session.getScriptTimeZone(),'HH:mm');var s=APRM_clean_(v),m=s.match(/^(\d{1,2}):(\d{2})$/);return m?('0'+Number(m[1])).slice(-2)+':'+m[2]:s;}
function APRM_period_(input,tz){input=input||{};var from=APRM_isoDate_(input.from||input.start||input.periodFrom,tz),to=APRM_isoDate_(input.to||input.end||input.periodTo,tz);if(!from||!to)throw new Error('AvailabilityPeriodReadModel: valid from/to required');if(to<from)throw new Error('AvailabilityPeriodReadModel: to cannot be before from');return{from:from,to:to};}
function APRM_auditorSet_(input){var raw=input&&(input.auditors||input.auditorEmails||input.auditorEmail||input.auditor);if(!raw)return null;var arr=Array.isArray(raw)?raw:[raw],set={};for(var i=0;i<arr.length;i++){var k=APRM_norm_(arr[i]);if(k)set[k]=true;}return Object.keys(set).length?set:null;}
function APRM_sheet_(){var ss=SpreadsheetApp.getActive();return ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');}
function APRM_slot_(row,startCol,endCol,auditIdCol,statusCol,tz,slot){if(startCol<0&&endCol<0&&auditIdCol<0&&statusCol<0)return null;var start=startCol>=0?APRM_time_(row[startCol],tz):'',end=endCol>=0?APRM_time_(row[endCol],tz):'',auditId=auditIdCol>=0?APRM_clean_(row[auditIdCol]):'',status=statusCol>=0?APRM_clean_(row[statusCol]):'';if(!start&&!end&&!auditId&&!status)return null;return{slot:slot,start:start,end:end,auditId:auditId,status:status};}
function APRM_rowHasData_(row){for(var i=0;i<(row||[]).length;i++){if(row[i]!==''&&row[i]!=null)return true;}return false;}
function APRM_usedRows_(values){var last=0;for(var i=0;i<(values||[]).length;i++){if(APRM_rowHasData_(values[i]))last=i+1;}return last;}
function APRM_usedCols_(values,usedRows){var last=0;for(var r=0;r<Math.min(usedRows||0,(values||[]).length);r++){var row=values[r]||[];for(var c=row.length-1;c>=0;c--){if(row[c]!==''&&row[c]!=null){if(c+1>last)last=c+1;break;}}}return last;}
function APRM_readWindow_(sh,perf){var values=null,mode='FIXED_WINDOW',fallback=false;try{values=sh.getRange(1,1,APRM_WINDOW_ROWS,APRM_WINDOW_COLS).getValues();}catch(e){fallback=true;mode='FULL_FALLBACK';values=sh.getDataRange().getValues();}
 var usedRows=APRM_usedRows_(values),usedCols=APRM_usedCols_(values,usedRows),boundaryRow=!fallback&&usedRows===APRM_WINDOW_ROWS&&APRM_rowHasData_(values[APRM_WINDOW_ROWS-1]),boundaryCol=!fallback&&usedCols===APRM_WINDOW_COLS;
 if(boundaryRow||boundaryCol){fallback=true;mode='FULL_FALLBACK';values=sh.getDataRange().getValues();usedRows=APRM_usedRows_(values);usedCols=APRM_usedCols_(values,usedRows);}
 if(typeof DPL_mark_==='function')DPL_mark_(perf,'windowRead',{mode:mode,windowRows:fallback?values.length:APRM_WINDOW_ROWS,windowCols:fallback?(values[0]||[]).length:APRM_WINDOW_COLS,usedRows:usedRows,usedCols:usedCols,fallback:fallback});
 return{values:values.slice(0,usedRows),usedRows:usedRows,usedCols:usedCols,fallback:fallback,mode:mode};}
function AvailabilityPeriodReadModel_get(input){
 input=input||{};var perf=typeof DPL_start_==='function'?DPL_start_('AvailabilityPeriodReadModel_get',{from:input.from||input.start||input.periodFrom||'',to:input.to||input.end||input.periodTo||'',auditorCount:Array.isArray(input.auditors||input.auditorEmails)?(input.auditors||input.auditorEmails).length:((input.auditorEmail||input.auditor)?1:0)}):null;
 var ss=SpreadsheetApp.getActive(),tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone(),period=APRM_period_(input,tz),auditorSet=APRM_auditorSet_(input),sh=APRM_sheet_();if(!sh)throw new Error("AvailabilityPeriodReadModel: missing sheet 'Auditor Availability'");
 var pack=APRM_readWindow_(sh,perf),values=pack.values;if(!values.length){var e={success:true,build:AVAILABILITY_PERIOD_READ_MODEL_BUILD,period:period,days:{},rows:[],meta:{sourceRows:0,returnedRows:0,writes:false}};if(typeof DPL_end_==='function')e.devPerformance=DPL_end_(perf,{returnedRows:0});return e;}
 var headers=values[0]||[],cDate=APRM_findCol_(headers,['Date']),cAud=APRM_findCol_(headers,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']),cAvail=APRM_findCol_(headers,['Available']),cS1=APRM_findCol_(headers,['First_Audit_Start_Time','First Audit Start Time']),cE1=APRM_findCol_(headers,['First_Audit_End_Time','First Audit End Time']),cID1=APRM_findCol_(headers,['Audit_ID_1','Audit ID 1','AuditId1']),cSt1=APRM_findCol_(headers,['Status_1','Status 1','Status','Source']),cS2=APRM_findCol_(headers,['Second_Audit_Start_Time','Second Audit Start Time']),cE2=APRM_findCol_(headers,['Second_Audit_End_Time','Second Audit End Time']),cID2=APRM_findCol_(headers,['Audit_ID_2','Audit ID 2','AuditId2']),cSt2=APRM_findCol_(headers,['Status_2','Status 2']),cUpd=APRM_findCol_(headers,['Last_Updated','Last Updated','Timestamp']);if(cDate<0||cAud<0||cAvail<0)throw new Error('AvailabilityPeriodReadModel: required columns missing');
 var rows=[],days={},sourceRows=Math.max(0,values.length-1),matchedRows=0;for(var r=1;r<values.length;r++){var row=values[r]||[],date=APRM_isoDate_(row[cDate],tz);if(!date||date<period.from||date>period.to)continue;matchedRows++;var auditorEmail=APRM_norm_(row[cAud]);if(!auditorEmail||(auditorSet&&!auditorSet[auditorEmail]))continue;var rec={date:date,auditorEmail:auditorEmail,available:APRM_clean_(row[cAvail]),slots:[],lastUpdated:cUpd>=0?APRM_clean_(row[cUpd]):'',sourceRow:r+1},s1=APRM_slot_(row,cS1,cE1,cID1,cSt1,tz,1),s2=APRM_slot_(row,cS2,cE2,cID2,cSt2,tz,2);if(s1)rec.slots.push(s1);if(s2)rec.slots.push(s2);rows.push(rec);if(!days[auditorEmail])days[auditorEmail]={};if(!days[auditorEmail][date])days[auditorEmail][date]=[];days[auditorEmail][date].push(rec);}
 if(typeof DPL_mark_==='function')DPL_mark_(perf,'filterProject',{sourceRows:sourceRows,periodMatchedRows:matchedRows,returnedRows:rows.length,auditors:Object.keys(days).length});rows.sort(function(a,b){if(a.auditorEmail!==b.auditorEmail)return a.auditorEmail.localeCompare(b.auditorEmail);if(a.date!==b.date)return a.date.localeCompare(b.date);return a.sourceRow-b.sourceRow;});
 var result={success:true,build:AVAILABILITY_PERIOD_READ_MODEL_BUILD,period:period,rows:rows,days:days,meta:{sourceRows:sourceRows,scannedRows:sourceRows,returnedRows:rows.length,auditors:Object.keys(days).length,columnsRead:pack.usedCols,periodMatchedRows:matchedRows,segmentsRead:1,readStrategy:pack.mode,readDensity:sourceRows?matchedRows/sourceRows:0,windowFallback:pack.fallback,canonicalOwner:'AvailabilityService / Auditor Availability',writes:false}};if(typeof DPL_end_==='function')result.devPerformance=DPL_end_(perf,{sourceRows:sourceRows,scannedRows:sourceRows,returnedRows:rows.length,auditors:Object.keys(days).length,readStrategy:pack.mode,segmentsRead:1});return result;
}
