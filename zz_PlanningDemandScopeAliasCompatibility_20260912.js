/***********************************************************************
 * zz_PlanningDemandScopeAliasCompatibility_20260912.js
 * BUILD: 2026-09-12_PLANNING_DEMAND_SCOPE_ALIAS_COMPAT_R1
 *
 * Narrow compatibility for Planning Workspace demand scope filtering.
 * Keeps canonical scope display untouched while allowing common Tracecert
 * aliases entered in the Workspace scope filter.
 ***********************************************************************/
var PLANNING_DEMAND_SCOPE_ALIAS_COMPAT_BUILD='2026-09-12_PLANNING_DEMAND_SCOPE_ALIAS_COMPAT_R1';

function PDS_norm_(v){
  var s=String(v==null?'':v).trim().toLowerCase();
  var compact=s.replace(/[\s_\-]+/g,'');
  if(compact==='tracecert'||compact==='florimarktracecert'||compact==='florimarktracecet'||compact==='florimarktf')return'florimark tracecert';
  return s;
}

function PlanningDemandScopeAliasCompatibility_contract(){return{
  build:PLANNING_DEMAND_SCOPE_ALIAS_COMPAT_BUILD,
  aliases:['tracecert','Florimark Tracecert','Florimark Tracecet','FLORIMARK_TF'],
  canonical:'Florimark Tracecert',
  writes:false,
  newSsot:false
};}
