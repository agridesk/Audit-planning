/***********************************************************************
 * AMS03_Phase6LifecycleReportingAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE6_LIFECYCLE_REPORTING_R1
 ***********************************************************************/
var AMS03_PHASE6_BUILD='2026-09-23_AMS03_PHASE6_LIFECYCLE_REPORTING_R1';
function RUN_AMS03_PHASE6_LIFECYCLE_REPORTING_ACCEPTANCE(){
 var d=getModelCLifecycleReportingV5({}),src=String(getModelCLifecycleReportingV5),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('liveReadSuccess',d&&d.success===true);
 q('companyScopesOwner',d&&d.meta&&d.meta.companyScopeOwner==='Company_Scopes');
 q('obligationsOwner',d&&d.meta&&d.meta.obligationOwner==='Audit_Obligations');
 q('visitLinksOwner',d&&d.meta&&d.meta.visitLinkOwner==='Audit_Visit_Obligations');
 q('dependenciesOwner',d&&d.meta&&d.meta.dependencyOwner==='Config_Scope_Dependencies');
 q('legacyProjectionOnly',d&&d.meta&&d.meta.legacyAuditPlanningProjectionOnly===true);
 q('expiryProjected',Array.isArray(d&&d.rows)&&d.rows.every(function(x){return Object.prototype.hasOwnProperty.call(x,'effectiveExpiryDate');}));
 q('planningWindowProjected',Array.isArray(d&&d.rows)&&d.rows.every(function(x){return Object.prototype.hasOwnProperty.call(x,'planningWindowFrom')&&Object.prototype.hasOwnProperty.call(x,'planningWindowTo');}));
 q('visitMembershipProjected',Array.isArray(d&&d.rows)&&d.rows.every(function(x){return Array.isArray(x.auditIds);}));
 q('sharedExpiryDependencyProjected',Array.isArray(d&&d.sharedExpiryDependencies));
 q('readOnlyNoWrites',src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0&&d.meta.writes===false);
 q('noNewSsot',d&&d.meta&&d.meta.newSsot===false);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS03_PHASE6_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,summary:d&&d.summary||{},performance:{totalMs:d&&d.meta&&d.meta.totalMs||0},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
