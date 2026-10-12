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
function selectionExportHeaders(){return currentView==="completed"?["Company","Region","Scopes","Executed on","Auditor","Hours planned","Hours dedicated","Completed date","Status"]:["Company","Locations","Region","GPS / Map","Scopes","Status","Expiration date","Planning window","Self planning","Date planned","To be planned","Hours planned","Auditor","Alert"]}
function selectionExportRows(){return selectionRows().map(function(r){if(currentView==="completed")return[r.company,r.region,r.scopesText,r.executedOn,r.auditorDisplayName||r.auditorName||r.auditor,r.hoursPlanned,r.hoursDedicated,r.completedDate,r.status||"Completed"];var windowText=r.planningWindowText||([r.planningWindowFrom,r.planningWindowTo].filter(Boolean).join(" → "));return[r.company,locationText(r),r.region,(function(){var g=gpsValue(r);return g?(/^https?:\/\//i.test(g)?g:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(g)):""})(),r.scopesText,displayStatus(r.status),compactDate(effectiveExpiry(r)),windowText,r.allowSelfPlanning===true||String(r.allowSelfPlanning).toLowerCase()==="true"?"Yes":"No",compactDate(r.datePlanned),r.requiredHours,r.hoursPlanned,r.assignedToDisplayName||r.auditorDisplayName||r.assignedTo||r.auditor,r.preassignmentConflict?eligibilityConflictText(r):(r.latestComment?((r.latestCommentTimestamp?String(r.latestCommentTimestamp)+" · ":"")+latestCommentText(r)):"")]})}
function selectionExcelSafeCell(v){var s=String(v==null?"":v);return /^[\s\u0000-\u001f]*[=+@]/.test(s)||/^[\s\u0000-\u001f]*-[^0-9.]/.test(s)?"\u0027"+s:s}
function selectionExportMeta(){var label=document.getElementById("identity"),actor=label?String(label.textContent||"").trim():"";return {title:currentView==="completed"?"Completed audits":"Audit planning overview",actor:actor,date:new Date().toLocaleString("en-GB"),count:selectionRows().length}}
function selectionExcel(){
  var headers=selectionExportHeaders(),rows=selectionExportRows(),meta=selectionExportMeta();if(!rows.length)return;
  var table="<table><thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return"<tr>"+r.map(function(v,i){if(headers[i]==="GPS / Map"&&/^https:\/\//i.test(String(v||""))){return"<td><a href=\""+esc(v)+"\">Open map</a></td>"}return"<td>"+esc(selectionExcelSafeCell(v))+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table>";
  var blob=new Blob(["\ufeff<html><meta charset=utf-8><style>body{font-family:Arial}h2{color:#17365d;margin-bottom:4px}.meta{color:#536579;font-size:10pt;margin-bottom:12px}table{border-collapse:collapse;font-family:Arial;font-size:10pt}th{background:#17365d;color:white}th,td{border:1px solid #cbd5e1;padding:5px}tr:nth-child(even){background:#f1f5f9}.footer{font-size:9pt;color:#536579;margin-top:12px}</style><h2>AgriQA | "+esc(meta.title)+"</h2><div class=meta>"+esc(meta.actor)+" | "+esc(meta.date)+" | "+meta.count+" audits</div>"+table+"<div class=footer>AgriQA - Audit Management System | "+esc(meta.date)+"</div></html>"],{type:"application/vnd.ms-excel;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(String(actorRole).toLowerCase()==="auditor"?"Auditor":"Manager")+"_selected_"+(currentView==="completed"?"completed":"open")+"_audits.xls";a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)
}
function selectionPdf(){
  var allHeaders=selectionExportHeaders(),allRows=selectionExportRows(),meta=selectionExportMeta();if(!allRows.length)return;
  var wanted=currentView==="completed"?["Company","Region","Scopes","Executed on","Auditor","Hours planned","Hours dedicated","Completed date","Status"]:["Company","Locations","Region","GPS / Map","Scopes","Status","Expiration date","Planning window","Date planned","To be planned","Hours planned","Auditor","Alert"];
  var indices=wanted.map(function(h){return allHeaders.indexOf(h)}).filter(function(i){return i>=0}),headers=indices.map(function(i){return allHeaders[i]}),rows=allRows.map(function(r){return indices.map(function(i){return r[i]})});
  var w=window.open("","_blank");if(!w)return;
  var html="<!doctype html><html><head><meta charset=utf-8><title>"+esc(meta.title)+"</title><style>@page{size:A3 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;font-size:9px}header{border-bottom:2px solid #17365d;padding-bottom:8px;margin-bottom:12px}h1{font-size:19px;color:#17365d;margin:0 0 5px}.meta{font-size:10px;color:#536579}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#17365d;color:white}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f1f5f9}footer{margin-top:12px;border-top:1px solid #cbd5e1;padding-top:5px;font-size:9px;color:#536579}</style></head><body><header><h1>AgriQA | "+esc(meta.title)+"</h1><div class=meta>"+esc(meta.actor)+" | "+esc(meta.date)+" | "+meta.count+" audits</div></header><table><thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+rows.map(function(r){return"<tr>"+r.map(function(v,i){if(headers[i]==="GPS / Map"&&v){var href=String(v);return"<td><a href=\""+esc(href)+"\" target=\"_blank\" rel=\"noopener\">Open map</a></td>"}return"<td>"+esc(v==null?"":v)+"</td>"}).join("")+"</tr>"}).join("")+"</tbody></table><footer>AgriQA - Audit Management System | "+esc(meta.date)+"</footer></body></html>";
  w.document.write(html);w.document.close();setTimeout(function(){w.focus();w.print()},150)
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
function diagnoseGridOverflow(){
  if(window.innerWidth>1500)return;
  var wrap=document.querySelector('.table-wrap'),table=wrap&&wrap.querySelector('table');
  if(!wrap||!table)return;
  var viewport=document.documentElement.clientWidth;
  var nodes=[document.body,document.querySelector('main'),wrap,table].filter(Boolean);
  var offenders=nodes.filter(function(el){return el.getBoundingClientRect().right>viewport+2||el.scrollWidth>el.clientWidth+2}).map(function(el){return {element:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().replace(/\s+/g,'.'):''),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,right:Math.round(el.getBoundingClientRect().right)}});
  if(offenders.length)console.warn('[GRID_2_RESPONSIVE_OVERFLOW]',{viewport:viewport,actor:actorRole,offenders:offenders});
}
function render(rows){renderHead();gridVisibleIds=(rows||[]).map(function(r){return String(r.auditId||"")}).filter(Boolean);var body=document.getElementById("rows");if(!rows.length){body.innerHTML="<tr><td class=\"empty\" colspan=\""+(currentView==="completed"?"11":"16")+"\">No audits found</td></tr>";bindSelectionControls(body);return}body.innerHTML=currentView==="completed"?renderCompleted(rows):renderOpen(rows);if(currentView==="open")bindActionButtons(body);else bindCompletedButtons(body);bindSelectionControls(body);requestAnimationFrame(diagnoseGridOverflow)}
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
function runRealizedHoursDirect(auditId,hoursDedicated){
  var started=performance.now();
  return fetch('/api/v1/manager/realized-hours-direct',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,hoursDedicated:hoursDedicated,expectedHoursDedicated:(all.find(function(r){return r.auditId===auditId})||{}).hoursDedicated})})
    .then(function(response){return response.json().then(function(result){if(!response.ok||result.success===false)throw new Error(result.error||'REALIZED_HOURS_DIRECT_FAILED');return {result:result,relayElapsedMs:Math.round(performance.now()-started),trace:{transport:'CLOUD_RUN_DIRECT'}};})});
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
document.getElementById("realizedConfirm").onclick=function(){var id=realizedDialogAuditId,q=quarterHourValue(document.getElementById("realizedHours").value);if(q==null){window.alert("Hours dedicated must be > 0 in steps of 0.25.");return}if(busyAudits.has(id))return;busyAudits.add(id);showModal("realizedModal",false);var sx=window.scrollX,sy=window.scrollY,started=performance.now();document.getElementById("status").textContent="Working · correcting realized hours…";runRealizedHoursDirect(id,q).then(function(x){var totalMs=Math.round(performance.now()-started),serverPerf=x&&x.result&&x.result.perf||{};console.info("[REALIZED_HOURS_PERF]",{totalMs:totalMs,relayMs:x.relayElapsedMs||0,server:serverPerf,trace:x.trace||{}});if(!x||!x.result||x.result.success===false||x.result.ok===false||String(x.result.auditId||"")!==id||Math.abs(Number(x.result.newHoursDedicated)-q)>1e-9)throw new Error("REALIZED_HOURS_COMMIT_NOT_CONFIRMED");var idx=all.findIndex(function(r){return r.auditId===id});if(idx>=0){all[idx]=Object.assign({},all[idx],{hoursDedicated:q});var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(id)+'"]');if(tr){var fragment=document.createElement("tbody");fragment.innerHTML=renderCompleted([all[idx]]);var fresh=fragment.firstElementChild;if(fresh){tr.replaceWith(fresh);bindCompletedButtons(fresh)}}window.scrollTo(sx,sy)}var p=x.result.perf||{},fmt=function(v){return typeof v==="number"&&isFinite(v)?Math.round(v)+" ms":"n/a"},gasMs=Number(x.relayElapsedMs)||0,adapterMs=typeof p.managerActionAdapterMs==="number"?p.managerActionAdapterMs:null;document.getElementById("status").textContent=all.length+" completed audits · realized hours corrected "+Math.round(performance.now()-started)+" ms (Cloud Run request "+fmt(gasMs)+" · Sheets lookup "+fmt(p.lookupMs)+" · atomic write+trail "+fmt(p.logWriteMs)+" · cache "+fmt(p.cacheInvalidationMs)+" · trail "+fmt(p.auditTrailMs)+" · lookup "+fmt(p.lookupMs)+" · cell "+fmt(p.cellWriteMs)+" · lock "+fmt(p.lockMs)+")"+(typeof p.logWriteMs!=="number"?" · GAS timing instrumentation not deployed":"")}).catch(function(e){window.alert("Realized-hours correction failed: "+e.message)}).finally(function(){busyAudits.delete(id);realizedDialogAuditId=""})}

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
  if(currentView!=="open"||passiveRefreshBusy||document.visibilityState==="hidden"||!document.getElementById("scopeManagement20Panel").hidden)return Promise.resolve();
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
(function(){
var button=document.getElementById('scopeManagement20'),panel=document.getElementById('scopeManagement20Panel'),close=document.getElementById('scopeManagement20Close'),body=document.getElementById('scopeManagement20Rows'),status=document.getElementById('scopeManagement20Status'),search=document.getElementById('scopeManagement20Search'),filter=document.getElementById('scopeManagement20Filter'),dossier=document.getElementById('scopeManagement20Dossier'),details=document.getElementById('scopeManagement20Details'),records=[],selected=null,tab='general',pendingEdits=[];
function el(tag,value){var x=document.createElement(tag);x.textContent=value==null?'':String(value);return x}
function showDetails(){if(!selected)return;pendingEdits=[];dossier.hidden=false;document.getElementById('scopeManagement20Name').textContent=selected.displayName+' ('+selected.scopeCode+')';var p=selected.policy||{},fields=[];
if(tab==='general')fields=[['Scope name',selected.displayName],['Scope code',selected.scopeCode],['Slot',selected.slotKey],['Active',selected.active],['Archived',selected.archived],['Color',p.Color],['Text color',p.TextColor],['Sort order',p.SortOrder]];
if(tab==='versions')fields=[];
if(tab==='rules')fields=[['Rotation limit',selected.rotationLimit],['Minimum interval',selected.minimumIntervalMonths],['Max off-site hours',p.Max_Offsite_Hours],['Planning from',selected.planningFrom],['Planning to',selected.planningTo],['Recurring',p.Recurring],['Cycle',p['Obligation cycle']],['Complete by',p['Complete by']]];
if(tab==='sources')fields=[['Extension',p.Extension],['Provisioning source',p['Provisioning source']],['Trigger source',p['Trigger source']],['Source service',p['Source service']]];
details.replaceChildren();
if(tab==='versions'){
var checkStorage=el('button','Check storage');checkStorage.type='button';checkStorage.onclick=async function(){
versionInfo.textContent='Checking version storage…';
try{var response=await fetch('/api/v1/manager/scopes/version-status',{credentials:'same-origin'}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'STATUS_UNAVAILABLE');versionInfo.textContent='ScopeVersions storage: '+result.storage;if(result.initialized)showDetails()}catch(e){versionInfo.textContent='Storage check failed: '+e.message}
};
var checkCell=el('dd','');checkCell.appendChild(checkStorage);
var bootstrap=el('button','Initialize hours history');bootstrap.type='button';bootstrap.style.marginBottom='10px';
bootstrap.onclick=async function(){
if(!confirm('Register the current configuration of all scopes as CURRENT V1? Existing audit hours will not change.'))return;
var reason=prompt('Reason for V1 initialization:','Initial AMS 2.0 version registration');if(!reason||!reason.trim())return;
bootstrap.disabled=true;try{
var response=await fetch('/api/v1/manager/scopes/bootstrap-v1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'INITIALIZE_CURRENT_V1',reason:reason})});
var result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'INITIALIZATION_FAILED');
status.textContent='Initialized '+result.count+' current V1 versions; existing audits unchanged'+(result.skipped?.length?' · Not initialized (hours missing): '+result.skipped.map(function(x){return x.scopeCode}).join(', '):'');bootstrap.hidden=true;showDetails();
}catch(e){versionInfo.textContent='Initialization failed: '+e.message;status.textContent='V1 initialization blocked: '+e.message}finally{bootstrap.disabled=false}
};
var bootstrapCell=el('dd','');bootstrapCell.appendChild(bootstrap);
var versionInfo=el('dd','Loading version history…');versionInfo.style.whiteSpace='pre-wrap';versionInfo.style.gridColumn='1 / -1';details.appendChild(versionInfo);
var code=selected.scopeCode;
fetch('/api/v1/manager/scopes/versions',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(result){
if(!result.ok)throw Error((result.error||'VERSION_STORAGE_NOT_READY')+(result.detail?' — '+result.detail:''));bootstrap.hidden=true;checkStorage.hidden=true;
var versions=result.versions.filter(function(v){return v.ScopeCode===code});
versionInfo.replaceChildren();
var schemeRow=el('div','');schemeRow.style.margin='0 0 16px';var schemeLabel=el('label','Official scheme version: '),schemeInput=document.createElement('input');schemeInput.type='text';schemeInput.placeholder='e.g. V12 / V16';schemeInput.style.width='100px';schemeInput.setAttribute('aria-label','Official scheme version');schemeRow.appendChild(schemeLabel);schemeRow.appendChild(schemeInput);
var saveScheme=el('button','Save scheme version');saveScheme.type='button';saveScheme.style.marginLeft='8px';schemeRow.appendChild(saveScheme);versionInfo.appendChild(schemeRow);
var schemeExpected='';
fetch('/api/v1/manager/scopes/scheme-version?scopeCode='+encodeURIComponent(code),{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(data){if(!data.ok)throw Error(data.error||'SCHEME_VERSION_UNAVAILABLE');schemeExpected=data.version||'';schemeInput.value=schemeExpected}).catch(function(e){saveScheme.disabled=true;status.textContent='Scheme version unavailable: '+e.message});
saveScheme.onclick=async function(){
 var value=schemeInput.value.trim().toUpperCase();if(!/^V[1-9][0-9]*$/.test(value)){status.textContent='Enter version as V12 or V16';return}
 var reason='Manager updated official scheme version';
 saveScheme.disabled=true;
 try{
 var pre=await fetch('/api/v1/manager/scopes/impact?scopeCode='+encodeURIComponent(code)+'&field=Default_hours',{credentials:'same-origin'}),impact=await pre.json();
 if(!pre.ok||!impact.ok)throw Error(impact.error||'IMPACT_UNAVAILABLE');
 
 var response=await fetch('/api/v1/manager/scopes/scheme-version',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopeCode:code,version:value,expected:schemeExpected,reason:reason,impactConfirmed:true})}),result=await response.json();
 if(!response.ok||!result.ok)throw Error(result.error||'SCHEME_VERSION_SAVE_FAILED');
 schemeExpected=result.version;status.textContent='Official scheme version '+result.version+' saved for '+code;
 }catch(e){status.textContent='Scheme version save blocked: '+e.message}finally{saveScheme.disabled=false}
};
var current=versions.find(function(v){return v.Status==='CURRENT'});
if(current||!versions.length){
 var edit=el('div','');edit.style.margin='0 0 14px';var hoursLabel=el('label','Hours to be planned: ');edit.appendChild(hoursLabel);var hoursInput=document.createElement('input');hoursInput.type='number';hoursInput.min='0';hoursInput.max='1000';hoursInput.step='0.01';hoursInput.value=current?String(current.Hours_to_plan):'';hoursInput.style.width='90px';hoursInput.setAttribute('aria-label','New hours to be planned');
 var saveHours=el('button',current?'Save hours revision':'Initialize hours history');saveHours.type='button';saveHours.style.marginLeft='8px';
 saveHours.onclick=async function(){
 
 var reason=prompt('Reason for changing hours to be planned:');if(!reason||!reason.trim())return;
 var impact;try{var impactResponse=await fetch('/api/v1/manager/scopes/impact?scopeCode='+encodeURIComponent(code)+'&field=Default_hours',{credentials:'same-origin'});impact=await impactResponse.json()}catch(e){versionInfo.textContent+='\nImpact validation unavailable: '+e.message;return}
 if(!impactResponse.ok||!impact.ok){versionInfo.textContent+='\nImpact validation failed; hours not changed';return}
 if(!confirm('Activate new scope hours version? '+impact.openAudits+' open audits linked ('+impact.accepted+' accepted). Existing audit hours remain unchanged.'))return;
 saveHours.disabled=true;
 try{var response=await fetch('/api/v1/manager/scopes/hours-version',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopeCode:code,expectedVersion:current?current.VersionId:'UNINITIALIZED',hours:hoursInput.value,reason:reason,impactConfirmed:true})}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'HOURS_VERSION_SAVE_FAILED');
 status.textContent=result.unchanged?'Hours unchanged':'Activated '+result.versionId+' for '+code;
 await load();selected=records.find(function(r){return r.scopeCode===code})||selected;showDetails();
 }catch(e){versionInfo.textContent+='\nSave failed: '+e.message}finally{saveHours.disabled=false}
 };
 edit.appendChild(hoursInput);edit.appendChild(saveHours);versionInfo.appendChild(edit);
}
var history=document.createElement('details');history.style.marginTop='8px';var summary=document.createElement('summary');summary.textContent='Hours revision history ('+versions.length+')';history.appendChild(summary);var historyText=el('div',versions.length?versions.map(function(v){return v.VersionId+' · '+v.Status+' · '+v.Hours_to_plan+' hours'}).join('\n'):'No hours revisions registered');historyText.style.whiteSpace='pre-wrap';historyText.style.padding='8px 0 0 14px';history.appendChild(historyText);versionInfo.appendChild(history);
}).catch(function(e){versionInfo.textContent='Version management not initialized: '+e.message+'\nHours editing remains disabled until V1 registration is verified.'});
}
fields.forEach(function(f){
 details.appendChild(el('dt',f[0]));
 var dd=el('dd',''),cosmeticMap={'Scope name':'DisplayName','Color':'Color','Text color':'TextColor','Sort order':'SortOrder'},field=cosmeticMap[f[0]];
 var policyMap={'Rotation limit':'Max number audits','Minimum interval':'Min_Interval_Months','Max off-site hours':'Max_Offsite_Hours','Planning from':'Planning from','Planning to':'Planning to','Active':'Active','Archived':'Archived','Extension':'Extension','Recurring':'Recurring','Cycle':'Obligation cycle','Complete by':'Complete by','Provisioning source':'Provisioning source','Trigger source':'Trigger source','Source service':'Source service'};
 var policyField=policyMap[f[0]],canPolicy=(tab==='rules'||tab==='sources')&&!!policyField||tab==='general'&&['Active','Archived'].includes(f[0]);
 if(canPolicy||field&&field!=='Color'&&field!=='TextColor'){
  var input=document.createElement(policyField==='Recurring'?'select':'input');
  if(policyField==='Recurring'){['YES','NO'].forEach(function(v){var option=document.createElement('option');option.value=v;option.textContent=v;input.appendChild(option)})}
  var initial=canPolicy?String(selected.policy[policyField]??''):String(selected.policy[field]??'');
  if(canPolicy&&['Active','Archived'].includes(policyField)){initial=['TRUE','YES','1'].includes(initial.trim().toUpperCase())?'TRUE':'FALSE';input=document.createElement('select');['TRUE','FALSE'].forEach(function(v){var option=document.createElement('option');option.value=v;option.textContent=v==='TRUE'?'Yes':'No';input.appendChild(option)})}
  input.value=initial;input.style.maxWidth='200px';input.setAttribute('aria-label',f[0]);dd.appendChild(input);
  pendingEdits.push({field:canPolicy?policyField:field,kind:canPolicy?'policy':'cosmetic',input:input,initial:initial});
 }else{var val=f[1]==null?'':String(f[1]);dd.textContent=field==='Color'||field==='TextColor'?'Edit in scope overview':val||'Not configured';if(!val)dd.style.opacity='0.65'}
 details.appendChild(dd);
});
if(tab!=='versions'){
 var actions=el('div','');actions.style.gridColumn='1 / -1';actions.style.margin='12px 0';
 var saveAll=el('button','Save all');saveAll.type='button';saveAll.style.padding='7px 16px';
 var saved=el('span','');saved.setAttribute('role','status');saved.style.marginLeft='12px';
 actions.appendChild(saveAll);actions.appendChild(saved);details.appendChild(actions);
 saveAll.onclick=async function(){
  var changes=pendingEdits.filter(function(e){return e.input.value.trim()!==e.initial});var completed=0;
  if(!changes.length){saved.textContent='No changes';return}
  var scopeCode=selected.scopeCode;
  var reason='Manager Scope Management tab update';
  var impacts=[];
  try{
   for(var j=0;j<changes.length;j++){var e=changes[j];if(e.kind!=='policy')continue;
    var pre=await fetch('/api/v1/manager/scopes/impact?scopeCode='+encodeURIComponent(scopeCode)+'&field='+encodeURIComponent(e.field),{credentials:'same-origin'}),impact=await pre.json();
    if(!pre.ok||!impact.ok)throw Error(impact.error||'IMPACT_UNAVAILABLE');
    if((['YES','TRUE'].includes(String(impact.current).trim().toUpperCase())?'TRUE':['NO','FALSE'].includes(String(impact.current).trim().toUpperCase())?'FALSE':String(impact.current).trim().toUpperCase())!==String(e.initial).trim().toUpperCase())throw Error('STALE_SCOPE_POLICY: '+e.field);
    impacts.push({field:e.field,impact:impact});
   }
   
   saveAll.disabled=true;saved.textContent='Saving…';
   for(var k=0;k<changes.length;k++){
    var item=changes[k],isPolicy=item.kind==='policy',payload=isPolicy?{scopeCode:scopeCode,field:item.field,expected:impacts.find(function(x){return x.field===item.field}).impact.current,value:['Active','Archived'].includes(item.field)?(item.input.value==='TRUE'?'Yes':'No'):item.input.value.trim(),reason:reason,impactConfirmed:true}:{scopeCode:scopeCode,field:item.field,expected:item.initial,value:item.input.value.trim()};
    var endpoint=isPolicy?'/api/v1/manager/scopes/policy':'/api/v1/manager/scopes/cosmetic';
    var response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
    if(!response.ok||!result.ok)throw Error(item.field+': '+(result.error||'SAVE_FAILED'));
    item.initial=item.input.value.trim();completed++;
   }
   await load();selected=records.find(function(r){return r.scopeCode===scopeCode})||selected;showDetails();
   status.textContent='All changes saved · '+scopeCode;saved.textContent='All changes saved';
  }catch(e){saved.textContent='Save incomplete ('+completed+'/'+changes.length+'): '+e.message;status.textContent=saved.textContent}
  finally{saveAll.disabled=false}
 };
}
}
async function saveInline(r,field,value,control){
control.disabled=true;
try{
var response=await fetch('/api/v1/manager/scopes/cosmetic',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopeCode:r.scopeCode,field:field,expected:String(r.policy[field]??''),value:value})});
var result=await response.json();
if(!response.ok||!result.ok)throw Error(result.error||'SAVE_FAILED');
status.textContent='Saved '+field+' for '+r.scopeCode;
await load();
if(selected&&selected.scopeCode===r.scopeCode){selected=records.find(function(x){return x.scopeCode===r.scopeCode})||selected;showDetails()}
}catch(e){status.textContent='Save blocked: '+e.message;control.value=String(r.policy[field]??'')}
finally{control.disabled=false}
}
function editableCell(tr,r,field,value,type){
var td=el('td',''),input=document.createElement('input');
input.type=type||'text';input.value=value==null?'':String(value);input.style.width=field==='DisplayName'?'155px':'65px';input.style.boxSizing='border-box';input.setAttribute('aria-label',field+' for '+r.scopeCode);
input.title='Edit and leave the field to save';
if(field==='Color'||field==='TextColor'){
var picker=document.createElement('input');picker.type='color';picker.value=/^#[0-9a-f]{6}$/i.test(input.value)?input.value:'#ffffff';picker.style.width='28px';picker.style.height='24px';picker.style.verticalAlign='middle';picker.title='Choose '+field;picker.addEventListener('input',function(){input.value=picker.value;var badge=tr.querySelector('[data-scope-preview]');if(badge)badge.style[field==='Color'?'backgroundColor':'color']=picker.value});picker.addEventListener('change',function(){input.dispatchEvent(new Event('change',{bubbles:true}))});td.appendChild(picker);
input.addEventListener('input',function(){if(/^#[0-9a-f]{6}$/i.test(input.value)){picker.value=input.value;var badge=tr.querySelector('[data-scope-preview]');if(badge)badge.style[field==='Color'?'backgroundColor':'color']=input.value}});
}
var original=input.value;
async function commit(){if(input.disabled||input.value===original)return;await saveInline(r,field,input.value,input)}
input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();input.blur()}if(e.key==='Escape'){input.value=original;input.blur()}});
input.addEventListener('change',commit);td.appendChild(input);tr.appendChild(td);
}
function render(){body.replaceChildren();var q=search.value.trim().toLowerCase(),f=filter.value;
records.filter(function(r){return (r.scopeCode+' '+r.displayName).toLowerCase().includes(q)&&(f==='all'||f==='active'&&r.active&&!r.archived||f==='archived'&&r.archived)}).sort(function(a,b){return Number(a.policy.SortOrder||0)-Number(b.policy.SortOrder||0)||a.displayName.localeCompare(b.displayName)}).forEach(function(r){
var tr=el('tr',''),td=el('td',''),b=el('button','Details');b.type='button';b.onclick=function(){selected=r;tab='general';showDetails()};td.appendChild(b);tr.appendChild(td);
editableCell(tr,r,'DisplayName',r.displayName,'text');
[r.active?'Yes':'No',r.currentVersion||'—',r.hoursToPlan,r.rotationLimit,r.minimumIntervalMonths,(r.planningFrom||'—')+' / '+(r.planningTo||'—')].forEach(function(v){tr.appendChild(el('td',v))});
editableCell(tr,r,'Color',r.policy.Color,'text');editableCell(tr,r,'TextColor',r.policy.TextColor,'text');
var preview=el('td',''),swatch=el('span',r.scopeCode);swatch.dataset.scopePreview='1';swatch.style.backgroundColor=String(r.policy.Color||'#ffffff');swatch.style.color=String(r.policy.TextColor||'#000000');swatch.style.padding='4px 7px';swatch.style.borderRadius='5px';swatch.style.fontWeight='600';preview.appendChild(swatch);tr.appendChild(preview);editableCell(tr,r,'SortOrder',r.policy.SortOrder,'number');body.appendChild(tr)})}
var addScope=el('button','+ Add scope');addScope.type='button';addScope.style.marginLeft='10px';addScope.onclick=async function(){
 var scopeCode=prompt('New ScopeCode (stable identity, e.g. MPS-NEW):');if(!scopeCode)return;
 var displayName=prompt('Display name for '+scopeCode+':');if(!displayName)return;
 var reason=prompt('Reason for adding this scope:');if(!reason||!reason.trim())return;
 if(!confirm('Create '+scopeCode+' as INACTIVE? Configure hours, scheme version, rules and qualifications before activation. Existing audits remain unchanged.'))return;
 addScope.disabled=true;
 try{var response=await fetch('/api/v1/manager/scopes/create',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopeCode:scopeCode,displayName:displayName,reason:reason,confirmation:'CREATE_INACTIVE_SCOPE'})}),result=await response.json();
 if(!response.ok||!result.ok)throw Error(result.error||'SCOPE_CREATE_FAILED');
 await load();selected=records.find(function(r){return r.scopeCode===result.scopeCode})||null;tab='general';showDetails();status.textContent='Created '+result.scopeCode+' in '+result.slotKey+' (INACTIVE). Configure before activation.';
 }catch(e){status.textContent='Add scope blocked: '+e.message}finally{addScope.disabled=false}
};
status.parentNode.insertBefore(addScope,status.nextSibling);
async function load(){status.textContent='Loading scopes…';try{var response=await fetch('/api/v1/manager/scopes',{credentials:'same-origin'}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'SCOPE_READ_FAILED');records=result.rows||[];status.textContent=records.length+' scopes · inline name editing enabled · material changes protected';render()}catch(e){status.textContent='Scope catalog unavailable: '+e.message}}
button.hidden=true;button.onclick=function(){if(String(actorRole).toLowerCase()!=='manager')return;panel.hidden=false;load()};close.onclick=function(){panel.hidden=true};search.oninput=render;filter.onchange=render;document.querySelectorAll('[data-scope-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.scopeTab;showDetails()}});
})();
(function(){
var open=document.getElementById('companyManagement20'),panel=document.getElementById('companyManagement20Panel'),close=document.getElementById('companyManagement20Close'),search=document.getElementById('companyManagement20Search'),filter=document.getElementById('companyManagement20Filter'),status=document.getElementById('companyManagement20Status'),rows=document.getElementById('companyManagement20Rows'),dossier=document.getElementById('companyManagement20Dossier'),name=document.getElementById('companyManagement20Name'),details=document.getElementById('companyManagement20Details');
var companies=[],selected=null,tab='company',pending={},busy=false,companyCatalog=[],saveError='';
function el(tag,value){var n=document.createElement(tag);if(value!==undefined)n.textContent=String(value??'');return n}
function line(label,control){var wrap=el('div');wrap.style.cssText='display:grid;grid-template-columns:minmax(160px,230px) minmax(250px,1fr);gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9';var title=el('label',label);wrap.append(title,control);details.appendChild(wrap);return wrap}
function plain(label,value){line(label,el('span',value||'—'))}
function field(label,key,value,kind){var input=el(kind==='multiline'?'textarea':'input');if(kind==='multiline')input.rows=3;else input.type=kind==='email'?'email':'text';input.value=String(value??'');input.style.cssText='width:100%;max-width:650px;padding:7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box';input.oninput=function(){if(input.value===String(value??''))delete pending[key];else pending[key]={expected:String(value??''),value:input.value};refreshSave()};line(label,input)}
function selectField(label,key,value){var input=el('select');['Yes','No'].forEach(function(v){var o=el('option',v);o.value=v;input.appendChild(o)});input.value=/^(yes|true|1)$/i.test(String(value))?'Yes':'No';var initial=input.value;input.onchange=function(){if(input.value===initial)delete pending[key];else pending[key]={expected:String(value??''),value:input.value};refreshSave()};line(label,input)}
function gpsLink(gps){var raw=String(gps||'').trim(),link=el('a','Open in Google Maps ↗');link.href=/^https:\/\/(www\.)?(google\.[^/]+\/maps|maps\.google\.[^/]+\/)/i.test(raw)?raw:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(raw);link.target='_blank';link.rel='noopener noreferrer';return raw?link:el('span','No GPS')}
function saveBar(){var bar=el('div');bar.style.cssText='display:flex;align-items:center;gap:12px;margin:14px 0';var save=el('button','Save all');save.type='button';save.style.cssText='background:#2563eb;color:white;border:0;border-radius:6px;padding:9px 17px';save.onclick=saveAll;save.id='companyManagement20Save';var msg=el('span','All changes saved');msg.id='companyManagement20SaveStatus';bar.append(save,msg);details.prepend(bar);refreshSave()}
function refreshSave(){var btn=document.getElementById('companyManagement20Save'),msg=document.getElementById('companyManagement20SaveStatus');if(btn)btn.disabled=busy||!Object.keys(pending).length;if(msg){msg.style.color=saveError?'#b91c1c':'';msg.textContent=busy?'Saving…':saveError|| (Object.keys(pending).length?Object.keys(pending).length+' unsaved changes':'All changes saved')}}
async function saveAll(){if(!selected||busy||!Object.keys(pending).length)return;saveError='';busy=true;refreshSave();var total=0;
async function post(path,data){var response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok||!result.ok)throw Error((result.error||'SAVE_FAILED')+(result.field?' · '+result.field:'')+(result.scopeCode?' · '+result.scopeCode:'')+(result.detail?' · '+result.detail:''));return result}
try{
 var uid=selected.companyUid;
 for(var key of Object.keys(pending).filter(function(k){return k.startsWith('assign:')})){var item=pending[key],r=await post('/api/v1/manager/company-management/scopes/assign',{companyUid:uid,scopeCode:item.scopeCode});total+=1;delete pending[key]}
 var scopeChanges=Object.keys(pending).filter(function(k){return k.startsWith('scope:')}).map(function(k){return pending[k]});
 if(scopeChanges.length){var sd=await post('/api/v1/manager/company-management/scopes/save',{companyUid:uid,changes:scopeChanges});total+=sd.updated;scopeChanges.forEach(function(x){delete pending['scope:'+x.scopeCode]})}
 for(var key of Object.keys(pending).filter(function(k){return k.startsWith('hours:')})){var item=pending[key],hd=await post('/api/v1/manager/company-management/scopes/hours',{companyUid:uid,scopeCode:item.scopeCode,hours:item.hours,expected:item.expected});total+=hd.updated;delete pending[key]}
 var companyChanges=Object.fromEntries(Object.entries(pending).filter(function(pair){return !pair[0].includes(':')}));
 if(Object.keys(companyChanges).length){var cd=await post('/api/v1/manager/company-management/save',{companyUid:uid,changes:companyChanges});total+=cd.updated;Object.keys(companyChanges).forEach(function(k){delete pending[k]})}
 await load(uid);saveError='';status.textContent='Saved '+total+' changes';
}catch(e){saveError='Save blocked: '+e.message;status.textContent=saveError}finally{busy=false;refreshSave()}
}
function renderDossier(){if(!selected)return;if(Object.keys(pending).length){status.textContent='Save changes before navigating';return}dossier.hidden=false;name.textContent=selected.name+' · '+selected.companyUid;details.replaceChildren();pending={};
if(tab==='company'){plain('Company',selected.name);plain('Status',selected.status);plain('Company UID',selected.companyUid);field('Company number','Number',selected.companyNumber);field('Group','Group',selected.companyGroup);field('Region','Region',selected.region);field('Country','Country',selected.country);field('Contact person','Contactperson ',selected.contactPerson);field('Contact email','Contactperson e-mail',selected.contactEmail,'email');field('Contact phone','Contactperson phone',selected.contactPhone);field('Communication language',' Language communication',selected.communicationLanguage);field('Time zone','Time zone',selected.timeZone);field('Manager email','Manager_Email',selected.managerEmail,'email');field('General comments','Comments',selected.generalComments,'multiline')}
if(tab==='scopes'){
 var assigned=selected.scopes.filter(function(x){return x.active}),inactive=selected.scopes.filter(function(x){return !x.active});
 plain('Assigned active scopes',assigned.length+' of '+companyCatalog.length+' available');
 var toolbar=el('div');toolbar.style.cssText='display:flex;gap:10px;align-items:center;margin:10px 0';var showInactive=el('button','Show inactive / available scopes');showInactive.type='button';toolbar.appendChild(showInactive);details.appendChild(toolbar);
 var tbl=el('table');tbl.style.minWidth='700px';var head=el('thead'),hr=el('tr');['Scope','Active','Default hours','Custom hours','Effective hours','Version'].forEach(function(v){hr.appendChild(el('th',v))});head.appendChild(hr);tbl.appendChild(head);var body=el('tbody');tbl.appendChild(body);details.appendChild(tbl);
 function draw(includeInactive){body.replaceChildren();var list=includeInactive?companyCatalog.filter(function(x){return x.active&&!x.archived}).map(function(x){return selected.scopes.find(function(y){return y.scopeCode===x.scopeCode})||{scopeCode:x.scopeCode,active:false,defaultHours:x.defaultHours,currentVersion:x.currentVersion||'',companyHours:'',hoursSource:'SCOPE_DEFAULT',unassigned:true}}).concat(selected.scopes.filter(function(x){return !companyCatalog.some(function(y){return y.scopeCode===x.scopeCode&&y.active&&!y.archived})})):assigned;list.forEach(function(x){var tr=el('tr');tr.appendChild(el('td',x.scopeCode));var active=el('td'),selector=el('select');['Yes','No'].forEach(function(v){var option=el('option',v);option.value=v;selector.appendChild(option)});selector.value=x.active?'Yes':'No';selector.disabled=!x.unassigned&&!companyCatalog.some(function(c){return c.scopeCode===x.scopeCode&&c.active&&!c.archived});selector.onchange=function(){var value=selector.value;if(x.unassigned){if(value==='Yes')pending['assign:'+x.scopeCode]={scopeCode:x.scopeCode};else delete pending['assign:'+x.scopeCode]}else if(value===(x.active?'Yes':'No'))delete pending['scope:'+x.scopeCode];else pending['scope:'+x.scopeCode]={scopeCode:x.scopeCode,expected:x.active?'Yes':'No',active:value};refreshSave()};active.appendChild(selector);tr.appendChild(active);tr.appendChild(el('td',x.defaultHours||'—'));var custom=el('td'),hoursInput=el('input');hoursInput.type='number';hoursInput.min='0.25';hoursInput.max='200';hoursInput.step='0.25';hoursInput.placeholder='Default';hoursInput.style.cssText='width:95px;padding:5px';hoursInput.value=x.hoursSource==='SCOPE_DEFAULT'?'':x.companyHours||'';hoursInput.disabled=!!x.unassigned||!x.active;hoursInput.title=x.unassigned?'Activate and save scope first, then set custom hours':'';hoursInput.oninput=function(){var value=hoursInput.value,initial=x.hoursSource==='SCOPE_DEFAULT'?'':String(x.companyHours||'');if(value===initial)delete pending['hours:'+x.scopeCode];else if(value===''||Number(value)>=0.25&&Number(value)<=200&&Math.round(Number(value)*4)===Number(value)*4)pending['hours:'+x.scopeCode]={scopeCode:x.scopeCode,hours:value,expected:initial};else {status.textContent='Custom hours must be between 0.25 and 200';delete pending['hours:'+x.scopeCode]}refreshSave()};custom.appendChild(hoursInput);tr.appendChild(custom);tr.appendChild(el('td',x.companyHours||x.defaultHours||'—'));tr.appendChild(el('td',x.currentVersion||'—'));body.appendChild(tr)});if(!list.length){var tr=el('tr'),td=el('td','No '+(includeInactive?'assigned':'active')+' scopes');td.colSpan=6;tr.appendChild(td);body.appendChild(tr)}}
 draw(false);showInactive.onclick=function(){var expanded=showInactive.dataset.expanded!=='yes';showInactive.dataset.expanded=expanded?'yes':'no';showInactive.textContent=expanded?'Show active scopes only':'Show inactive / available scopes';draw(expanded)};
 var note=el('p','Existing company scopes can be activated/deactivated with Save all. Custom hours create governed revisions. Existing legacy overrides require a replacement value before removal.');note.style.color='#64748b';details.appendChild(note);
}
if(tab==='locations'){plain('Active locations',selected.activeLocationCount);plain('HQ',selected.hqCode||'Needs review');var loc=JSON.parse(selected.locationsRaw||'[]');var initial=JSON.stringify(loc);function changed(){var v=JSON.stringify(loc);if(v===initial)delete pending.Locations_JSON;else pending.Locations_JSON={expected:selected.locationsRaw,value:v};refreshSave()}
loc.forEach(function(x,i){if(x.name===undefined&&x.label!==undefined)x.name=x.label;var h=el('h4',x.name||x.code);details.appendChild(h);function locationInput(label,key){var input=el('input');input.value=String(x[key]||'');input.style.cssText='padding:7px;border:1px solid #cbd5e1;border-radius:5px;width:100%;box-sizing:border-box';input.oninput=function(){x[key]=input.value;changed()};line(label,input)}locationInput('Location name','name');plain('Location code',x.code);locationInput('Address','address');locationInput('Postal code','postalCode');locationInput('City','city');locationInput('Country','country');locationInput('GPS coordinates','gps');var mapHolder=el('span');mapHolder.appendChild(gpsLink(x.gps));line('Google Maps',mapHolder);var gpsInput=details.querySelectorAll('input');var latestGps=gpsInput[gpsInput.length-1];if(latestGps)latestGps.addEventListener('input',function(){mapHolder.replaceChildren(gpsLink(latestGps.value))});locationInput('Location comment','comment');var active=el('select');['Yes','No'].forEach(function(v){var o=el('option',v);o.value=v;active.appendChild(o)});active.value=x.active!==false&&x.active!=='false'?'Yes':'No';active.onchange=function(){x.active=active.value==='Yes';changed()};line('Active',active);var hq=el('button',x.hq?'HQ ✓':'Set as HQ');hq.type='button';hq.dataset.hqButton='1';hq.onclick=function(){loc.forEach(function(y){y.hq=false});x.hq=true;x.active=true;changed();details.querySelectorAll('[data-hq-button]').forEach(function(button){button.textContent=button===hq?'HQ ✓':'Set as HQ'})};line('Headquarters',hq);function renderLocationButtons(){hq.textContent=x.hq?'HQ ✓':'Set as HQ'}}
);var add=el('button','Add location');add.type='button';add.onclick=function(){var code='S'+(loc.length+1);while(loc.some(function(x){return x.code===code}))code='S'+(Number(code.slice(1))+1);loc.push({code:code,name:'New location',address:'',postalCode:'',city:'',country:selected.country,gps:'',comment:'',active:true,hq:false});changed();status.textContent='New location staged. Save all before switching tabs.';var heading=el('p','New location '+code+' added. Save all, then reopen Locations to edit its fields.');details.appendChild(heading)};details.appendChild(add)}
if(tab==='planning'){
 var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],original=selected.preferredAuditMonths||'',current=new Set(original.split(',').map(function(x){return x.trim()}).filter(Boolean));
 var monthBox=el('div');monthBox.style.cssText='display:grid;grid-template-columns:repeat(6,minmax(55px,1fr));gap:7px;max-width:550px';
 monthNames.forEach(function(m){var label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=current.has(m);cb.onchange=function(){if(cb.checked)current.add(m);else current.delete(m);var value=monthNames.filter(function(n){return current.has(n)}).join(',');if(value===original)delete pending.Preferred_Audit_Months;else pending.Preferred_Audit_Months={expected:original,value:value};refreshSave()};label.append(cb,document.createTextNode(' '+m));monthBox.appendChild(label)});line('Preferred audit months',monthBox);
 var dayCodes=['Mo','Tu','We','Th','Fr','Sa','Su'],dayOriginal=selected.planningLimitationsDays||'',daysSelected=new Set(dayOriginal.split(',').map(function(x){return x.trim()}).filter(Boolean)),dayBox=el('div');dayBox.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
 dayCodes.forEach(function(day){var label=el('label'),check=el('input');check.type='checkbox';check.checked=daysSelected.has(day);check.onchange=function(){if(check.checked)daysSelected.add(day);else daysSelected.delete(day);var value=dayCodes.filter(function(x){return daysSelected.has(x)}).join(', ');if(value===dayOriginal)delete pending['Audit planning limitations - days'];else pending['Audit planning limitations - days']={expected:dayOriginal,value:value};refreshSave()};label.append(check,document.createTextNode(' '+day));dayBox.appendChild(label)});line('Planning limitations — days',dayBox);
 var hoursOriginal=selected.planningLimitationsHours||'',hoursWrap=el('div');hoursWrap.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap';var match=/^(\\d{2}:\\d{2})-(\\d{2}:\\d{2})$/.exec(hoursOriginal);var start=el('input'),end=el('input');start.type=end.type='time';start.value=match?match[1]:'';end.value=match?match[2]:'';function hoursChanged(){var value=start.value&&end.value?start.value+'-'+end.value:'';if((start.value&&!end.value)||(!start.value&&end.value)||start.value&&end.value&&start.value>=end.value){hoursError.textContent='Choose a valid start and end time';delete pending['Audit planning limitations - hours'];refreshSave();return}hoursError.textContent='';if(value===hoursOriginal)delete pending['Audit planning limitations - hours'];else pending['Audit planning limitations - hours']={expected:hoursOriginal,value:value};refreshSave()}start.onchange=end.onchange=hoursChanged;var hoursError=el('span');hoursError.style.color='#b91c1c';hoursWrap.append(start,document.createTextNode('to'),end,hoursError);line('Planning limitations — hours',hoursWrap);
 plain('Planning rules','Preferred months are soft preferences; existing planning limitations remain separate.');
}
if(tab==='governance'){plain('Data quality',selected.warnings.length?selected.warnings.join(', '):'No location warnings');plain('Auditor exclusions',selected.auditorExclusions);plain('Pending changes','Not yet connected')}
saveBar()}
function render(){var q=search.value.trim().toLowerCase(),mode=filter.value;rows.replaceChildren();var shown=companies.filter(function(c){return(!q||[c.name,c.region,c.country,...c.scopes.map(function(x){return x.scopeCode})].join(' ').toLowerCase().includes(q))&&(mode==='all'||mode==='active'&&c.status.toLowerCase()==='active'||mode==='attention'&&c.warnings.length>0)});shown.forEach(function(c){var tr=el('tr');[c.name,c.region,c.status,c.scopes.filter(function(x){return x.active}).map(function(x){return x.scopeCode}).join(', '),c.activeLocationCount,c.warnings.join(', ')].forEach(function(value,i){var td=el('td');if(i===0){var btn=el('button',value);btn.type='button';btn.onclick=function(){if(Object.keys(pending).length){status.textContent='Save changes before switching company';return}selected=c;tab='company';renderDossier();dossier.scrollIntoView({block:'nearest',behavior:'smooth'})};td.appendChild(btn)}else td.textContent=String(value);tr.appendChild(td)});rows.appendChild(tr)});status.textContent=shown.length+' / '+companies.length+' companies'}
async function load(uid){var response=await fetch('/api/v1/manager/company-management',{credentials:'same-origin'}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.detail||result.error||'COMPANY_READ_FAILED');companies=result.companies||[];companyCatalog=result.scopeCatalog||[];if(uid){selected=companies.find(function(x){return x.companyUid===uid})||null;if(selected)renderDossier()}render()}
open.onclick=function(){if(String(actorRole).toLowerCase()!=='manager')return;document.getElementById('scopeManagement20Panel').hidden=true;panel.hidden=false;load().catch(function(e){status.textContent=e.message})};close.onclick=function(){if(Object.keys(pending).length){status.textContent='Save changes before closing';return}panel.hidden=true};search.oninput=render;filter.onchange=render;document.querySelectorAll('[data-company-tab]').forEach(function(b){b.onclick=function(){if(Object.keys(pending).length){status.textContent='Save changes before switching tab';return}tab=b.dataset.companyTab;renderDossier()}});
})();
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(sess){if(!sess.ok||!sess.identity)throw new Error("SESSION_REQUIRED");actorRole=String(sess.identity.role||"Manager");document.getElementById("scopeManagement20").hidden=String(actorRole).toLowerCase()!=="manager";document.getElementById("companyManagement20").hidden=String(actorRole).toLowerCase()!=="manager";document.getElementById("identity").textContent=sess.identity.email+" · "+actorRole;applyActorUi();if(String(actorRole).toLowerCase()==="manager")initRelay().catch(function(e){console.warn("[WARM_GAS_WORKER_INIT]",e)});return loadOpen()}).catch(fail);
})();