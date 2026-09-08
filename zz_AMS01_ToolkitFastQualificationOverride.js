/**
 * FILE: zz_AMS01_ToolkitFastQualificationOverride.js
 * BUILD: AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_20260908_R2
 * DEV-only late-load override for AMS-01 Toolkit first-paint performance.
 *
 * Purpose:
 * - First paint remains HARD qualification only, using canonical
 *   TK3S_isAuditorQualified_R24_.
 * - Rotation/history enrichment remains pending/on-demand.
 * - Replace generic persisted full-sheet Auditors read with one bounded
 *   A:P read. Current DEV Auditors qualification/profile contract lives in
 *   A:P; all qualification scope columns and Blocked weekdays are included.
 * - No planning/status/availability truth changes.
 */
var AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD='AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_20260908_R2';

function _mp_getQualifiedAuditorsFastList_(ss,requiredScopes,preassignedName,opts){
  var t0=Date.now();
  opts=opts||{};
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();
  requiredScopes=Array.isArray(requiredScopes)?requiredScopes:[];
  var pre=String(preassignedName||'').trim().toLowerCase();

  if(typeof TK3S_isAuditorQualified_R24_!=='function'){
    throw new Error('Missing TK3S_isAuditorQualified_R24_');
  }

  var sh=ss.getSheetByName('Auditors');
  if(!sh) throw new Error("Missing sheet 'Auditors'");

  var lastRow=Math.max(1,sh.getLastRow());
  var readWidth=Math.min(16,Math.max(1,sh.getLastColumn()));
  var tRead=Date.now();
  var data=sh.getRange(1,1,lastRow,readWidth).getValues();
  var readMs=Date.now()-tRead;
  var hdr=data[0]||[];

  var idxName=_mp_findHeaderIdxCI_(hdr,['Name','Auditor','Auditor name']);
  var idxEmail=_mp_findHeaderIdxCI_(hdr,['E-mail','Email','E-mail address','Mail']);
  var idxActive=_mp_findHeaderIdxCI_(hdr,['Active','Is active']);
  var idxRole=_mp_findHeaderIdxCI_(hdr,['Role','Function']);
  var idxBW=_mp_findHeaderIdxCI_(hdr,['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  if(idxName<0||idxEmail<0||idxActive<0||idxRole<0){
    throw new Error('Auditors headers missing (Name/E-mail/Active/Role)');
  }

  var out=[];
  for(var r=1;r<data.length;r++){
    var row=data[r]||[];
    if(!_mp_isYes_(row[idxActive])) continue;
    if(String(row[idxRole]||'').trim().toLowerCase()!=='auditor') continue;
    if(!TK3S_isAuditorQualified_R24_(ss,row,hdr,requiredScopes)) continue;

    var name=String(row[idxName]||'').trim();
    var email=String(row[idxEmail]||'').trim();
    if(!name&&!email) continue;
    var isPre=!!pre&&(name.toLowerCase()===pre||email.toLowerCase()===pre);

    out.push({
      name:name,
      email:email,
      blockedWeekdays:idxBW>=0?String(row[idxBW]||'').trim():'',
      isPreassigned:isPre,
      softBlockRotation:false,
      nearRotationLimit:false,
      ineligible:false,
      hardBlockQualification:false,
      ineligibleReason:'',
      performedByScope:{},
      performedCount:0,
      maxAllowed:null,
      qualifiedCanonical:true,
      eligibilityOwner:'TK3S_isAuditorQualified_R24_',
      rotationPending:true,
      qualifiedFast:true,
      __ams01FastQualificationBuild:AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD
    });
  }

  out.sort(function(a,b){
    if(!!a.isPreassigned!==!!b.isPreassigned) return a.isPreassigned?-1:1;
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  try{
    Logger.log('[AMS01_FAST_QUAL] '+JSON.stringify({
      build:AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD,
      auditId:String(opts.auditId||''),
      requiredScopes:requiredScopes,
      source:'DIRECT_BOUNDED_A_P',
      rowsRead:data.length>0?data.length-1:0,
      columnsRead:readWidth,
      readMs:readMs,
      rowsReturned:out.length,
      serverMs:Date.now()-t0
    }));
  }catch(eLog){}

  return out;
}

function AMS01_ToolkitFastQualificationZZStatus(){
  var auditId='AUD_CultiusItxartSCP_HQ_1777531729225_18';
  var ctx=TK3S_readAuditContext_R24_(auditId);
  var t0=Date.now();
  var out=_mp_getQualifiedAuditorsFastList_(ctx.ss,ctx.requiredScopes||[],ctx.preassigned||'',{auditId:auditId});
  return {
    success:true,
    active:!!(out&&out.length&&out[0].__ams01FastQualificationBuild===AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD),
    build:AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD,
    rows:out.length,
    wallMs:Date.now()-t0
  };
}
