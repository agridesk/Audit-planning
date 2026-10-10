(function(){
"use strict";
var all=[];
var currentView="open";
var openCounts={total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0};
var busyAudits=new Set();
var enrichmentSeq=0;
var completeDialogAuditId="";
var realizedDialogAuditId="";
var gridSelected=new Set();
var gridVisibleIds=[];
var relay={frame:null,nonce:'',source:null,origin:'',ready:false,error:'',initPromise:null,readyResolver:null,pending:new Map(),seq:0};
var actorRole="Manager";

function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function selectionIds(){return Array.from(gridSelected)}
function selectionClear(){gridSelected.clear();updateSelectionUi()}
function selectionToggle(id,on){id=String(id||"").trim();if(!id)return;if(on)gridSelected.add(id);else gridSelected.delete(id);updateSelectionUi()}
function selectionSelectVisible(on){gridVisibleIds.forEach(function(id){if(on)gridSelected.add(id);else gridSelected.delete(id)});updateSelectionUi()}
function updateSelectionUi(){
  gridVisibleIds=Array.from(document.querySelectorAll('#rows tr[data-audit-id]')).map(function(tr){return String(tr.getAttribute('data-audit-id')||'')}).filter(Boolean);
  document.querySelectorAll(".grid-select-row").forEach(function(cb){cb.checked=gridSelected.has(String(cb.getAttribute("data-audit-id")||""))});
  var head=document.getElementById("gridSelectAll"),visible=gridVisibleIds.filter(function(id){return gridSelected.has(id)}).length;
  if(head){head.checked=gridVisibleIds.length>0&&visible===gridVisibleIds.length;head.indeterminate=visible>0&&visible<gridVisibleIds.length}
  var n=gridSelected.size,bar=document.getElementById("selectionBar"),lab=document.getElementById("selectionCount"),batch=document.getElementById("selectionBatch"),concept=document.getElementById("selectionConcept");
  if(lab)lab.textContent=n+" selected";if(bar)bar.classList.toggle("visible",n>0);
  var auditorMode=String(actorRole).toLowerCase()==="auditor";
  if(batch)batch.style.display=currentView==="open"&&!auditorMode?"":"none";
  if(concept)concept.style.display=currentView==="open"&&!auditorMode?"":"none";
}
function bindSelectionControls(root){
  (root||document).querySelectorAll(".grid-select-row").forEach(function(cb){cb.addEventListener("change",function(){selectionToggle(cb.getAttribute("data-audit-id"),!!cb.checked)})});
  var h=document.getElementById("gridSelectAll");if(h)h.onchange=function(){selectionSelectVisible(!!h.checked)};
  updateSelectionUi();
}
function selectionRows(){var by={};all.forEach(function(r){if(r&&r.auditId)by[r.auditId]=r});return selectionIds().map(function(id){return by[id]}).filter(Boolean)}
function selectionExportHeaders(){return currentView==="completed"?["Company","Region","Scopes","Executed on","Auditor","Hours planned","Hours dedicated","Completed date","Status"]:["Company","Locations","Region","Scopes","Status","Expiration date","Planning window","Self planning","Date planned","To be planned","Hours planned","Auditor"]}
function selectionExportRows(){
  return selectionRows().map(function(r){return currentView==="completed"?[r.company,r.region,r.scopesText,r.executedOn,r.auditorDisplayName||r.auditorName||r.auditor,r.hoursPlanned,r.hoursDedicated,r.completedDate,r.status||"Completed"]:[r.company,locationText(r),r.region,r.scopesText,displayStatus(r.status),compactDate(effectiveExpiry(r)),r.planningWindowText||([r.planningWindowFrom,r.planningWindowTo].filter(Boolean).join(" → ")),r.allowSelfPlanning===true||String(r.allowSelfPlanning).toLowerCase()==="true"?"Yes":"No",compactDate(r.datePlanned),r.requiredHours,r.hoursPlanned,r.assignedToDisplayName||r.auditorDisplayName||r.assignedTo||r.auditor]})
}
function selectionExcel(){
  var headers=selectionExportHeaders(),rows=selectionExportRows();if(!rows.length)return;
  var table="<table><thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return"<tr>"+r.map(function(v){return"<td>"+esc(v==null?"":v)+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table>";
  var blob=new Blob(["\ufeff<html><meta charset=utf-8><style>table{border-collapse:collapse;font-family:Arial;font-size:11pt}th,td{border:1px solid #ccc;padding:5px}</style>"+table+"</html>"],{type:"application/vnd.ms-excel;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Manager_selected_audits.xls";a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)
}
function selectionPdf(){
  var headers=selectionExportHeaders(),rows=selectionExportRows();if(!rows.length)return;
  var w=window.open("","_blank");if(!w)return;w.document.write("<!doctype html><title>Selected audits</title><style>body{font-family:Arial;font-size:10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px;text-align:left}@media print{@page{size:landscape}}</style><h2>Selected audits</h2><table><thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return"<tr>"+r.map(function(v){return"<td>"+esc(v==null?"":v)+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table>");w.document.close();setTimeout(function(){w.focus();w.print()},150)
}
function submitSelectionHandoff(mode){
  var ids=selectionIds();if(!ids.length)return;
  fetch("/api/v1/manager/selection-handoff",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({auditIds:ids,mode:mode})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||"Selection handoff failed");return x})})
    .then(function(x){var form=document.createElement("form");form.method="POST";form.action=x.url;form.target="_blank";Object.keys(x.fields||{}).forEach(function(k){var i=document.createElement("input");i.type="hidden";i.name=k;i.value=String(x.fields[k]||"");form.appendChild(i)});document.body.appendChild(form);form.submit();form.remove()})
    .catch(function(e){window.alert("Selection action failed: "+e.message)})
}

