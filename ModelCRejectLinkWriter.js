// AMS 2.0 issue #45. Canonical GAS Reject link close boundary.
// Invoke only from the canonical Reject archive owner. Does not change obligation lifecycle states.
// The caller must own the lifecycle lock and coordinate archive rollback.
var MODEL_C_REJECT_LINK_WRITER_BUILD='2026-10-22_ISSUE45_R1';
function ModelCRejectLinkWriter_close_(auditId,ss){
  auditId=String(auditId||'').trim();if(!auditId)throw Error('MODEL_C_REJECT_AUDIT_ID_REQUIRED');
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();
  var linkSheet=ss&&ss.getSheetByName('Audit_Visit_Obligations'),obSheet=ss&&ss.getSheetByName('Audit_Obligations');
  if(!linkSheet||!obSheet)return{success:false,error:'MODEL_C_REJECT_SHEETS_MISSING',repairRequired:false};
  var data=linkSheet.getDataRange().getValues(),obData=obSheet.getDataRange().getValues(),h=data[0]||[],oh=obData[0]||[];
  var ai=h.indexOf('Audit_ID'),oi=h.indexOf('Obligation_ID'),si=h.indexOf('Link_State'),ui=h.indexOf('Unlinked_At'),obId=oh.indexOf('Obligation_ID');
  if([ai,oi,si,ui,obId].some(function(x){return x<0;}))return{success:false,error:'MODEL_C_REJECT_SCHEMA_MISSING',repairRequired:false};
  var links=data.slice(1).map(function(r,i){return{rowNumber:i+2,auditId:String(r[ai]||''),obligationId:String(r[oi]||''),linkState:String(r[si]||'')};});
  var obligations=obData.slice(1).map(function(r){return{obligationId:String(r[obId]||'')};});
  var stamp=new Date().toISOString(),plan;
  try{plan=ModelCRejectLinkPlanner_plan(auditId,links,obligations,stamp);}
  catch(e){return{success:false,error:String(e&&e.message||e),repairRequired:false};}
  if(!plan.edits.length)return{success:true,changed:0,idempotent:true,receipt:[],obligationsUnmodified:true};
  var originals=[],restored=true;
  try{
    for(var i=0;i<plan.edits.length;i++){
      var edit=plan.edits[i],current=linkSheet.getRange(edit.rowNumber,1,1,h.length).getValues()[0];
      if(String(current[ai]||'')!==edit.auditId||String(current[oi]||'')!==edit.obligationId||String(current[si]||'').toUpperCase()!=='ACTIVE')throw Error('MODEL_C_REJECT_CONCURRENT_LINK_CHANGE');
      originals.push({row:edit.rowNumber,values:current.slice()});
      var next=current.slice();next[si]='INACTIVE';next[ui]=stamp;
      linkSheet.getRange(edit.rowNumber,1,1,h.length).setValues([next]);
      var observed=linkSheet.getRange(edit.rowNumber,1,1,h.length).getValues()[0];
      if(String(observed[si]||'')!=='INACTIVE'||String(observed[ui]||'')!==stamp)throw Error('MODEL_C_REJECT_LINK_WRITE_NOT_VERIFIED');
    }
    return{success:true,changed:plan.edits.length,idempotent:false,receipt:originals,obligationsUnmodified:true,build:MODEL_C_REJECT_LINK_WRITER_BUILD};
  }catch(e){
    restored=ModelCRejectLinkWriter_rollback_({receipt:originals},linkSheet);
    return{success:false,error:String(e&&e.message||e),repairRequired:!restored,rolledBack:restored,build:MODEL_C_REJECT_LINK_WRITER_BUILD};
  }
}
function ModelCRejectLinkWriter_rollback_(result,linkSheet){
  var list=result&&result.receipt||[];if(!linkSheet||!Array.isArray(list))return false;
  var ok=true;
  for(var i=list.length-1;i>=0;i--){var p=list[i];try{linkSheet.getRange(p.row,1,1,p.values.length).setValues([p.values]);}catch(e){ok=false;}}
  return ok;
}
