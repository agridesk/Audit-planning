/** FILE: BatchPlanningSchedulerDiagnosticsTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_SCHEDULER_DIAGNOSTICS_R1
 * RUN: RUN_BATCH_PLANNING_SCHEDULER_DIAGNOSTICS
 * Read-only diagnostic for the current selected Odemira/Leen scenario.
 */
function RUN_BATCH_PLANNING_SCHEDULER_DIAGNOSTICS(){
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Audit planning'),v=sh.getDataRange().getValues(),h=v[0],idx={};h.forEach(function(x,i){idx[String(x||'').trim()]=i;});
 function val(row,names){for(var i=0;i<names.length;i++)if(idx[names[i]]!=null)return row[idx[names[i]]];return'';}
 var wanted=['Praiaplanta','Buijnink International, Unipessoal Lda','Koppe Young Plants Portugal'],ids=[],rows=[];
 for(var r=1;r<v.length;r++){var company=String(val(v[r],['Company'])||'').trim();if(wanted.indexOf(company)<0)continue;var id=String(val(v[r],['Audit ID'])||'').trim();if(id){ids.push(id);rows.push({auditId:id,company:company,status:String(val(v[r],['Status'])||''),hours:val(v[r],['Total audit time in hours','Total audit time (hours)','Total audit time']),windowFrom:val(v[r],['Planning window from']),windowTo:val(v[r],['Planning window to'])});}}
 var out=getBatchPlanningConceptV5({auditorEmail:'leen@agriqa.es',periodFrom:'2026-10-12',periodTo:'2026-10-15',auditIds:ids,forceFreshRoutes:false}),diag={ok:!!(out&&out.ok),build:'2026-09-19_BATCH_PLANNING_SCHEDULER_DIAGNOSTICS_R1',requested:rows,candidateCount:out&&out.candidateCount,routedCandidateCount:out&&out.routedCandidateCount,rejected:out&&out.rejected||[],unresolved:out&&out.unresolved||[],pendingPlannerAllocation:out&&out.pendingPlannerAllocation||[],reservations:out&&out.conceptReservations||[],days:(out&&out.days||[]).map(function(d){return{date:d.date,auditHours:d.auditHours,conceptAudits:(d.conceptAudits||[]).map(function(a){return{auditId:a.auditId,company:a.company,hours:a.hours,start:a.startTime,end:a.endTime};})};}),meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,externalApiCallsMayUseCache:true}};console.info(JSON.stringify(diag,null,2));return diag;
}