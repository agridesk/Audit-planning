/**
 * AMS-01.6 — read-only ECAS MPS-ABC staging coverage diagnostic.
 * Outputs the exact MPS-number set currently treated as the explicit annual
 * MPS-ABC batch source. No writes.
 */
var MODEL_C_ECAS_SOURCE_COVERAGE_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_SOURCE_COVERAGE_R1';

function RUN_MODEL_C_ECAS_SOURCE_COVERAGE(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName('BronBedrijfUrenScopes');
  if(!sh)throw new Error('Missing sheet: BronBedrijfUrenScopes');
  var year=String(sh.getRange('G1').getDisplayValue()||'').trim();
  var v=sh.getDataRange().getValues();
  if(v.length<2)throw new Error('BronBedrijfUrenScopes has no data rows');
  var map=ModelCFoundation_headerMap_(v[0]||[]);
  function col_(names){for(var i=0;i<names.length;i++){var k=ModelCFoundation_normHeader_(names[i]);if(map[k]!==undefined)return map[k];}return-1;}
  var ixMps=col_(['MPS-nummer','MPS nummer','MPS-number','MPS number']);
  var ixHours=col_(['Mandated time']);
  var ixServices=col_(['Services']);
  if(ixMps<0||ixHours<0||ixServices<0)throw new Error('Required source headers missing');

  var byMps={},physical=0,ignored=0,invalid=[];
  for(var r=1;r<v.length;r++){
    var mps=String(v[r][ixMps]||'').trim();if(!mps)continue;physical++;
    var service=String(v[r][ixServices]||'').trim().toUpperCase();
    var services=service.split(/[;,|]/).map(function(x){return x.trim();});
    if(service!=='MPS-ABC'&&services.indexOf('MPS-ABC')<0){ignored++;continue;}
    var hours=Number(String(v[r][ixHours]===null||v[r][ixHours]===undefined?'':v[r][ixHours]).replace(',','.'));
    if(!isFinite(hours)||hours<=0){invalid.push({row:r+1,mpsNumber:mps,mandatedTime:v[r][ixHours]});continue;}
    if(!byMps[mps])byMps[mps]={mpsNumber:mps,mandatedHours:hours,rows:[r+1]};
    else byMps[mps].rows.push(r+1);
  }
  var items=Object.keys(byMps).sort().map(function(k){return byMps[k];});
  var out={success:invalid.length===0,build:MODEL_C_ECAS_SOURCE_COVERAGE_BUILD,readOnly:true,writesPerformed:false,batchYear:year,counts:{physicalRows:physical,mpsAbcRows:items.length,ignoredOtherServiceRows:ignored,invalidRows:invalid.length},mpsNumbers:items.map(function(x){return x.mpsNumber;}),items:items,invalid:invalid};
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ECAS source coverage contains invalid rows');
  return out;
}
