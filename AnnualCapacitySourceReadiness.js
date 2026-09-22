/**
 * FILE: AnnualCapacitySourceReadiness.gs
 * BUILD: 2026-09-22_AMS03_ANNUAL_CAPACITY_SOURCE_READINESS_R1
 * PURPOSE:
 *   Read-only readiness diagnostic for annual auditor capacity truth.
 *
 * 3S / ownership:
 * - Speed: reuse PlanningProfilesService bounded Auditors read.
 * - Scalability: one auditor projection, no per-auditor sheet reads.
 * - Stability: no writes, no Availability mutation, no invented capacity.
 * - Canonical candidate owner is the existing Auditors capacity field when present.
 */
var ANNUAL_CAPACITY_SOURCE_READINESS_BUILD='2026-09-22_AMS03_ANNUAL_CAPACITY_SOURCE_READINESS_R1';

function RUN_AMS03_ANNUAL_CAPACITY_SOURCE_READINESS(){
  var t0=Date.now(),ss=SpreadsheetApp.getActive(),out={
    success:false,
    build:ANNUAL_CAPACITY_SOURCE_READINESS_BUILD,
    readOnly:true,
    writesPerformed:false,
    source:{sheet:'Auditors',header:'',present:false},
    counts:{activeAuditors:0,capacityDeclared:0,capacityMissing:0,capacityInvalid:0},
    auditors:[],
    gates:{},
    errors:[],
    serverMs:0
  };

  var sh=ss.getSheetByName('Auditors');
  if(!sh){out.errors.push('Missing sheet: Auditors');out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;}

  var lastCol=Math.max(1,sh.getLastColumn()),headers=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
  var candidates=['Capacity','Expected capacity','Annual capacity','Capacity hours'];
  var headerIndex=-1;
  for(var i=0;i<headers.length&&headerIndex<0;i++){
    var h=String(headers[i]||'').trim().toLowerCase();
    for(var c=0;c<candidates.length;c++)if(h===candidates[c].toLowerCase()){headerIndex=i;break;}
  }
  if(headerIndex>=0){out.source.present=true;out.source.header=String(headers[headerIndex]||'').trim();}

  var profiles=PlanningProfilesService_get({includeCompanies:false});
  if(!profiles||profiles.success!==true){out.errors.push('PlanningProfilesService failed');out.serverMs=Date.now()-t0;Logger.log(JSON.stringify(out,null,2));return out;}

  (profiles.auditors||[]).forEach(function(a){
    var active=String(a.active||'').trim().toLowerCase(),role=String(a.role||'').trim().toLowerCase();
    var isActive=(active==='yes'||active==='true'||active==='1'||active==='x');
    if(!isActive||role!=='auditor')return;
    var raw=String(a.capacityHours==null?'':a.capacityHours).trim(),n=raw===''?null:Number(raw.replace(',','.'));
    var state='MISSING';
    if(raw!==''&&isFinite(n)&&n>=0)state='DECLARED';
    else if(raw!=='')state='INVALID';
    out.counts.activeAuditors++;
    if(state==='DECLARED')out.counts.capacityDeclared++;
    else if(state==='INVALID')out.counts.capacityInvalid++;
    else out.counts.capacityMissing++;
    out.auditors.push({auditorEmail:String(a.email||'').trim().toLowerCase(),auditorName:String(a.name||'').trim(),capacityRaw:raw,capacityHours:state==='DECLARED'?n:null,state:state});
  });
  out.auditors.sort(function(a,b){return String(a.auditorName||a.auditorEmail).localeCompare(String(b.auditorName||b.auditorEmail));});

  out.gates={
    readOnly:out.readOnly===true&&out.writesPerformed===false,
    planningProfilesReused:true,
    noAvailabilityTruthCreated:true,
    sourceOwnershipExplicit:true,
    auditorRosterPresent:out.counts.activeAuditors>0,
    capacityHeaderPresent:out.source.present,
    noInvalidCapacityValues:out.counts.capacityInvalid===0,
    allActiveAuditorsDeclared:out.counts.activeAuditors>0&&out.counts.capacityDeclared===out.counts.activeAuditors
  };

  /* Readiness may legitimately be incomplete; only structural/runtime failure makes success false. */
  out.success=out.errors.length===0;
  out.serverMs=Date.now()-t0;
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
