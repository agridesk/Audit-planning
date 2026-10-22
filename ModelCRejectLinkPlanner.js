// AMS 2.0 — issue #45. Pure Model C Reject link transition planner.
// No SpreadsheetApp access, no implicit writes. Caller owns persistence/lock.
function ModelCRejectLinkPlanner_plan(auditId,links,obligations,now){
  auditId=String(auditId||'').trim();if(!auditId)throw Error('MODEL_C_REJECT_AUDIT_ID_REQUIRED');
  if(!Array.isArray(links)||!Array.isArray(obligations))throw Error('MODEL_C_REJECT_INPUT_INVALID');
  var obligationsById={};for(var i=0;i<obligations.length;i++){var o=obligations[i]||{},oid=String(o.obligationId||'').trim();if(oid)obligationsById[oid]=o;}
  var edits=[],seen={};
  for(var j=0;j<links.length;j++){
    var l=links[j]||{},lid=String(l.auditId||'').trim(),oid=String(l.obligationId||'').trim(),state=String(l.linkState||'').trim().toUpperCase();
    if(lid!==auditId||state!=='ACTIVE')continue;
    if(!oid||!obligationsById[oid])throw Error('MODEL_C_REJECT_ORPHAN_OBLIGATION');
    if(seen[oid])throw Error('MODEL_C_REJECT_DUPLICATE_ACTIVE_OBLIGATION_LINK');
    seen[oid]=true;
    if(!Number.isInteger(l.rowNumber)||l.rowNumber<2)throw Error('MODEL_C_REJECT_LINK_ROW_INVALID');
    edits.push({rowNumber:l.rowNumber,auditId:lid,obligationId:oid,before:'ACTIVE',after:'INACTIVE',unlinkedAt:String(now||'').trim()});
  }
  if(edits.length&&!String(now||'').trim())throw Error('MODEL_C_REJECT_UNLINK_TIMESTAMP_REQUIRED');
  return {success:true,auditId,edits,changed:edits.length,idempotent:edits.length===0,obligationsUnmodified:true};
}
