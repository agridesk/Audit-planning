/***********************************************************************
 * zz_EligibilityBatchReadModelTracecertScopeAware_20260912.js
 * BUILD: 2026-09-12_ELIGIBILITY_BATCH_SCOPE_AWARE_R1
 *
 * Narrow override of EligibilityBatchReadModel_get so cache build validity
 * can distinguish Tracecert rows from unrelated scopes. Read-only; same
 * single batch read contract as canonical R3.
 ***********************************************************************/
var ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD='2026-09-12_ELIGIBILITY_BATCH_SCOPE_AWARE_R1';

function EligibilityBatchReadModel_get(input){
  input=input||{};
  var requested=EBRM_requestedSet_(input);
  var perf=(typeof DPL_start_==='function')?DPL_start_('EligibilityBatchReadModel_get',{requestedAuditIds:requested?Object.keys(requested).length:0}):null;
  var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Eligibility_Cache');
  if(!sh){var missing={success:true,build:ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD,rows:[],byAuditId:{},meta:{sourceRows:0,returned:0,missingSheet:true,writes:false,canonicalOwner:'EligibilityService',cacheRole:'derived acceleration only',scopeAwareBuildCompatibility:true}};if(typeof DPL_end_==='function')missing.devPerformance=DPL_end_(perf,{returned:0,missingSheet:true});return missing;}
  var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
  if(lastCol<1){var empty={success:true,build:ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD,rows:[],byAuditId:{},meta:{sourceRows:0,returned:0,writes:false,canonicalOwner:'EligibilityService',cacheRole:'derived acceleration only',scopeAwareBuildCompatibility:true}};if(typeof DPL_end_==='function')empty.devPerformance=DPL_end_(perf,{returned:0});return empty;}

  var headers=sh.getRange(1,1,1,lastCol).getValues()[0]||[];
  var cAuditId=EBRM_findCol_(headers,['Audit_ID','Audit ID']),cCompanyUid=EBRM_findCol_(headers,['Company_UID','Company UID']),cA1=EBRM_findCol_(headers,['Eligible_Auditors_JSON']),cA2=EBRM_findCol_(headers,['Eligible_Auditors_JSON_2']),cA3=EBRM_findCol_(headers,['Eligible_Auditors_JSON_3']),cA4=EBRM_findCol_(headers,['Eligible_Auditors_JSON_4']),cMeta=EBRM_findCol_(headers,['Eligibility_Meta_JSON']),cComputedAt=EBRM_findCol_(headers,['Computed_At']),cComputedBuild=EBRM_findCol_(headers,['Computed_Build']),cStale=EBRM_findCol_(headers,['Stale']),cScopesHash=EBRM_findCol_(headers,['Scopes_Hash']),cSourceHash=EBRM_findCol_(headers,['Source_Mtime_Hash']),cNotes=EBRM_findCol_(headers,['Notes']);
  if(cAuditId<0)throw new Error("EligibilityBatchReadModel: missing 'Audit_ID' column");
  var used=[cAuditId,cCompanyUid,cA1,cA2,cA3,cA4,cMeta,cComputedAt,cComputedBuild,cStale,cScopesHash,cSourceHash,cNotes].filter(function(x){return x>=0});
  var maxCol=used.length?Math.max.apply(null,used)+1:lastCol;
  var values=lastRow>=2?sh.getRange(2,1,lastRow-1,maxCol).getValues():[];
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'bulkRead',{rows:values.length,cols:maxCol});

  var currentBuild=EBRM_currentEligibilityBuild_(),currentGeneration=EBRM_currentAuditorScopeGeneration_();
  var rows=[],byAuditId={},staleCount=0,parseErrors=0,buildMismatchCount=0,generationMismatchCount=0,refreshRequiredCount=0,legacyEquivalentCount=0;
  for(var r=0;r<values.length;r++){
    var row=values[r]||[],auditId=EBRM_clean_(row[cAuditId]);if(!auditId)continue;if(requested&&!requested[auditId])continue;
    var auditorsRaw=EBRM_joinChunks_(row,[cA1,cA2,cA3,cA4]),auditorsPayload=EBRM_normalizeAuditorsPayload_(auditorsRaw),metaRaw=cMeta>=0?EBRM_clean_(row[cMeta]):'',metaPayload=EBRM_normalizeMetaPayload_(metaRaw);
    if(!auditorsPayload.ok)parseErrors++;if(!metaPayload.ok)parseErrors++;
    var stale=cStale>=0?EBRM_bool_(row[cStale]):false;if(stale)staleCount++;
    var computedBuild=cComputedBuild>=0?EBRM_clean_(row[cComputedBuild]):'',notes=cNotes>=0?EBRM_clean_(row[cNotes]):'';
    var validity=EBRM_cacheValidity_({computedBuild:computedBuild,currentBuild:currentBuild,notes:notes,currentGeneration:currentGeneration,requiredScopes:metaPayload.requiredScopes});
    if(validity.buildMismatch)buildMismatchCount++;else if(computedBuild!==currentBuild&&validity.buildEquivalent)legacyEquivalentCount++;
    if(validity.generationMismatch)generationMismatchCount++;
    var requiresRefresh=stale||!auditorsRaw||!auditorsPayload.ok||!metaPayload.ok||!validity.validByEligibilityServiceSheetContract;if(requiresRefresh)refreshRequiredCount++;
    var refreshReasons=validity.reasons.slice();if(stale)refreshReasons.push('STALE');if(!auditorsRaw)refreshReasons.push('AUDITORS_PAYLOAD_MISSING');if(!auditorsPayload.ok)refreshReasons.push('AUDITORS_PAYLOAD_INVALID');if(!metaPayload.ok)refreshReasons.push('META_PAYLOAD_INVALID');
    var rec={auditId:auditId,companyUid:cCompanyUid>=0?EBRM_clean_(row[cCompanyUid]):'',auditors:auditorsPayload.auditors,eligibilityMeta:metaPayload.meta,requiredScopes:metaPayload.requiredScopes,scopesRes:metaPayload.scopesRes,computedAt:cComputedAt>=0?EBRM_clean_(row[cComputedAt]):'',computedBuild:computedBuild,currentEligibilityBuild:currentBuild,stale:stale,scopesHash:cScopesHash>=0?EBRM_clean_(row[cScopesHash]):'',sourceMtimeHash:cSourceHash>=0?EBRM_clean_(row[cSourceHash]):'',notes:notes,auditorScopeGeneration:currentGeneration,cacheValidity:validity,requiresCanonicalRefresh:requiresRefresh,refreshReasons:refreshReasons,sourceRow:r+2};
    rows.push(rec);byAuditId[auditId]=rec;
  }
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'filterProject',{returned:rows.length,stale:staleCount,parseErrors:parseErrors,buildMismatch:buildMismatchCount,generationMismatch:generationMismatchCount,refreshRequired:refreshRequiredCount,legacyEquivalent:legacyEquivalentCount});
  var requestedIds=requested?Object.keys(requested):[],missingIds=[];for(var i=0;i<requestedIds.length;i++)if(!byAuditId[requestedIds[i]])missingIds.push(requestedIds[i]);
  var result={success:true,build:ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD,rows:rows,byAuditId:byAuditId,missingAuditIds:missingIds,meta:{sourceRows:values.length,returned:rows.length,requested:requestedIds.length,missing:missingIds.length,stale:staleCount,parseErrors:parseErrors,buildMismatch:buildMismatchCount,generationMismatch:generationMismatchCount,refreshRequired:refreshRequiredCount,legacyEquivalent:legacyEquivalentCount,currentEligibilityBuild:currentBuild,auditorScopeGeneration:currentGeneration,columnsRead:maxCol,writes:false,canonicalOwner:'EligibilityService',cacheRole:'derived acceleration only',cacheValidityContract:'EligibilityService sheet acceptance + scope-aware Tracecert compatibility',scopeAwareBuildCompatibility:true}};
  if(typeof DPL_end_==='function')result.devPerformance=DPL_end_(perf,{returned:rows.length,missing:missingIds.length,stale:staleCount,parseErrors:parseErrors,buildMismatch:buildMismatchCount,generationMismatch:generationMismatchCount,refreshRequired:refreshRequiredCount,legacyEquivalent:legacyEquivalentCount});
  return result;
}
