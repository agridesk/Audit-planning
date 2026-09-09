/**
 * FILE: zz_AMS01_StatusLoadAuditPerfOverride.js
 * BUILD: AMS01_STATUS_LOAD_AUDIT_TARGETED_ROW_20260909_R1
 *
 * DEV tactical Save optimization.
 *
 * saveManagerPlanning already seeds the targeted Audit planning row context.
 * CoreStatusMachine.Status_loadAudit_ was ignoring that context and repeating:
 * header read -> TextFinder -> full row read. This override reuses the canonical
 * targeted-row cache first and falls back to the original Status_loadAudit_ if
 * the targeted helper is unavailable or misses.
 *
 * No lifecycle/status/planning rule changes.
 */
var AMS01_STATUS_LOAD_AUDIT_BUILD='AMS01_STATUS_LOAD_AUDIT_TARGETED_ROW_20260909_R1';
var AMS01_STATUS_LOAD_AUDIT_CANONICAL_=Status_loadAudit_;

Status_loadAudit_=function(auditId){
  auditId=String(auditId||'').trim();
  if(!auditId)return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);

  try{
    if(typeof __mp_getAuditPlanningRow_!=='function'){
      return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);
    }

    var ss=SpreadsheetApp.getActive();
    var pack=__mp_getAuditPlanningRow_(ss,auditId);
    if(!pack||!pack.row||!pack.hdr||!pack.rowNumber){
      return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);
    }

    var hdr=pack.hdr||[];
    var row=pack.row||[];
    function norm_(v){
      return String(v||'').replace(/[–—−]/g,'-').replace(/\u00A0/g,' ').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    }
    var map={};
    for(var i=0;i<hdr.length;i++){
      var k=norm_(hdr[i]);
      if(k&&map[k]===undefined)map[k]=i;
    }
    function find_(names){
      for(var j=0;j<(names||[]).length;j++){
        var n=norm_(names[j]);
        if(n&&map[n]!==undefined)return map[n];
      }
      return -1;
    }

    var idxAI=find_(['Audit ID','Audit_ID','AuditId']);
    var idxStatus=find_(['Status']);
    var idxAssigned=find_(['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']);
    var idxPlanned=find_(['Date - Planned','Date – Planned','Date planned','Date Planned']);
    var idxApproved=find_(['Date - Approved','Date – Approved','Date approved','Date Approved']);
    var idxJson=find_(['Planning JSON','PlanningJSON','Planning']);
    var idxHours=find_(['Hours planned','Planned hours','Hours Planned']);

    if(idxAI<0||idxStatus<0||String(row[idxAI]||'').trim()!==auditId){
      return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);
    }

    var sh=pack.sh||ss.getSheetByName('Audit planning');
    if(!sh)return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);

    return {
      found:true,
      sheet:sh,
      rowIndex:Number(pack.rowNumber||0),
      row:row.slice(),
      hdr:hdr.slice(),
      auditId:auditId,
      status:String(row[idxStatus]||'').trim(),
      col:{ai:idxAI,status:idxStatus,assigned:idxAssigned,planned:idxPlanned,approved:idxApproved,hours:idxHours,json:idxJson},
      __ams01StatusLoad:{build:AMS01_STATUS_LOAD_AUDIT_BUILD,source:(pack.execRowHit?'EXEC_ROW':'TARGETED_ROW_CACHE')}
    };
  }catch(e){
    return AMS01_STATUS_LOAD_AUDIT_CANONICAL_.apply(this,arguments);
  }
};

function AMS01_StatusLoadAuditPerfStatus(){
  return {success:true,active:true,build:AMS01_STATUS_LOAD_AUDIT_BUILD};
}