function text(v){return v==null||v===""?"-":String(v)}
function displayStatus(v){var s=String(v==null?"":v).trim().toLowerCase();return s==="approved"?"Pending acceptance":text(v)}
function hoursClass(expected,actual){var e=Number(expected),a=Number(actual);if(!isFinite(e)||!isFinite(a))return "";if(Math.abs(a-e)<0.001)return "hours-match";return a<e?"hours-under":"hours-over"}
function hoursPlannedCell(r){return esc(text(r.hoursPlanned))}
function planningBlocks(r){var raw=r&&r.planningJson,j=raw;if(!raw)return[];if(typeof raw==="string"){try{j=JSON.parse(raw)}catch(e){return[]}}var a=Array.isArray(j)?j:(j&&Array.isArray(j.blocks)?j.blocks:[]);return a.filter(function(b){return b&&b.date&&b.start&&b.end}).map(function(b){return{date:String(b.date).slice(0,10),start:String(b.start),end:String(b.end),slotComment:String(b.slotComment||b.comment||"").trim(),executionType:String(b.executionType||b.workType||"ONSITE").toUpperCase(),execLoc:String(b.execLoc||b.executionLocation||b.location||"").trim()}})}
function plannedDateCell(r){var bs=planningBlocks(r),first=bs.length?bs[0].date:String(r.datePlanned||"");if(!first)return esc(text(""));var tip=bs.map(function(b){var line=b.date+" "+b.start+"–"+b.end;if(b.slotComment)line+=" · "+b.slotComment;return line}).join("\n"),multi=bs.length>1?' <span class="multi-day-icon"'+(tip?' title="'+esc(tip)+'"':'')+' aria-label="Multi-day audit">▦</span>':'';return"<span class=\"planned-date\""+(tip?" title=\""+esc(tip)+"\"":"")+">"+esc(first)+"</span>"+multi}
function bucketKey(statusKey){return statusKey==="PENDING_PLANNING"?"pendingPlanning":statusKey==="PENDING_APPROVAL"?"pendingApproval":statusKey==="APPROVED"?"approved":statusKey==="ACCEPTED"?"accepted":""}
function expectedStatus(action){return action==="cancel"?"PENDING_PLANNING":action==="reject"?"REJECTED":action==="approve"?"ACCEPTED":""}
function latestCommentText(r){if(!r.latestComment)return "";var actor=r.latestCommentActor||"",action=r.latestCommentAction||"";return (actor?actor+(action?" · "+action:"")+": ":"")+r.latestComment}
function compactDate(v){var s=String(v==null?"":v).trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+"-"+m[2]+"-"+m[1]:s}
function effectiveExpiry(r){return r.effectiveExpiry||r.expiryEffective||(r.extensionApplied||r.extApplied?r.expiryZ:r.expiryY)||r.expirationDate||r.expiry||""}
function locationText(r){var x=r.locationsToPlan||r.locs||r.locations||r.locationCount||r.location||r.companyLocation||"";if(Array.isArray(x))return x.map(function(z){return typeof z==="string"?z:(z&&z.label)||""}).filter(Boolean).join(", ");if(typeof x==="object"&&x){if(Array.isArray(x.locations))return x.locations.map(function(z){return z.label||z.location||z.name||""}).filter(Boolean).join(", ");return x.label||x.location||x.name||""}return String(x||"")}
function gpsValue(r){var lat=r.lat!=null?r.lat:r.latitude,lon=r.lon!=null?r.lon:(r.lng!=null?r.lng:r.longitude);if(lat!==undefined&&lat!==null&&String(lat).trim()!==""&&lon!==undefined&&lon!==null&&String(lon).trim()!=="")return String(lat)+","+String(lon);var g=r.gps||r.gpsData||r.coordinates||"";if(typeof g==="object"&&g){if(g.lat!=null&&g.lng!=null)return String(g.lat)+","+String(g.lng);if(g.lat!=null&&g.lon!=null)return String(g.lat)+","+String(g.lon);if(g.latitude!=null&&g.longitude!=null)return String(g.latitude)+","+String(g.longitude);if(g.url)return String(g.url)}return String(g||"").trim()}
function mapCell(r){var g=gpsValue(r);if(!g)return "<td class=\"map-cell muted\">-</td>";var href=/^https?:\/\//i.test(g)?g:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(g);return "<td class=\"map-cell\"><a class=\"map-link\" href=\""+esc(href)+"\" target=\"_blank\" rel=\"noopener\" title=\"Open headquarters in Google Maps\" aria-label=\"Open headquarters in Google Maps\">Map</a></td>"}
function planning2Cell(r){var bits=["<a class=\"workspace-link\" target=\"_blank\" rel=\"opener\" href=\"/planning?auditId="+encodeURIComponent(r.auditId||"")+"\" title=\"Open this audit in Single Planning 2.0\">Open</a>"];if(r.conceptMonth)bits.push("<span class=\"planning-chip concept\" title=\"Concept only — not committed\">Concept "+esc(r.conceptMonth)+"</span>");var p=Number(r.provisionalReservationCount||0),c=Number(r.confirmedReservationCount||0);if(p>0)bits.push("<span class=\"planning-chip provisional\" title=\"Provisional workload — not committed planning\">Provisional"+(p>1?" ×"+p:"")+"</span>");if(c>0)bits.push("<span class=\"planning-chip reservation\" title=\"Reservation context — separate from committed planning\">Reserved"+(c>1?" ×"+c:"")+"</span>");return bits.join(" ")}
function eligibilityConflictText(r){var reason=String(r.eligibilityConflictReason||""),to=String(r.planningWindowTo||"").slice(0,10),today=new Date().toISOString().slice(0,10);if(to&&to<today)return "Planning window expired · ended "+compactDate(to);if(reason.indexOf("MINIMUM_INTERVAL_OUTSIDE_PLANNING_WINDOW")>=0)return "No valid execution date in this planning window · minimum interval";if(reason.indexOf("AUDITOR_NOT_HARD_QUALIFIED")>=0)return "Auditor is not currently qualified for this audit";if(reason.indexOf("AUDITOR_EXCLUDED_FOR_COMPANY")>=0)return "Auditor is excluded for this company";if(reason.indexOf("ROTATION")>=0)return "Rotation restriction blocks this auditor";return reason||"Preassigned auditor is not eligible to plan this audit."}
function alertCell(r){if(r.preassignmentConflict){var conflict=eligibilityConflictText(r);return "<td class=\"alert-cell\"><span class=\"alert-icon alert-critical\" title=\""+esc(conflict)+"\" aria-label=\""+esc(conflict)+"\" tabindex=\"0\">!</span></td>"}if(!r.latestComment)return "<td class=\"alert-cell\"></td>";var action=String(r.latestCommentAction||"").toUpperCase(),cls=action==="REJECT"?"alert-icon alert-critical":"alert-icon alert-info",title=(r.latestCommentTimestamp?String(r.latestCommentTimestamp)+" · ":"")+latestCommentText(r);return "<td class=\"alert-cell\"><span class=\""+cls+"\" title=\""+esc(title)+"\" aria-label=\""+esc(title)+"\" tabindex=\"0\">!</span></td>"}
function renderCards(){var c=openCounts||{};document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("")}
function adjustCounters(beforeKey,afterKey){if(beforeKey===afterKey)return;var b=bucketKey(beforeKey),a=bucketKey(afterKey);if(b)openCounts[b]=Math.max(0,Number(openCounts[b]||0)-1);if(a)openCounts[a]=Number(openCounts[a]||0)+1;if(b&&!a)openCounts.total=Math.max(0,Number(openCounts.total||0)-1);if(!b&&a)openCounts.total=Number(openCounts.total||0)+1;renderCards()}
function renderHead(){var h=document.getElementById("gridHead");if(!h)return;var sel="<th class=\"select-head\"><input id=\"gridSelectAll\" type=\"checkbox\" aria-label=\"Select all visible\"></th>";if(currentView==="completed")h.innerHTML="<tr>"+sel+"<th>Company</th><th>Region</th><th>Scopes</th><th>Executed on</th><th class=\"auditor-head\">Auditor</th><th>Hours planned</th><th>Hours dedicated</th><th>Completed date</th><th>Status</th><th>Actions</th></tr>";else h.innerHTML="<tr>"+sel+"<th>Company</th><th class=\"locations-head\">Locations</th><th class=\"region-head\">Region</th><th class=\"map-head\">GPS / Map</th><th>Scopes</th><th>Status</th><th class=\"expiry-head\">Expiration date</th><th>Planning window</th><th class=\"self-head\">Self planning</th><th>Date planned</th><th class=\"required-head\">To be planned</th><th>Hours planned</th><th class=\"auditor-head\">Auditor</th><th class=\"alert-head\">Alert</th><th>Actions</th></tr>"}
function extensionControls(r){if(String(actorRole).toLowerCase()==="auditor")return "";var months=Number(r.extensionMonths||r.extMonths||0),applied=!!(r.extensionApplied||r.extApplied),pending=r.statusKey==="PENDING_PLANNING",can=!!r.canExtend;if(!pending)return "";if(applied&&can)return " <button class=\"ext-act ext-undo\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"undo\" title=\"Undo applied extension\" aria-label=\"Undo applied extension\">&#8634;</button>";if(!can||months<=0)return "";return " <button class=\"ext-act ext-apply\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"apply\" title=\"Apply extension (+"+esc(months)+" months)\" aria-label=\"Apply extension\">+</button>"}
function renderOpenRow(r){var raw=r.allowedActions||[],ui=[];if(String(actorRole).toLowerCase()==="auditor")raw=raw.filter(function(x){return x==="PLAN"||x==="COMPLETE"});if(raw.indexOf("PLAN")>=0)ui.push({key:"plan",label:"Plan"});if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});if(raw.indexOf("ACCEPT")>=0)ui.push({key:"accept",label:"Accept"});if(raw.indexOf("COMPLETE")>=0)ui.push({key:"complete",label:"Complete"});if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});var actions=ui.map(function(a){return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>"}).join(""),formalClass=hoursClass(r.requiredHours,r.hoursPlanned),loc=locationText(r),self=r.allowSelfPlanning===true||String(r.allowSelfPlanning).toLowerCase()==="true"?"Yes":"No",windowText=r.planningWindowText||([r.planningWindowFrom,r.planningWindowTo].filter(Boolean).join(" → "));return "<tr data-audit-id=\""+esc(r.auditId)+"\"><td class=\"select-cell\"><input type=\"checkbox\" class=\"grid-select-row\" data-audit-id=\""+esc(r.auditId)+"\" "+(gridSelected.has(String(r.auditId||""))?"checked":"")+"></td><td class=\"company-cell\">"+esc(text(r.company))+"</td><td class=\"locations-cell\" title=\""+esc(loc)+"\">"+esc(text(loc))+"</td><td class=\"region-cell\">"+esc(text(r.region))+"</td>"+mapCell(r)+"<td class=\"scopes-cell\">"+esc(text(r.scopesText))+"</td><td>"+esc(displayStatus(r.status))+"</td><td class=\"expiry-cell\">"+esc(text(compactDate(effectiveExpiry(r))))+"</td><td class=\"window-cell\"><span>"+esc(text(windowText))+"</span>"+extensionControls(r)+"</td><td class=\"self-cell\">"+self+"</td><td>"+plannedDateCell(r)+"</td><td class=\"required-cell\">"+esc(text(r.requiredHours))+"</td><td class=\""+formalClass+"\">"+hoursPlannedCell(r)+"</td><td class=\"auditor-cell\">"+esc(text(r.assignedToDisplayName||r.auditorDisplayName||r.assignedTo||r.auditor))+"</td>"+alertCell(r)+"<td class=\"actions-cell\">"+actions+"</td></tr>"}
function renderOpen(rows){return rows.map(renderOpenRow).join("")}
function renderCompleted(rows){return rows.map(function(r){var action=String(actorRole).toLowerCase()==="auditor"?"<span class=\"muted\">—</span>":"<button class=\"realized-act\" data-audit-id=\""+esc(r.auditId)+"\">Edit realized hours</button>";return "<tr data-audit-id=\""+esc(r.auditId)+"\"><td class=\"select-cell\"><input type=\"checkbox\" class=\"grid-select-row\" data-audit-id=\""+esc(r.auditId)+"\" "+(gridSelected.has(String(r.auditId||""))?"checked":"")+"></td><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(text(r.executedOn))+"</td><td class=\"auditor-cell\">"+esc(text(r.auditorDisplayName||r.auditorName||r.auditor))+"</td><td>"+esc(text(r.hoursPlanned))+"</td><td>"+esc(text(r.hoursDedicated))+"</td><td>"+esc(text(r.completedDate))+"</td><td>"+esc(text(r.status||"Completed"))+"</td><td>"+action+"</td></tr>"}).join("")}
function bindCompletedButtons(root){(root||document).querySelectorAll(".realized-act").forEach(function(button){button.addEventListener("click",function(){openRealizedDialog(button.getAttribute("data-audit-id"))})})}
function bindActionButtons(root){(root||document).querySelectorAll(".act").forEach(function(button){button.addEventListener("click",function(){runAction(button)})});(root||document).querySelectorAll(".ext-act").forEach(function(button){button.addEventListener("click",function(){runExtension(button)})})}
function render(rows){renderHead();gridVisibleIds=(rows||[]).map(function(r){return String(r.auditId||"")}).filter(Boolean);var body=document.getElementById("rows");if(!rows.length){body.innerHTML="<tr><td class=\"empty\" colspan=\""+(currentView==="completed"?"11":"16")+"\">No audits found</td></tr>";bindSelectionControls(body);return}body.innerHTML=currentView==="completed"?renderCompleted(rows):renderOpen(rows);if(currentView==="open")bindActionButtons(body);else bindCompletedButtons(body);bindSelectionControls(body)}
function replaceVisibleRow(auditId,row){var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(!tr)return;tr.outerHTML=renderOpenRow(row);var fresh=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(fresh){bindActionButtons(fresh);bindSelectionControls(fresh)}}
function mergeRowInPlace(auditId,patch){var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)return null;all[idx]=Object.assign({},all[idx],patch);replaceVisibleRow(auditId,all[idx]);return all[idx]}
function patchRowInPlace(auditId,patch,perf){var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)throw new Error("Audit row not found locally");var before=all[idx],after=Object.assign({},before,patch),beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();all[idx]=after;replaceVisibleRow(auditId,after);adjustCounters(beforeKey,after.statusKey);window.scrollTo(scrollX,scrollY);perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt);var timing="request "+perf.writeMs+" · GAS HTTP "+perf.gasHttpMs;if(perf.statusTotalMs!=null)timing+=" · status "+perf.statusTotalMs+" [load "+perf.statusLoadMs+" / core "+perf.statusCoreMs+" / notify "+perf.statusNotifyMs+"]";timing+=" · reread "+perf.rereadMs+" · patch "+perf.patchMs+(perf.canonicalRecovery?" · canonical recovery":"")+" · direct-gas-action";document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · action "+perf.totalMs+" ms ("+timing+")";console.info("[MANAGER_ACTION_TIMING]",perf)}
function rereadAudit(auditId,sourceRow){var url="/api/v1/manager/audit?auditId="+encodeURIComponent(auditId)+(sourceRow?"&sourceRow="+encodeURIComponent(sourceRow):"");return fetch(url,{credentials:'same-origin'}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Canonical reread failed');return x})})}
function rereadEnrichedAudit(auditId){return fetch('/api/v1/manager/open-enrichment',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditIds:[auditId]})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Canonical enriched reread failed');var row=x&&Array.isArray(x.rows)?x.rows[0]:null;if(!row)throw new Error('CANONICAL_ENRICHED_ROW_MISSING');return row})})}
function resetRelayWorker(){
  if(relay.frame&&relay.frame.parentNode)relay.frame.parentNode.removeChild(relay.frame);
  relay.frame=null;relay.nonce='';relay.source=null;relay.origin='';relay.ready=false;relay.error='';relay.initPromise=null;relay.readyResolver=null;
}
function initRelay(){
  if(relay.ready&&relay.source&&relay.nonce)return Promise.resolve(true);
  if(relay.initPromise)return relay.initPromise;
  relay.error='';
  relay.initPromise=fetch('/api/v1/manager/action-relay-url',{credentials:'same-origin'})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.detail||'Relay URL failed');return x})})
    .then(function(x){
      relay.nonce=String(x.nonce||'');
      if(!relay.nonce)throw new Error('ACTION_RELAY_NONCE_MISSING');
      return new Promise(function(resolve,reject){
        var f=document.createElement('iframe'),settled=false,timer=setTimeout(function(){
          if(settled)return;settled=true;relay.error='ACTION_RELAY_READY_TIMEOUT';reject(new Error(relay.error))
        },45000);
        relay.frame=f;
        relay.readyResolver=function(ok,error){
          if(settled)return;
          settled=true;clearTimeout(timer);
          if(ok)resolve(true);else reject(new Error(error||'ACTION_RELAY_INIT_FAILED'))
        };
        f.src=x.url;f.style.cssText='position:absolute;width:1px;height:1px;border:0;left:-9999px;top:-9999px';f.setAttribute('aria-hidden','true');
        document.body.appendChild(f)
      })
    })
    .catch(function(e){relay.error=String(e&&e.message?e.message:e);relay.initPromise=null;throw e});
  return relay.initPromise
}
window.addEventListener('message',function(ev){
  var msg=ev.data||{};
  if((msg.type==='AMS_PLANNING_SAVED'||msg.type==='PLANNING_SAVED_V5')&&msg.auditId){var auditId=String(msg.auditId||''),sx=window.scrollX,sy=window.scrollY,before=all.find(function(x){return x.auditId===auditId});if(!before)return;var beforeKey=before.statusKey,status=String(msg.newStatus||(String(actorRole).toLowerCase()==='auditor'?'Pending Approval':'Approved')),statusKey=status.toUpperCase().replace(/[\s-]+/g,'_'),patch={status:status,statusKey:statusKey,allowedActions:String(actorRole).toLowerCase()==='auditor'?[]:(statusKey==='APPROVED'?['ACCEPT','CANCEL','REJECT']:before.allowedActions),planningJson:msg.planningJson||before.planningJson,datePlanned:msg.datePlanned||before.datePlanned,hoursPlanned:msg.hoursPlanned,plannedHours:msg.hoursPlanned,assignedTo:msg.assignedTo||msg.auditorEmail||before.assignedTo,assignedToEmail:msg.assignedTo||msg.auditorEmail||before.assignedToEmail,assignedToDisplayName:msg.assignedToDisplayName||before.assignedToDisplayName,auditorDisplayName:msg.assignedToDisplayName||before.auditorDisplayName};mergeRowInPlace(auditId,patch);if(beforeKey&&statusKey&&beforeKey!==statusKey)adjustCounters(beforeKey,statusKey);window.scrollTo(sx,sy);document.getElementById('status').textContent=Number(openCounts.total||all.length)+' open audits · planning updated';if(String(actorRole).toLowerCase()!=='auditor')rereadAudit(auditId,before.sourceRow).then(function(row){if(!row||row.success===false)return;var keep=all.find(function(x){return x.auditId===auditId})||{};if(!row.planningJson&&keep.planningJson)row.planningJson=keep.planningJson;if(!row.datePlanned&&keep.datePlanned)row.datePlanned=keep.datePlanned;if((row.hoursPlanned===''||row.hoursPlanned==null)&&keep.hoursPlanned!=='')row.hoursPlanned=keep.hoursPlanned;mergeRowInPlace(auditId,row);window.scrollTo(sx,sy)}).catch(function(e){console.warn('[PLANNING_BACKGROUND_REREAD]',e)});return;}
  if(String(msg.nonce||'')!==String(relay.nonce||''))return;
  if(msg.type==='AMS_MANAGER_ACTION_RELAY_READY'){
    relay.ready=msg.success!==false;relay.error=relay.ready?'':String(msg.error||'ACTION_RELAY_INIT_FAILED');
    if(relay.ready){relay.source=ev.source;relay.origin=ev.origin;relay.initPromise=Promise.resolve(true)}
    if(relay.readyResolver){var fn=relay.readyResolver;relay.readyResolver=null;fn(relay.ready,relay.error)}
    return
  }
  if(msg.type!=='AMS_MANAGER_ACTION_RESULT')return;
  if(!relay.source||ev.source!==relay.source)return;
  var p=relay.pending.get(String(msg.requestId||''));if(!p)return;
  relay.pending.delete(String(msg.requestId||''));clearTimeout(p.timer);
  if(msg.success===false)p.reject(new Error(msg.error||msg.result&&msg.result.message||'Action failed'));
  else p.resolve({result:msg.result||{},relayElapsedMs:Number(msg.relayElapsedMs)||0,trace:msg.trace||{}})
});
function runActionViaWarmWorker(auditId,action,options){
  return initRelay().then(function(){
    if(!relay.ready||!relay.source||!relay.origin)throw new Error('ACTION_RELAY_NOT_READY');
    return new Promise(function(resolve,reject){
      var id='r'+Date.now()+'_'+(++relay.seq),timer=setTimeout(function(){relay.pending.delete(id);reject(new Error('ACTION_RELAY_TIMEOUT'))},30000);
      var clientSentAt=Date.now();
      relay.pending.set(id,{resolve:resolve,reject:reject,timer:timer,clientSentAt:clientSentAt});
      relay.source.postMessage({type:'AMS_MANAGER_ACTION',nonce:relay.nonce,requestId:id,auditId:auditId,action:action,options:options||{},clientSentAt:clientSentAt},relay.origin)
    })
  })
}
function runActionViaCloudRun(auditId,action,options){
  var started=performance.now();
  var endpoint=String(actorRole).toLowerCase()==='auditor'&&action==='complete'?'/api/v1/auditor/action':'/api/v1/manager/action';return fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,action:action,options:options||{}})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.detail||x.message||'Action failed');return{result:x,relayElapsedMs:Math.round(performance.now()-started),trace:{requestId:'cr'+Date.now()}}})})
}
function removeCompletedRowInPlace(auditId,perf){
  var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)return;
  var before=all[idx],beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
  all.splice(idx,1);gridSelected.delete(auditId);
  var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(tr)tr.remove();
  adjustCounters(beforeKey,'COMPLETED');window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt)
}
function removeRejectedRowInPlace(auditId,perf){
  var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)return;
  var before=all[idx],beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
  all.splice(idx,1);gridSelected.delete(auditId);
  var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(tr)tr.remove();
  adjustCounters(beforeKey,'REJECTED');updateSelectionUi();window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt)
}
function patchActionLikeV1(auditId,action,reason,result,perf){
  if(action==='complete'){
    var beforeIdx=all.findIndex(function(r){return r.auditId===auditId}),before=beforeIdx>=0?all[beforeIdx]:null,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
    if(beforeIdx>=0)all.splice(beforeIdx,1);gridSelected.delete(auditId);
    var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(tr)tr.remove();
    var successors=result&&Array.isArray(result.successorRows)?result.successorRows.filter(Boolean):[];
    successors.forEach(function(row){
      if(!row||!row.auditId||all.some(function(x){return x.auditId===row.auditId}))return;
      all.push(row)
    });
    if(before)adjustCounters(before.statusKey,'COMPLETED');
    successors.forEach(function(row){if(row&&row.statusKey==='PENDING_PLANNING'){openCounts.total=Number(openCounts.total||0)+1;openCounts.pendingPlanning=Number(openCounts.pendingPlanning||0)+1}});
    renderCards();
    if(currentView==='open'&&successors.length){
      var body=document.getElementById('rows');
      successors.forEach(function(row){
        if(!row||!row.auditId)return;
        var wrap=document.createElement('tbody');wrap.innerHTML=renderOpenRow(row);var fresh=wrap.firstElementChild;
        if(fresh){body.appendChild(fresh);bindActionButtons(fresh);bindSelectionControls(fresh)}
      })
    }
    updateSelectionUi();window.scrollTo(scrollX,scrollY);
    perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt);return
  }
  if(action==='reject'){removeRejectedRowInPlace(auditId,perf);return}
  var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)throw new Error('Audit row not found locally');
  var before=all[idx],after=Object.assign({},before),beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
  if(action==='approve'){
    after.status='Accepted';after.statusKey='ACCEPTED';after.allowedActions=['CANCEL','REJECT']
  }else if(action==='accept'){
    after.status='Accepted';after.statusKey='ACCEPTED';after.allowedActions=['CANCEL','REJECT']
  }else if(action==='cancel'){
    after.status='Pending Planning';after.statusKey='PENDING_PLANNING';after.allowedActions=['PLAN','REJECT'];
    after.auditor='';after.assigned='';after.assignedTo='';after.assignedToEmail='';after.datePlanned='';
    after.hoursPlanned='';after.plannedHours='';after.planningJson='';after.planningSummary=null;after.plannedDates=[];after.plannedTooltip='';
    after.managerComment=reason;after.managerDecision='CANCEL';after.latestComment=reason;after.latestCommentActor='Manager';after.latestCommentAction='CANCEL'
  }
  if(result&&result.sourceRevision)after.sourceRevision=result.sourceRevision;
  all[idx]=after;replaceVisibleRow(auditId,after);adjustCounters(beforeKey,after.statusKey);window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt)
}
function runAction(button){
  var auditId=button.getAttribute("data-audit-id"),action=button.getAttribute("data-action"),row=all.find(function(r){return r.auditId===auditId});
  if(busyAudits.has(auditId))return;
  if(action==="plan"){var w=window.open("/planning?auditId="+encodeURIComponent(auditId),"amsPlanning_"+auditId,"popup=yes,width=1500,height=920,resizable=yes,scrollbars=yes");if(!w)window.location.href="/planning?auditId="+encodeURIComponent(auditId);return}
  if(action==="complete"&&!button.getAttribute("data-complete-hours")){openCompleteDialog(auditId);return}
  var reason="";
  if(action==="cancel"||action==="reject"){
    reason=window.prompt((action==="cancel"?"Cancel":"Reject")+" audit "+auditId+"\nComment:");
    if(reason===null)return;reason=reason.trim();if(!reason){window.alert("Comment is required.");return}
  }else if(action!=="accept"&&action!=="complete"&&!window.confirm(action.toUpperCase()+" audit "+auditId+"?"))return;
  busyAudits.add(auditId);
  var tr=button.closest("tr");if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=true});
  var perf={auditId:auditId,action:action,startedAt:performance.now(),workerMs:0,gasMs:null,patchMs:0},wt=performance.now(),options={reason:reason,comment:reason,rowIndex:row&&row.sourceRow,expectedRevision:row&&row.sourceRevision};
  if(action==="complete")options.hoursDedicated=Number(button.getAttribute("data-complete-hours"));
  var actionPromise=(action==='approve'||action==='accept'||action==='cancel'||action==='reject'||action==='complete')?runActionViaCloudRun(auditId,action,options):runActionViaWarmWorker(auditId,action,options);
  actionPromise
    .then(function(x){
      perf.workerMs=Math.round(performance.now()-wt);
      var wr=x.result||{},gas=Number(wr&&wr.perf&&wr.perf.managerActionAdapterMs),trace=x.trace||{},nowEpoch=Date.now();
      if(isFinite(gas))perf.gasMs=Math.round(gas);
      if(wr&&(wr.owner==='CLOUD_RUN_DIRECT_MANAGER_APPROVE'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_CANCEL'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_REJECT'||(wr.owner==='CLOUD_RUN_DIRECT_MANAGER_COMPLETE'||wr.owner==='CLOUD_RUN_DIRECT_AUDITOR_COMPLETE')))perf.cloudRunMs=Number(wr.totalMs)||null;
      perf.traceId=String(trace.requestId||wr&&wr.perf&&wr.perf.requestId||'');
      perf.browserToWorkerMs=(trace.workerReceivedAt&&trace.clientSentAt)?Math.max(0,Number(trace.workerReceivedAt)-Number(trace.clientSentAt)):null;
      perf.workerPreRpcMs=(trace.rpcStartedAt&&trace.workerReceivedAt)?Math.max(0,Number(trace.rpcStartedAt)-Number(trace.workerReceivedAt)):null;
      perf.workerRpcWallMs=(trace.rpcEndedAt&&trace.rpcStartedAt)?Math.max(0,Number(trace.rpcEndedAt)-Number(trace.rpcStartedAt)):Number(x.relayElapsedMs)||null;
      perf.workerToBrowserMs=trace.replyAt?Math.max(0,nowEpoch-Number(trace.replyAt)):null;
      patchActionLikeV1(auditId,action,reason,wr,perf);
      var st=wr&&wr.statusPerf||{},core=wr&&wr.actionPerf||{};
      perf.statusPerf=st;perf.actionPerf=core;
      var coreDetail="avail "+(core.availabilityMs==null?"-":core.availabilityMs)+" / reset "+(core.resetPlanningMs==null?"-":core.resetPlanningMs)+" / statuswrite "+(core.statusWriteMs==null?"-":core.statusWriteMs)+" / lifecycle "+(core.lifecycleMs==null?"-":core.lifecycleMs)+" / cache "+(core.cacheInvalidationMs==null?"-":core.cacheInvalidationMs)+(core.archiveMs==null?"":" / archive "+core.archiveMs);
      document.getElementById("status").textContent=wr&&(wr.owner==='CLOUD_RUN_DIRECT_MANAGER_APPROVE'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_CANCEL'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_REJECT'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_COMPLETE')
        ? Number(openCounts.total||all.length)+" open audits · "+String(action||"").toUpperCase()+" "+perf.totalMs+" ms (Cloud Run "+(perf.cloudRunMs==null?"-":perf.cloudRunMs)+" · read "+(wr.readMs==null?"-":wr.readMs)+" · archive "+(wr.archiveMs==null?"-":wr.archiveMs)+" · write "+(wr.writeMs==null?"-":wr.writeMs)+" · delete "+(wr.deleteMs==null?"-":wr.deleteMs)+" · queue "+(wr.sideEffectMs==null?"-":wr.sideEffectMs)+" · availability rows "+(wr.availabilityRows==null?"-":wr.availabilityRows)+" · patch "+perf.patchMs+")"
        : Number(openCounts.total||all.length)+" open audits · action "+perf.totalMs+" ms (worker "+perf.workerMs+" · GAS "+(perf.gasMs==null?"-":perf.gasMs)+" · b→w "+(perf.browserToWorkerMs==null?"-":perf.browserToWorkerMs)+" · preRPC "+(perf.workerPreRpcMs==null?"-":perf.workerPreRpcMs)+" · RPC "+(perf.workerRpcWallMs==null?"-":perf.workerRpcWallMs)+" · w→b "+(perf.workerToBrowserMs==null?"-":perf.workerToBrowserMs)+" · status "+(st.totalMs==null?"-":st.totalMs)+" [guard "+(st.writeGuardMs==null?"-":st.writeGuardMs)+" / load "+(st.loadAuditMs==null?"-":st.loadAuditMs)+" / core "+(st.coreMs==null?"-":st.coreMs)+" / notify "+(st.notificationOnlyMs==null?"-":st.notificationOnlyMs)+"] · "+coreDetail+" · patch "+perf.patchMs+" · trace "+(perf.traceId||"-")+")";
      console.info("[MANAGER_ACTION_TIMING]",perf)
    })
    .catch(function(e){
      window.alert('Canonical action failed: '+e.message);
      if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=false});
      if(String(e&&e.message||'').indexOf('ACTION_RELAY')>=0)resetRelayWorker()
    })
    .finally(function(){busyAudits.delete(auditId);try{button.removeAttribute("data-complete-hours")}catch(e){}})
}
function quarterHourValue(v){var n=Number(v),q=Math.round(n*4)/4;return n>0&&isFinite(n)&&Math.abs(q-n)<1e-9?q:null}
function showModal(id,on){var el=document.getElementById(id);if(el)el.classList.toggle("open",!!on)}
function openCompleteDialog(auditId){var row=all.find(function(r){return r.auditId===auditId});if(!row||row.statusKey!=="ACCEPTED")return;completeDialogAuditId=auditId;document.getElementById("completeMsg").textContent="Complete "+text(row.company)+".";var n=Number(row.hoursPlanned);document.getElementById("completeHours").value=isFinite(n)&&n>0?n.toFixed(2):"";showModal("completeModal",true);setTimeout(function(){document.getElementById("completeHours").focus()},0)}
function closeCompleteDialog(){completeDialogAuditId="";showModal("completeModal",false)}
function openRealizedDialog(auditId){var row=all.find(function(r){return r.auditId===auditId});if(!row)return;realizedDialogAuditId=auditId;document.getElementById("realizedMsg").textContent="Correct Hours dedicated for "+text(row.company)+".";var n=Number(row.hoursDedicated);document.getElementById("realizedHours").value=isFinite(n)&&n>0?n.toFixed(2):"";showModal("realizedModal",true);setTimeout(function(){document.getElementById("realizedHours").focus()},0)}
function closeRealizedDialog(){realizedDialogAuditId="";showModal("realizedModal",false)}
document.getElementById("completeCancel").onclick=closeCompleteDialog;
document.getElementById("completeConfirm").onclick=function(){var id=completeDialogAuditId,q=quarterHourValue(document.getElementById("completeHours").value);if(q==null){window.alert("Hours dedicated must be > 0 in steps of 0.25.");return}var button=document.querySelector('.act[data-audit-id="'+CSS.escape(id)+'"][data-action="complete"]');if(!button)return;button.setAttribute("data-complete-hours",String(q));closeCompleteDialog();runAction(button)};
document.getElementById("realizedCancel").onclick=closeRealizedDialog;
document.getElementById("realizedConfirm").onclick=function(){var id=realizedDialogAuditId,q=quarterHourValue(document.getElementById("realizedHours").value);if(q==null){window.alert("Hours dedicated must be > 0 in steps of 0.25.");return}if(busyAudits.has(id))return;busyAudits.add(id);showModal("realizedModal",false);var sx=window.scrollX,sy=window.scrollY,started=performance.now();runActionViaWarmWorker(id,"edit_realized_hours",{hoursDedicated:q,reason:"Manager realized-hours correction"}).then(function(x){var idx=all.findIndex(function(r){return r.auditId===id});if(idx>=0){all[idx]=Object.assign({},all[idx],{hoursDedicated:q});render(all);window.scrollTo(sx,sy)}document.getElementById("status").textContent=all.length+" completed audits · realized hours corrected "+Math.round(performance.now()-started)+" ms"}).catch(function(e){window.alert("Realized-hours correction failed: "+e.message)}).finally(function(){busyAudits.delete(id);realizedDialogAuditId=""})}

