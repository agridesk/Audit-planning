/**
 * FILE: zz_AMS01_AuditTrailWritePerfOverride.js
 * BUILD: AMS01_AUDIT_TRAIL_WRITE_ZZ_20260908_R1
 *
 * DEV-only write-mechanics optimization.
 * Preserves the canonical AUDIT_TRAIL queue row contract exactly, but uses a
 * direct one-row setValues write instead of appendRow in the PLAN hot path.
 */
var AMS01_AUDIT_TRAIL_WRITE_ZZ_BUILD='AMS01_AUDIT_TRAIL_WRITE_ZZ_20260908_R1';

function managerV5_appendAuditTrailToNotificationQueue_(shNotif,payload){
  if(!shNotif) throw new Error('managerV5_appendAuditTrailToNotificationQueue_: missing sheet handle');
  payload=payload||{};

  var type=NB_eventCode_(payload.type||'LIFECYCLE_STATUS_CHANGED');
  var auditId=NB_clean_(payload.auditId);
  var company=NB_clean_(payload.company);
  var actorEmail=NB_clean_(payload.actorEmail||payload.managerEmail);
  var now=new Date();
  var tz=NB_getTz_(SpreadsheetApp.getActiveSpreadsheet());
  var subject='[TRAIL] '+type+' :: '+(auditId||'(no-audit-id)');

  var bodyObj={
    type:type,
    auditId:auditId,
    auditNumber:NB_clean_(payload.auditNumber||payload.mpsNumber||payload.number),
    company:company,
    actorEmail:actorEmail,
    actorRole:NB_clean_(payload.actorRole),
    beforeStatus:NB_clean_(payload.beforeStatus),
    afterStatus:NB_clean_(payload.afterStatus),
    reason:NB_clean_(payload.reason),
    hours:payload.hours!=null?Number(payload.hours):null,
    source:NB_clean_(payload.source),
    timestamp:payload.timestamp||Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm:ss'),
    action:NB_clean_(payload.action)
  };

  var body=JSON.stringify(bodyObj);
  var hash=NB_hashText_(type+'|'+auditId+'|'+bodyObj.timestamp+'|'+bodyObj.afterStatus);
  var row=[
    Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm'),
    'AUDIT_TRAIL',
    type,
    '',
    auditId,
    company,
    subject,
    body,
    0,
    '',
    hash,
    '',
    JSON.stringify({payload:bodyObj})
  ];

  var rowNumber=shNotif.getLastRow()+1;
  shNotif.getRange(rowNumber,1,1,row.length).setValues([row]);

  return {
    success:true,
    type:type,
    auditId:auditId,
    status:'AUDIT_TRAIL',
    hash:hash,
    row:rowNumber,
    build:AMS01_AUDIT_TRAIL_WRITE_ZZ_BUILD
  };
}

function AMS01_AuditTrailWritePerfStatus(){
  return {success:true,active:true,build:AMS01_AUDIT_TRAIL_WRITE_ZZ_BUILD};
}
