/**
 * AMS-01.6 Model C auditor active-grid projection bridge.
 * Archived rows remain owned by Log realized audits.
 */
var MODEL_C_AUDITOR_RUNTIME_BUILD='2026-09-21_AMS_01_6_MODEL_C_AUDITOR_RUNTIME_R2_CANONICAL_BRIDGE';

function AuditorV5_GetAuditorGrid(req){
  req=req||{};
  var view=String(req.view||'active').toLowerCase();
  var result=AuditorV5_GetAuditorGrid_U20409(req);
  if(view==='archived')return result;
  return ModelCAuditorProjection_applyToGrid_(result,auditorV5_getSs_());
}

function AuditorV5_GetAuditorGrid_ENRICHED(req){
  req=req||{};
  req.view=String(req.view||'active').toLowerCase();
  var result=AuditorV5_GetAuditorGrid_U20409(req);
  if(req.view==='archived')return result;
  return ModelCAuditorProjection_applyToGrid_(result,auditorV5_getSs_());
}

function AuditorV5B_GetAuditorGrid(mode,params){
  params=params||{};
  if(typeof mode==='string')params.view=mode;
  var view=String(params.view||'active').toLowerCase();
  var result=AuditorV5B_GetAuditorGrid_U20409(mode,params);
  if(view==='archived')return result;
  return ModelCAuditorProjection_applyToGrid_(result,auditorV5_getSs_());
}
