/**
 * FILE: zz_AMS01_ToolkitFastQualificationOverride.js
 * BUILD: AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_20260908_R4
 * DEV late-load implementation for AMS-01 Toolkit first-paint performance.
 *
 * Purpose:
 * - First paint remains HARD qualification only, using canonical
 *   TK3S_isAuditorQualified_R24_.
 * - Rotation/history enrichment remains pending/on-demand.
 * - Avoid generic persisted full-sheet Auditors reads.
 * - Read width is derived from actual headers + required scopes; there is no
 *   hardcoded maximum scope column.
 * - Cache resulting auditor profiles for same-execution reuse by blocked-weekday
 *   enrichment. Cache is execution-local only.
 * - No planning/status/availability truth changes.
 */
var AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_BUILD='AMS01_TOOLKIT_FAST_QUALIFICATION_ZZ_20260908_R4';
var AMS01_FAST_QUAL_EXEC_PROFILES={byEmail:{},byName:{}};

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
  var lastCol=Math.max(1,sh.getLastColumn());
  var tRead=Date.now();

  // Header is tiny and is the schema truth. Read it completely so future scope
  // columns can move or extend without changing code.
  var fullHdr=sh.getRange(1,1,1,lastCol).getValues()[0]||[];

  function idxCI_(candidates){
    return _mp_findHeaderIdxCI_(fullHdr,candidates||[]);
  }

  var idxNameFull=idxCI_(['Name','Auditor','Auditor name']);
  var idxEmailFull=idxCI_(['E-mail','Email','E-mail address','Mail']);
  var idxActiveFull=idxCI_(['Active','Is active']);
  var idxRoleFull=idxCI_(['Role','Function']);
  var idxBWFull=idxCI_(['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  if(idxNameFull<0||idxEmailFull<0||idxActiveFull<0||idxRoleFull<0){
    throw new Error('Auditors headers missing (Name/E-mail/Active/Role)');
  }

  // Reproduce the canonical qualification header mapping only to determine
  // which columns are needed for this request. Final qualification decision is
  // still made exclusively by TK3S_isAuditorQualified_R24_.
  var scopeHeaderIndex={};
  for(var h=0;h<fullHdr.length;h++){
    var raw=String(fullHdr[h]||'').trim();
    if(!raw) continue;
    scopeHeaderIndex[raw]=h;
    try{
      var canon=_mp_scopeCanonicalForRotation_(ss,raw);
      if(canon) scopeHeaderIndex[canon]=h;
    }catch(eCanon){}
  }

  var maxNeeded=Math.max(idxNameFull,idxEmailFull,idxActiveFull,idxRoleFull,idxBWFull);
  for(var s=0;s<requiredScopes.length;s++){
    var sc=String(requiredScopes[s]||'').trim();
    if(!sc) continue;
    try{ sc=_mp_scopeCanonicalForRotation_(ss,sc)||sc; }catch(eSc){}
    if(scopeHeaderIndex.hasOwnProperty(sc)){
      maxNeeded=Math.max(maxNeeded,Number(scopeHeaderIndex[sc]));
    }
  }

  var readWidth=Math.min(lastCol,Math.max(1,maxNeeded+1));
  var hdr=fullHdr.slice(0,readWidth);
  var body=lastRow>=2?sh.getRange(2,1,lastRow-1,readWidth).getValues():[];
  var data=[hdr].concat(body);
  var readMs=Date.now()-tRead;

  var idxName=_mp_findHeaderIdxCI_(hdr,['Name','Auditor','Auditor name']);
  var idxEmail=_mp_findHeaderIdxCI_(hdr,['E-mail','Email','E-mail address','Mail']);
  var idxActive=_mp_findHeaderIdxCI_(hdr,['Active','Is active']);
  var idxRole=_mp_findHeaderIdxCI_(hdr,['Role','Function']);
  var idxBW=_mp_findHeaderIdxCI_(hdr,['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);

  var out=[];
  AMS01_FAST_QUAL_EXEC_PROFILES={byEmail:{},byName:{}};

  for(var r=1;r<data.length;r++){
    var row=data[r]||[];
    if(!_mp_isYes_(row[idxActive])) continue;
    if(String(row[idxRole]||'').trim().toLowerCase()!=='auditor') continue;
    if(!TK3S_isAuditorQualified_R24_(ss,row,hdr,requiredScopes)) continue;

    var name=String(row[idxName]||'').trim();
    var email=String(row[idxEmail]||'').trim();
    if(!name&&!email) continue;
    var isPre=!!pre&&(name.toLowerCase()===pre||email.toLowerCase()===pre);

    var item={
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
    };

    out.push(item);
    if(email) AMS01_FAST_QUAL_EXEC_PROFILES.byEmail[email.toLowerCase()]=item;
    if(name) AMS01_FAST_QUAL_EXEC_PROFILES.byName[name.toLowerCase()]=item;
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
      source:'DIRECT_SCOPE_DRIVEN',
      rowsRead:data.length>0?data.length-1:0,
      headerColumns:lastCol,
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
