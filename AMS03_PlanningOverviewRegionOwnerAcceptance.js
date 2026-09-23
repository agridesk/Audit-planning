// BUILD: 2026-09-23_AMS03_PLANNING_OVERVIEW_REGION_OWNER_ACCEPTANCE_R1
function RUN_AMS03_PLANNING_OVERVIEW_REGION_OWNER_ACCEPTANCE(){
 var s=String(m5t_po_getCompanyRegionMap_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesProfilesOwner',s.indexOf('PlanningProfilesService_get')>=0);
 q('companiesIncluded',s.indexOf('includeCompanies:true')>=0);
 q('auditorsExcluded',s.indexOf('includeAuditors:false')>=0);
 q('noDirectCompaniesScan',s.indexOf("getSheetByName('Companies')")<0&&s.indexOf('getDataRange')<0);
 q('regionProjectionPreserved',s.indexOf('item.region')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PLANNING_OVERVIEW_REGION_OWNER_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{writes:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}