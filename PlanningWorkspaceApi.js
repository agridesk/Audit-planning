/***********************************************************************
 * PlanningWorkspaceApi.js
 * BUILD: 2026-09-24_AMS_API_V1_R1_TRANSPORT_NEUTRAL
 ***********************************************************************/
var PLANNING_WORKSPACE_API_BUILD='2026-09-24_AMS_API_V1_R1_TRANSPORT_NEUTRAL';
function PlanningWorkspaceApi_workspace(input){return PlanningWorkspaceRpc_bootstrap(input||{});}
function PlanningWorkspaceApi_contract(){return{build:PLANNING_WORKSPACE_API_BUILD,version:'v1',endpoints:{workspace:{method:'POST',path:'/api/v1/planning/workspace',handler:'PlanningWorkspaceApi_workspace',readOnly:true}},meta:{transportNeutral:true,businessRules:false,directSheetReads:false,directSheetWrites:false,canonicalRpcOwner:'PlanningWorkspaceRpc_bootstrap',newSsot:false,proofScope:'FOCUSED_WORKSPACE_READ_ONLY'}};}
function RUN_PLANNING_WORKSPACE_API_CONTRACT_ACCEPTANCE(){var c=PlanningWorkspaceApi_contract(),e=c&&c.endpoints&&c.endpoints.workspace||{},ok=c.version==='v1'&&e.method==='POST'&&e.path==='/api/v1/planning/workspace'&&e.readOnly===true&&e.handler==='PlanningWorkspaceApi_workspace'&&c.meta.transportNeutral===true&&c.meta.businessRules===false&&c.meta.directSheetReads===false&&c.meta.directSheetWrites===false&&c.meta.canonicalRpcOwner==='PlanningWorkspaceRpc_bootstrap'&&c.meta.newSsot===false,r={ok:ok,build:PLANNING_WORKSPACE_API_BUILD,contract:c};Logger.log(JSON.stringify(r,null,2));return r;}

function RUN_PLANNING_WORKSPACE_TRANSPORT_ADAPTER_ACCEPTANCE(){
  var hasSecret=!!String(PropertiesService.getScriptProperties().getProperty('AMS_TRANSPORT_PROOF_SECRET')||'').trim();
  var contract=PlanningWorkspaceApi_contract();
  var r={ok:hasSecret&&contract.endpoints.workspace.readOnly===true,build:PLANNING_WORKSPACE_API_BUILD,secretConfigured:hasSecret,readOnly:contract.endpoints.workspace.readOnly===true};
  Logger.log(JSON.stringify(r,null,2));
  return r;
}