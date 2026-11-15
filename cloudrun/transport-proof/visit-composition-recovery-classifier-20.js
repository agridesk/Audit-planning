/** DEV-only classification of an existing quarantined visit-composition outbox.
 * Pure, read-only. A formatted Sheets equality is not sufficient to authorize
 * writes: it must be paired with independent unformatted cell-level evidence.
 */
export function classifyVisitCompositionRecovery20({entry,gate,rows,append,renderParity,cellDiff}={}){
 const deny=reason=>Object.freeze({eligible:false,reason});
 if(!entry||entry.action!=='VISIT_COMPOSITION_SEPARATELY'||entry.state!=='UNCERTAIN'||entry.multi!==true)
  return deny('OUTBOX_NOT_QUARANTINED_COMPOSITION');
 if(!/^[a-f0-9]{64}$/.test(String(entry.operationId||''))||gate?.holder?.operationId!==entry.operationId||
    gate.holder.state!=='UNCERTAIN')return deny('GATE_OWNERSHIP_UNVERIFIED');
 const since=Date.parse(gate.holder.uncertainAt||'');
 if(!Number.isFinite(since)||Date.now()-since<30*60*1000)return deny('QUARANTINE_INCOMPLETE');
 if(rows?.state!=='CONFLICT'||append?.state!=='MISSING'||!Array.isArray(cellDiff)||
    !renderParity?.allFormattedBefore||!Array.isArray(renderParity.detail))
  return deny('SOURCE_PROOF_INCOMPLETE');
 const writes=entry.snapshot?.projectionWrites,pre=entry.snapshot?.projectionPreconditions;
 if(!Array.isArray(writes)||writes.length!==5||!Array.isArray(pre)||pre.length!==5||
    !Array.isArray(entry.snapshot?.appendIntents)||entry.snapshot.appendIntents.length!==6)
  return deny('SNAPSHOT_SHAPE_UNEXPECTED');
 const source='Audit planning!A74:BS74';
 if(writes[0]?.range!==source||pre[0]?.range!==source||
    !Array.isArray(writes[0].values?.[0])||!Array.isArray(pre[0].before))
  return deny('SOURCE_RANGE_UNEXPECTED');
 if(cellDiff.length!==5||renderParity.detail.length!==5||
    cellDiff[0].range!==source||renderParity.detail[0].range!==source||
    !cellDiff[0].differing?.some(x=>x.column===19&&x.matchesBefore===false&&x.actualType==='number')||
    cellDiff[0].differing?.some(x=>x.column!==19&&x.matchesBefore===false))
  return deny('UNFORMATTED_DRIFT_NOT_ISOLATED');
 if(cellDiff.slice(1).some(x=>x.differing?.some(d=>!d.matchesBefore))||
    renderParity.detail.some(x=>x.formattedMatchesBefore!==true))
  return deny('OTHER_ROW_DRIFT');
 if(rows.detail?.length!==5||rows.detail.some(x=>x.target||x.before&&x.range===source)||
    rows.detail.slice(1).some(x=>!x.before))
  return deny('ROW_PROOF_MISMATCH');
 return Object.freeze({eligible:true,reason:'FORMATTED_SOURCE_BEFORE_WITH_ISOLATED_NUMERIC_RENDER_DRIFT',
  operationId:entry.operationId,mode:'FORWARD_ONLY',requiresExplicitManagerApproval:true});
}
