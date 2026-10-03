import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const managerHtml=read('./manager-portal.html');
const manager=read('./manager-portal.js');
const r10=read('./server-r10.js');
const auditor=read('../../AuditorPortalV5.html');
const auditorBackend=read('../../AuditorV5Backend.js');
const selection=read('../../Grid2SelectionService.js');
const handoff=read('../../zz_ExternalPlanningWorkspaceHandoff.js');
const workspaceEntry=read('../../zz_PlanningWorkspaceEntryRouteOverride.js');
const workspaceClient=read('../../PlanningWorkspaceClient.js.html');
const decision=read('../../PlanningWorkspaceDecisionReadModel.js');
const batch=read('../../BatchPlanningManagerApi.js');
const rpc=read('../../PlanningWorkspaceRpc.js');

assert.match(managerHtml,/id="selectionBar"/,'Manager must have contextual selection bar');
assert.match(managerHtml,/id="selectionBatch"[sS]*Batch plan/,'Manager selection bar must expose Batch plan');
assert.match(managerHtml,/id="selectionConcept"[sS]*Concept planning/,'Manager selection bar must expose Concept planning');
assert.match(managerHtml,/id="selectionExport"[sS]*Export/,'Manager selection bar must expose Export');
assert.match(managerHtml,/id="selectionClear"[sS]*Clear/,'Manager selection bar must expose Clear');
assert.match(manager,/var gridSelected=new Set()/,'Manager selection must be one shared local Set');
assert.match(manager,/id=\"gridSelectAll\"[sS]*Select all visible/,'Manager header must expose Select all visible');
assert.match(manager,/selectionSelectVisible(on)[sS]*gridVisibleIds.forEach/,'Manager Select all must use only currently rendered visible IDs');
assert.match(manager,/function selectionToggle(id,on)/,'Manager row selection must be local');
assert.doesNotMatch(manager,/function selectionToggle(id,on)[sS]{0,500}fetch(/,'Manager checkbox toggle must not call server');
assert.match(manager,/submitSelectionHandoff("batch")/,'Manager Batch must consume shared selected ID set');
assert.match(manager,/submitSelectionHandoff("concept")/,'Manager Concept must consume shared selected ID set');
assert.match(manager,/selectionRows()/,'Manager Export must consume shared selected ID set');
assert.match(r10,//api/v1/manager/selection-handoff/,'Manager selected planning handoff must be session-authenticated');
assert.match(r10,/PLANNING_SELECTION_OPEN/,'Manager selected planning handoff must be signed');
assert.match(r10,/crypto.createHash('sha256').update(idsJson)/,'Signed Manager handoff must bind selected Audit IDs');

assert.match(auditor,/id="audSelectAllVisible"/,'Auditor header must expose Select all visible');
assert.match(auditor,/id="audSelectionBar"/,'Auditor must have contextual selection bar');
assert.match(auditor,/id="btnSelectionBatch"[sS]*Batch plan/,'Auditor selection bar must expose Batch plan');
assert.match(auditor,/id="btnSelectionConcept"[sS]*Concept planning/,'Auditor selection bar must expose Concept planning');
assert.match(auditor,/id="btnSelectionExport"[sS]*Export/,'Auditor selection bar must expose Export');
assert.match(auditor,/id="btnSelectionClear"[sS]*Clear/,'Auditor selection bar must expose Clear');
assert.match(auditor,/let __AUDITOR_SELECTED_IDS = new Set()/,'Auditor must retain one shared local selection Set');
assert.match(auditor,/auditorUi_getVisibleAuditIds_().forEach(function(id){ __AUDITOR_SELECTED_IDS.add(id); })/,'Auditor Select all must select visible rows only');
assert.match(auditor,/AuditorV5_ValidateGridSelection(req)/,'Auditor Batch and Concept must backend-revalidate selection');
assert.match(auditor,/trustedToken:__AUDITOR_TOKEN/,'Auditor selection/export backend calls must carry authenticated token');
assert.match(auditorBackend,/function AuditorV5_ValidateGridSelection/,'Auditor backend selection validator endpoint must exist');
assert.match(auditorBackend,/V5_AUTH.validateTrustedTokenByRole(token,'Auditor',deviceId)/,'Auditor selection backend must authenticate actor');
assert.match(auditorBackend,/Auditor authentication required/,'Auditor selected export must fail closed without authentication');

assert.match(selection,/writesPerformed:false/,'Selection validation must be read-only');
assert.doesNotMatch(selection,/setValue|setValues|appendRow|insertRow|deleteRow/,'Selection validator must not write Sheets');
assert.match(selection,/SELF_PLANNING_NOT_ALLOWED/,'Auditor selection must revalidate Allow self planning');
assert.match(selection,/NOT_PREASSIGNED_TO_AUDITOR/,'Auditor selection must revalidate preassignment');
assert.match(selection,/STATUS_NOT_PENDING_PLANNING/,'Auditor Batch Concept must revalidate Pending Planning');
assert.match(selection,/ALREADY_ASSIGNED/,'Auditor Batch Concept must reject already assigned rows');
assert.match(selection,/periodFrom/,'Selection validator must derive selected planning period without writes');

assert.match(handoff,/ExternalPlanningWorkspaceHandoff_selectionPayload_/,'External Manager selection must use signed selection handoff');
assert.match(handoff,/Grid2Selection_validate({auditIds:selectedAuditIds,actorRole:'Manager'/,'Manager selection must be backend-revalidated before Workspace');
assert.match(handoff,/selectedAuditIds:selectedAuditIds/,'Workspace handoff must carry selected IDs');
assert.match(workspaceEntry,/Grid2Selection_validate({auditIds:validSelected,actorRole:expectedRole/,'Auditor Workspace entry must revalidate selected IDs again');
assert.match(decision,/else if(selectedIds.length)rows=rows.filter/,'Planning Workspace read model must restrict demand rows to explicit selected set');
assert.match(workspaceClient,/function applyEntrySelection()/,'Planning Workspace must seed its existing batch selector from Grid selection');
assert.match(workspaceClient,/state.selected={};state.selectionOrder=[]/,'Grid handoff must feed the existing Workspace selection mechanism');
assert.match(batch,/auditIds:Array.isArray(input.auditIds)/,'Batch optimizer must accept explicit Audit ID start set');
assert.match(batch,/writesPerformed:false/,'Batch proposal generation must remain read-only');
assert.match(rpc,/function PlanningWorkspaceRpc_generateBatchConcept/,'Selected Batch generation must use browser-facing Workspace RPC');
assert.match(rpc,/PWR_validateSelectedAuditorIds_\(input,'batch'\)/,'Auditor Batch generation must revalidate self-planning selection server-side');
assert.match(rpc,/Grid2Selection_validate\(\{auditIds:ids,actorRole:'Manager',actorEmail:actor,action:'batch'\}\)/,'Manager Batch generation must revalidate selected IDs at action time');
assert.match(rpc,/V5_AUTH\.validateTrustedTokenByRole\(token,'Auditor',deviceId\)/,'Auditor Workspace batch actions must authenticate trusted token');
assert.match(rpc,/function PWR_scopeConceptBatch_/,'Auditor batch concept persistence must be role-scoped');
assert.match(rpc,/PWR_validateSelectedAuditorIds_\(authInput,'concept'\)/,'Auditor batch concept persistence must revalidate selected audits');
assert.match(workspaceClient,/PlanningWorkspaceRpc_generateBatchConcept\(payload\)/,'Workspace client must not call unrestricted Batch generator directly');
assert.doesNotMatch(workspaceClient,/\.getBatchPlanningConceptV5\(/,'Workspace browser must not call unrestricted Batch generator directly');
assert.match(workspaceClient,/trustedToken:rq\.trustedToken/,'Auditor concept batch save must carry authenticated context');


console.log('Grid 2.0 shared multi-selection contract test passed');
