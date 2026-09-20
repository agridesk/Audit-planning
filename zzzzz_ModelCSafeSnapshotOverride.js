/** Model C safe snapshot/restore override for date-text compatibility fields. */
var MODEL_C_SAFE_SNAPSHOT_BUILD='2026-09-20_AMS_01_6_MODEL_C_SAFE_SNAPSHOT_R1';

function ModelCScopeOwner_snapshotSheet_(sheet){
  var range=sheet.getDataRange(),values=range.getValues(),numberFormats=range.getNumberFormats(),textDateColumns=[];
  if(String(sheet.getName())===String(MODEL_C_SHEETS.AUDIT_PLANNING)&&values.length){
    var headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),tz=sheet.getParent().getSpreadsheetTimeZone()||Session.getScriptTimeZone();
    ['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'].forEach(function(h){
      var c=map[ModelCFoundation_normHeader_(h)];
      if(c===undefined)return;
      textDateColumns.push(c);
      for(var r=1;r<values.length;r++){
        var v=values[r][c];
        if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))values[r][c]=Utilities.formatDate(v,tz,'yyyy-MM-dd');
        else if(v!==''&&v!==null&&v!==undefined)values[r][c]=ModelCFoundation_clean_(v);
      }
    });
  }
  return{range:range,values:values,numberFormats:numberFormats,sheet:sheet,textDateColumns:textDateColumns};
}

function ModelCScopeOwner_restoreSnapshot_(snap){
  if(!snap||!snap.sheet||!snap.range)return;
  snap.sheet.clearContents();
  if(snap.numberFormats)snap.range.setNumberFormats(snap.numberFormats);
  (snap.textDateColumns||[]).forEach(function(c){if(snap.values.length>1)snap.sheet.getRange(2,c+1,snap.values.length-1,1).setNumberFormat('@');});
  snap.range.setValues(snap.values);
}