function extensionAppliedState(r){return !!(r&&(r.extensionApplied||r.extApplied))}
function recoverExtension(auditId,command,sx,sy,started){return rereadEnrichedAudit(auditId).then(function(patch){var expected=command==='apply';if(extensionAppliedState(patch)!==expected)throw new Error('CANONICAL_EXTENSION_NOT_COMMITTED');mergeRowInPlace(auditId,patch);window.scrollTo(sx,sy);document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · extension "+command+" "+Math.round(performance.now()-started)+" ms · canonical recovery";return patch})}
function runExtension(button){var auditId=button.getAttribute("data-audit-id"),command=button.getAttribute("data-extension");if(busyAudits.has(auditId))return;var row=all.find(function(r){return r.auditId===auditId});if(!row)return;busyAudits.add(auditId);var tr=button.closest("tr"),sx=window.scrollX,sy=window.scrollY,started=performance.now();if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=true});fetch('/api/v1/manager/extension',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,command:command})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Extension failed');return x})}).then(function(x){if(!x.patch)throw new Error('EXTENSION_PATCH_MISSING');mergeRowInPlace(auditId,x.patch);window.scrollTo(sx,sy);document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · extension "+command+" "+Math.round(performance.now()-started)+" ms"}).catch(function(e){return recoverExtension(auditId,command,sx,sy,started).catch(function(){window.alert('Extension failed: '+e.message);if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=false})})}).finally(function(){busyAudits.delete(auditId)})}
function searchable(r){if(currentView==="completed")return[r.auditId,r.company,r.region,r.scopesText,r.status,r.auditor,r.executedOn,r.completedDate,r.hoursPlanned,r.hoursDedicated].join(" ").toLowerCase();return[r.auditId,r.company,locationText(r),r.region,r.scopesText,r.status,r.assignedTo,r.planningWindowText,r.requiredHours,r.hoursPlanned,r.datePlanned,effectiveExpiry(r),r.conceptMonth,r.hasProvisionalPlanning?"provisional":"",r.latestComment].join(" ").toLowerCase()}
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return searchable(r).indexOf(z)>=0}))}
function setTabs(){document.getElementById("completedView").style.background=currentView==="completed"?"#dbeafe":"white";document.getElementById("openView").style.background=currentView==="open"?"#dbeafe":"white"}
function loadOpenEnrichment(seq){if(String(actorRole).toLowerCase()==="auditor")return Promise.resolve();var ids=all.map(function(r){return r.auditId}).filter(Boolean),sx=window.scrollX,sy=window.scrollY;if(!ids.length)return Promise.resolve();var started=performance.now();return fetch('/api/v1/manager/open-enrichment',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditIds:ids})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Open audit enrichment failed');return x})}).then(function(x){if(seq!==enrichmentSeq||currentView!=="open")return;var by={};(x.rows||[]).forEach(function(r){if(r&&r.auditId)by[r.auditId]=r});all.forEach(function(r,i){if(by[r.auditId]){var p=Object.assign({},by[r.auditId]);delete p.locationsToPlan;delete p.locs;delete p.locations;delete p.locationCount;delete p.gps;delete p.gpsData;delete p.coordinates;all[i]=Object.assign({},r,p)}});filter();window.scrollTo(sx,sy);var ms=Math.round(performance.now()-started);document.getElementById("status").textContent=all.length+" open audits · decision-ready "+ms+" ms enrichment"}).catch(function(e){if(seq!==enrichmentSeq)return;console.warn('[OPEN_AUDITS_ENRICHMENT]',e);document.getElementById("status").textContent=all.length+" open audits · base loaded; enrichment unavailable"})}
function loadOpen(){if(currentView!=="open")selectionClear();currentView="open";var seq=++enrichmentSeq;return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(!x.success)throw new Error([x.error,x.detail].filter(Boolean).join(": ")||x.message||"Read failed");all=x.rows.slice();openCounts=Object.assign({total:all.length,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0},x.counts||{});var identity=document.getElementById("identity"),displayName=String(x.actorDisplayName||"").trim();if(identity&&displayName)identity.textContent=displayName+" · "+actorRole;document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms base";renderCards();setTabs();filter();return loadOpenEnrichment(seq)}).catch(fail)}
function loadCompleted(){if(currentView!=="completed")selectionClear();currentView="completed";++enrichmentSeq;return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){if(a.success===false)throw new Error(a.error||a.message||"Read failed");all=(a.rows||[]).slice();document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";setTabs();filter()}).catch(fail)}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
function applyActorUi(){var isAud=String(actorRole).toLowerCase()==="auditor",title=document.getElementById("portalTitle"),batch=document.getElementById("selectionBatch"),concept=document.getElementById("selectionConcept"),workspace=document.getElementById("planningWorkspace");document.body.classList.toggle("actor-auditor",isAud);document.body.classList.toggle("actor-manager",!isAud);if(title)title.textContent=isAud?"Auditor · Audit Grid 2.0":"Manager · Audit Grid 2.0";if(batch)batch.style.display=isAud?"none":batch.style.display;if(concept)concept.style.display=isAud?"none":concept.style.display;if(workspace)workspace.style.display=isAud?"none":"";}
var passiveRefreshBusy=false,lastPassiveRefreshAt=0;
function passiveRefreshOpen(){
  if(currentView!=="open"||passiveRefreshBusy||document.visibilityState==="hidden")return Promise.resolve();
  var now=Date.now();if(now-lastPassiveRefreshAt<1500)return Promise.resolve();
  passiveRefreshBusy=true;lastPassiveRefreshAt=now;
  var sx=window.scrollX,sy=window.scrollY,q=document.getElementById("q").value;
  return loadOpen().then(function(){
    document.getElementById("q").value=q;filter();window.scrollTo(sx,sy);
  }).finally(function(){passiveRefreshBusy=false});
}
window.addEventListener("focus",function(){passiveRefreshOpen()});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")passiveRefreshOpen()});
document.getElementById("q").addEventListener("input",filter);document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};document.getElementById("openView").onclick=loadOpen;document.getElementById("completedView").onclick=loadCompleted;
document.getElementById("selectionClear").onclick=selectionClear;
document.getElementById("selectionBatch").onclick=function(){submitSelectionHandoff("batch")};
document.getElementById("selectionConcept").onclick=function(){submitSelectionHandoff("concept")};
document.getElementById("selectionExport").onclick=function(){var f=document.getElementById("selectionExportFormat").value;f==="pdf"?selectionPdf():selectionExcel()};
var workspace=document.getElementById("planningWorkspace");if(workspace){workspace.disabled=true;workspace.title="Use Batch plan or Concept planning from a Grid 2.0 selection, or Open on one audit."}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(sess){if(!sess.ok||!sess.identity)throw new Error("SESSION_REQUIRED");actorRole=String(sess.identity.role||"Manager");document.getElementById("identity").textContent=sess.identity.email+" · "+actorRole;applyActorUi();if(String(actorRole).toLowerCase()==="manager")initRelay().catch(function(e){console.warn("[WARM_GAS_WORKER_INIT]",e)});return loadOpen()}).catch(fail);
})();