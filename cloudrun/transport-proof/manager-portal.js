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
var swap20PreviewPrefetch={key:"",at:0,promise:null};
function swap20WarmPreview(rows){
 if(!Array.isArray(rows)||rows.length!==2)return;
 var pair={auditA:String(rows[0].auditId),auditB:String(rows[1].auditId)},key=[pair.auditA,pair.auditB].sort().join("|");
 if(swap20PreviewPrefetch.key===key&&Date.now()-swap20PreviewPrefetch.at<60000)return;
 var request=fetch("/api/v1/manager/swap20/preview",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(pair)}).then(function(r){return r.json().then(function(j){if(!r.ok||j.ok!==true)throw Error(String(j.error||"SWAP_PREVIEW_FAILED"));return j;})});
 swap20PreviewPrefetch={key:key,at:Date.now(),promise:request};
 request.catch(function(){/* Preview button can retry the canonical read on demand. */});
}
function updateSelectionUi(){
  gridVisibleIds=Array.from(document.querySelectorAll('#rows tr[data-audit-id]')).map(function(tr){return String(tr.getAttribute('data-audit-id')||'')}).filter(Boolean);
  document.querySelectorAll(".grid-select-row").forEach(function(cb){cb.checked=gridSelected.has(String(cb.getAttribute("data-audit-id")||""))});
  var head=document.getElementById("gridSelectAll"),visible=gridVisibleIds.filter(function(id){return gridSelected.has(id)}).length;
  if(head){head.checked=gridVisibleIds.length>0&&visible===gridVisibleIds.length;head.indeterminate=visible>0&&visible<gridVisibleIds.length}
  var n=gridSelected.size,bar=document.getElementById("selectionBar"),lab=document.getElementById("selectionCount"),batch=document.getElementById("selectionBatch"),concept=document.getElementById("selectionConcept");
  if(lab)lab.textContent=n+" selected";if(bar)bar.classList.toggle("visible",n>0);
  var auditorMode=String(actorRole).toLowerCase()==="auditor";
  var auditorSwap=document.getElementById("auditorSwapInbox20");if(auditorSwap)auditorSwap.hidden=!auditorMode;
  var managerSwap=document.getElementById("managerSwapInbox20");if(managerSwap)managerSwap.hidden=auditorMode;
  if(batch)batch.style.display=currentView==="open"&&!auditorMode?"":"none";
  if(concept)concept.style.display=currentView==="open"&&!auditorMode?"":"none";
  var swap=document.getElementById("selectionSwap20");
  if(swap){
    var chosen=selectionRows(),eligible=chosen.length===2&&chosen.every(function(r){return String(r.statusKey||"").toUpperCase()==="ACCEPTED"});
    swap.hidden=auditorMode||currentView!=="open"||n===0;
    swap.disabled=!eligible;
    if(eligible&&!auditorMode&&currentView==="open")swap20WarmPreview(chosen);
    swap.title=eligible?"Preview exchange of two Accepted audit time slots":"Select exactly two Accepted audits";
  }
  var bulkAccept=document.getElementById("selectionAcceptAuditor");if(bulkAccept){var elig=selectionRows().filter(function(r){return r.statusKey==="APPROVED"&&(r.allowedActions||[]).includes("ACCEPT")});bulkAccept.hidden=!(auditorMode&&currentView==="open"&&elig.length>0);bulkAccept.textContent="Accept selected ("+elig.length+")";bulkAccept.disabled=bulkAcceptRunning20;}
}
function bindSelectionControls(root){
  (root||document).querySelectorAll(".grid-select-row").forEach(function(cb){cb.addEventListener("change",function(){selectionToggle(cb.getAttribute("data-audit-id"),!!cb.checked)})});
  var h=document.getElementById("gridSelectAll");if(h)h.onchange=function(){selectionSelectVisible(!!h.checked)};
  updateSelectionUi();
}
function selectionRows(){var by={};all.forEach(function(r){if(r&&r.auditId)by[r.auditId]=r});return selectionIds().map(function(id){return by[id]}).filter(Boolean)}
var bulkAcceptRunning20=false;
async function acceptSelectedAudits20(){
 if(bulkAcceptRunning20||String(actorRole).toLowerCase()!=="auditor"||currentView!=="open")return;
 var selected=selectionRows().filter(function(r){return r.statusKey==="APPROVED"&&(r.allowedActions||[]).includes("ACCEPT")});
 if(!selected.length)return;
 if(!window.confirm("Accept "+selected.length+" selected audit(s)? Each audit will be verified separately."))return;
 bulkAcceptRunning20=true;updateSelectionUi();
 var ok=0,fail=0,firstError="",started=performance.now();
 for(var i=0;i<selected.length;i++){
   var audit=selected[i],id=audit.auditId;
   document.getElementById("status").textContent="Accepting "+(i+1)+"/"+selected.length+": "+audit.company;
   if(busyAudits.has(id)){fail++;continue}
   busyAudits.add(id);
   try{
     var response=await runActionViaCloudRun(id,"accept",{expectedRevision:audit.sourceRevision});
     var result=response.result||{};
     patchActionLikeV1(id,"accept","",result,{startedAt:performance.now(),patchMs:0});
     gridSelected.delete(id);ok++;
   }catch(err){fail++;if(!firstError)firstError=String(err.message||err)}
   finally{busyAudits.delete(id)}
 }
 bulkAcceptRunning20=false;updateSelectionUi();
 document.getElementById("status").textContent="Bulk ACCEPT: "+ok+" accepted, "+fail+" failed · "+Math.round(performance.now()-started)+" ms"+(firstError?" · First error: "+firstError:"");
}
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
function renderCards(){var c=openCounts||{},auditor=String(actorRole).toLowerCase()==="auditor",statuses=["PENDING_PLANNING","PENDING_APPROVAL","APPROVED","ACCEPTED"];var holder=document.getElementById("cards");holder.innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z,i){var active=auditor&&auditorCardStatusFilter20===statuses[i];return "<div class=card data-card-status='"+statuses[i]+"'"+(auditor?" role='button' tabindex='0' aria-pressed='"+(active?"true":"false")+"' title='Click to filter; click again to show all audits' style='cursor:pointer;"+(active?"outline:2px solid #2563eb;":"")+"'":"")+"><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("");if(auditor)holder.querySelectorAll("[data-card-status]").forEach(function(el){var click=function(){auditorCardFilterSet20(el.getAttribute("data-card-status"))};el.addEventListener("click",click);el.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();click()}})})}
function adjustCounters(beforeKey,afterKey){if(beforeKey===afterKey)return;var b=bucketKey(beforeKey),a=bucketKey(afterKey);if(b)openCounts[b]=Math.max(0,Number(openCounts[b]||0)-1);if(a)openCounts[a]=Number(openCounts[a]||0)+1;if(b&&!a)openCounts.total=Math.max(0,Number(openCounts.total||0)-1);if(!b&&a)openCounts.total=Number(openCounts.total||0)+1;renderCards()}
function renderHead(){var h=document.getElementById("gridHead");if(!h)return;var sel="<th class=\"select-head\"><input id=\"gridSelectAll\" type=\"checkbox\" aria-label=\"Select all visible\"></th>";if(currentView==="completed")h.innerHTML="<tr>"+sel+"<th>Company</th><th>Region</th><th>Scopes</th><th>Executed on</th><th class=\"auditor-head\">Auditor</th><th>Hours planned</th><th>Hours dedicated</th><th>Completed date</th><th>Status</th><th>Actions</th></tr>";else h.innerHTML="<tr>"+sel+"<th>Company</th><th class=\"locations-head\">Locations</th><th class=\"region-head\">Region</th><th class=\"map-head\">GPS / Map</th><th>Scopes</th><th>Status</th><th class=\"expiry-head\">Expiration date</th><th>Planning window</th><th class=\"self-head\">Self planning</th><th>Date planned</th><th class=\"required-head\">To be planned</th><th>Hours planned</th><th class=\"auditor-head\">Auditor</th><th class=\"alert-head\">Alert</th><th>Actions</th></tr>"}
function extensionControls(r){if(String(actorRole).toLowerCase()==="auditor")return "";var months=Number(r.extensionMonths||r.extMonths||0),applied=!!(r.extensionApplied||r.extApplied),pending=r.statusKey==="PENDING_PLANNING",can=!!r.canExtend;if(!pending)return "";if(months>0&&r.canExtend==null)return " <span class=\"muted ext-checking\" title=\"Checking canonical extension eligibility\" aria-label=\"Checking extension eligibility\">…</span>";if(applied&&can)return " <button class=\"ext-act ext-undo\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"undo\" title=\"Undo applied extension\" aria-label=\"Undo applied extension\">&#8634;</button>";if(!can||months<=0)return "";return " <button class=\"ext-act ext-apply\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"apply\" title=\"Apply extension (+"+esc(months)+" months)\" aria-label=\"Apply extension\">+</button>"}
function renderOpenRow(r){var raw=r.allowedActions||[],ui=[];if(String(actorRole).toLowerCase()==="auditor")raw=raw.filter(function(x){return x==="PLAN"||x==="ACCEPT"||x==="CANCEL"||x==="COMPLETE"});if(raw.indexOf("PLAN")>=0)ui.push({key:"plan",label:"Plan"});if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});if(raw.indexOf("ACCEPT")>=0)ui.push({key:"accept",label:"Accept"});if(raw.indexOf("COMPLETE")>=0)ui.push({key:"complete",label:"Complete"});if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});var actions=ui.map(function(a){return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>"}).join(""),formalClass=hoursClass(r.requiredHours,r.hoursPlanned),loc=locationText(r),self=r.allowSelfPlanning===true||String(r.allowSelfPlanning).toLowerCase()==="true"?"Yes":"No",windowText=r.planningWindowText||([r.planningWindowFrom,r.planningWindowTo].filter(Boolean).join(" → "));return "<tr data-audit-id=\""+esc(r.auditId)+"\"><td class=\"select-cell\"><input type=\"checkbox\" class=\"grid-select-row\" data-audit-id=\""+esc(r.auditId)+"\" "+(gridSelected.has(String(r.auditId||""))?"checked":"")+"></td><td class=\"company-cell\">"+esc(text(r.company))+"</td><td class=\"locations-cell\" title=\""+esc(loc)+"\">"+esc(text(loc))+"</td><td class=\"region-cell\">"+esc(text(r.region))+"</td>"+mapCell(r)+"<td class=\"scopes-cell\">"+esc(text(r.scopesText))+"</td><td>"+esc(displayStatus(r.status))+"</td><td class=\"expiry-cell\">"+esc(text(compactDate(effectiveExpiry(r))))+"</td><td class=\"window-cell\"><span>"+esc(text(windowText))+"</span>"+extensionControls(r)+"</td><td class=\"self-cell\">"+self+"</td><td>"+plannedDateCell(r)+"</td><td class=\"required-cell\">"+esc(text(r.requiredHours))+"</td><td class=\""+formalClass+"\">"+hoursPlannedCell(r)+"</td><td class=\"auditor-cell\">"+esc(text(r.assignedToDisplayName||r.auditorDisplayName||r.assignedTo||r.auditor))+"</td>"+alertCell(r)+"<td class=\"actions-cell\">"+actions+"</td></tr>"}
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
  var endpoint=String(actorRole).toLowerCase()==='auditor'?'/api/v1/auditor/action':'/api/v1/manager/action';return fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,action:action,options:options||{}})})
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
    after.status='Accepted';after.statusKey='ACCEPTED';after.allowedActions=String(actorRole).toLowerCase()==='auditor'?['COMPLETE']:['CANCEL','REJECT']
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
  if(action==='accept'&&button.getAttribute('data-email-confirm')!=='true'&&!window.confirm('Accept audit '+auditId+'?'))return;
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
      if(action==='accept'&&button.getAttribute('data-email-confirm')==='true'){document.getElementById('emailActionPrompt20')?.remove();try{var cleanUrl=new URL(window.location.href);cleanUrl.searchParams.delete('emailAction');cleanUrl.searchParams.delete('auditId');history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search)}catch(e){}}
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
var auditorCardStatusFilter20="";
function filter(){
 var z=document.getElementById("q").value.toLowerCase().trim();
 var status=String(actorRole).toLowerCase()==="auditor"?auditorCardStatusFilter20:"";
 var rows=all.filter(function(r){
  var key=String(r.statusKey||r.status||"").trim().toUpperCase().replace(/\s+/g,"_");
  return (!status||(key===status&&(status!=="APPROVED"||(r.allowedActions||[]).includes("ACCEPT"))))&&(!z||searchable(r).indexOf(z)>=0);
 });
 render(rows);
}
function auditorCardFilterSet20(status){
 if(String(actorRole).toLowerCase()!=="auditor")return;
 auditorCardStatusFilter20=auditorCardStatusFilter20===status?"":status;
 try{var url=new URL(window.location.href);url.searchParams.delete("status");if(auditorCardStatusFilter20)url.searchParams.set("status",auditorCardStatusFilter20);window.history.replaceState(null,"",url.pathname+url.search+url.hash)}catch(e){}
 renderCards();filter();
}
function focusEmailAudit20(){
 var params;try{params=new URLSearchParams(window.location.search)}catch(e){return}
 var requested=params.get('auditId')||'',requestedAction=String(params.get('emailAction')||'').toUpperCase();
 if(String(params.get('status')||'').toUpperCase()==='APPROVED' && String(actorRole).toLowerCase()==='auditor'){
  var sel=document.getElementById('auditorStatusFilter20');if(sel)sel.value='APPROVED';
  auditorCardStatusFilter20='APPROVED';renderCards();
  var pending=all.filter(function(r){return String(r.statusKey||r.status||'').trim().toUpperCase()==='APPROVED' && (r.allowedActions||[]).includes('ACCEPT')});
  var qAll=document.getElementById('q');if(qAll)qAll.value='';
  render(pending);
  document.getElementById('status').textContent=pending.length+' audits pending your acceptance';
  return;
 }
 if(!requested||requested.length>256)return;
 var match=all.find(function(r){return String(r.auditId||'')===requested});
 if(!match){document.getElementById('status').textContent='Email audit not available for this account or current status';return}
 var q=document.getElementById('q');if(q)q.value='';
 render([match]);
 var status=document.getElementById('status');status.textContent='Audit from email · '+requested;
 document.getElementById('emailActionPrompt20')?.remove();
 if(!requestedAction)return;
 var possible=String(actorRole).toLowerCase()==='auditor'?['ACCEPT','CANCEL']:['APPROVE'];
 if(!possible.includes(requestedAction)||!(match.allowedActions||[]).includes(requestedAction)){
  status.textContent='Email action unavailable for this audit or logged-in role. No status was changed.';
  return;
 }
 var banner=document.createElement('div');banner.id='emailActionPrompt20';banner.style.cssText='padding:12px;margin:10px 0;border:1px solid #b8c9e8;border-radius:8px;background:#f8fafc';
 var message=document.createElement('span');message.textContent='Email action: '+requestedAction+' · '+String(match.company||requested)+'. Review the audit and confirm below. ';
 var button=document.createElement('button');button.type='button';button.className='act';button.textContent='Confirm '+requestedAction;
 button.setAttribute('data-audit-id',requested);button.setAttribute('data-action',requestedAction.toLowerCase());
 button.setAttribute('data-email-confirm','true');
 button.addEventListener('click',function(){button.disabled=true;message.textContent='Processing '+requestedAction+'…';runAction(button)});
 banner.appendChild(message);banner.appendChild(button);
 status.parentNode.insertBefore(banner,status.nextSibling);
}

function setTabs(){document.getElementById("completedView").style.background=currentView==="completed"?"#dbeafe":"white";document.getElementById("openView").style.background=currentView==="open"?"#dbeafe":"white"}
function loadOpenEnrichment(seq){if(String(actorRole).toLowerCase()==="auditor")return Promise.resolve();var ids=all.map(function(r){return r.auditId}).filter(Boolean),sx=window.scrollX,sy=window.scrollY;if(!ids.length)return Promise.resolve();var started=performance.now();return fetch('/api/v1/manager/open-enrichment',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditIds:ids})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Open audit enrichment failed');return x})}).then(function(x){if(seq!==enrichmentSeq||currentView!=="open")return;var by={};(x.rows||[]).forEach(function(r){if(r&&r.auditId)by[r.auditId]=r});all.forEach(function(r,i){if(by[r.auditId]){var p=Object.assign({},by[r.auditId]);delete p.locationsToPlan;delete p.locs;delete p.locations;delete p.locationCount;delete p.gps;delete p.gpsData;delete p.coordinates;all[i]=Object.assign({},r,p)}});filter();window.scrollTo(sx,sy);var ms=Math.round(performance.now()-started);document.getElementById("status").textContent=all.length+" open audits · decision-ready "+ms+" ms enrichment"}).catch(function(e){if(seq!==enrichmentSeq)return;console.warn('[OPEN_AUDITS_ENRICHMENT]',e);document.getElementById("status").textContent=all.length+" open audits · base loaded; enrichment unavailable"})}
function loadOpen(){if(currentView!=="open")selectionClear();currentView="open";lastPassiveRefreshAt=Date.now();var seq=++enrichmentSeq;return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(!x.success)throw new Error([x.error,x.detail].filter(Boolean).join(": ")||x.message||"Read failed");all=x.rows.slice();openCounts=Object.assign({total:all.length,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0},x.counts||{});var identity=document.getElementById("identity"),displayName=String(x.actorDisplayName||"").trim();if(identity&&displayName)identity.textContent=displayName+" · "+actorRole;document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms base";renderCards();setTabs();filter();focusEmailAudit20();return loadOpenEnrichment(seq)}).catch(fail)}
function loadCompleted(){if(currentView!=="completed")selectionClear();currentView="completed";++enrichmentSeq;return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){if(a.success===false)throw new Error(a.error||a.message||"Read failed");all=(a.rows||[]).slice();document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";setTabs();filter()}).catch(fail)}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
function applyActorUi(){var isAud=String(actorRole).toLowerCase()==="auditor",title=document.getElementById("portalTitle"),batch=document.getElementById("selectionBatch"),concept=document.getElementById("selectionConcept");document.body.classList.toggle("actor-auditor",isAud);document.body.classList.toggle("actor-manager",!isAud);if(title)title.textContent=isAud?"Auditor · Audit Grid 2.0":"Manager · Audit Grid 2.0";if(batch)batch.style.display=isAud?"none":batch.style.display;if(concept)concept.style.display=isAud?"none":concept.style.display;}
var passiveRefreshBusy=false,lastPassiveRefreshAt=Date.now();
function passiveRefreshOpen(){
  if(currentView!=="open"||passiveRefreshBusy||document.visibilityState==="hidden"||!document.getElementById("scopeManagement20Panel").hidden)return Promise.resolve();
  var now=Date.now();if(now-lastPassiveRefreshAt<30000)return Promise.resolve();
  passiveRefreshBusy=true;lastPassiveRefreshAt=now;
  var sx=window.scrollX,sy=window.scrollY,q=document.getElementById("q").value;
  return loadOpen().then(function(){
    document.getElementById("q").value=q;filter();window.scrollTo(sx,sy);
  }).finally(function(){passiveRefreshBusy=false});
}
window.addEventListener("focus",function(){passiveRefreshOpen()});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")passiveRefreshOpen()});
document.getElementById("selectionAcceptAuditor").onclick=acceptSelectedAudits20;
document.getElementById("q").addEventListener("input",filter);document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};document.getElementById("openView").onclick=loadOpen;document.getElementById("completedView").onclick=loadCompleted;
document.getElementById("selectionSwap20").onclick=async function(){
  if(String(actorRole).toLowerCase()!=="manager"||currentView!=="open")return;
  var selected=selectionRows();
  if(selected.length!==2||gridSelected.size!==2||selected.some(function(r){return String(r.statusKey||"").toUpperCase()!=="ACCEPTED"})){
    document.getElementById("status").textContent="Select exactly two accepted audits to propose a date exchange.";return;
  }
  var pair={auditA:String(selected[0].auditId),auditB:String(selected[1].auditId)};
  var panel=document.getElementById("swap20PreviewDialog");
  if(!panel){
    panel=document.createElement("dialog");panel.id="swap20PreviewDialog";
    panel.setAttribute("aria-labelledby","swap20DialogTitle");
    panel.style.cssText="width:min(720px,96vw);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:10px;padding:22px;color:#172033";
    panel.innerHTML='<h2 id="swap20DialogTitle">Propose audit date exchange</h2>'+
      '<p id="swap20Explanation">Checking the planned audit dates...</p>'+
      '<div id="swap20PreviewContent"></div>'+
      '<div id="swap20ReasonForm" hidden style="margin:14px 0">'+
      '<label for="swap20InternalReason" style="display:block">Internal reason for date change *</label>'+
      '<textarea id="swap20InternalReason" rows="2" maxlength="500" style="width:100%;margin:5px 0 12px"></textarea>'+
      '<label for="swap20EcasComment" style="display:block">Explanation for audit participants *</label>'+
      '<textarea id="swap20EcasComment" rows="2" maxlength="1000" style="width:100%;margin:5px 0 12px"></textarea></div>'+
      '<p id="swap20Feedback" role="status" aria-live="polite"></p>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px">'+
      '<button type="button" id="swap20CreateProposal" hidden>Submit date change request</button>'+
      '<button type="button" id="swap20RefreshStatus" hidden>Refresh request status</button>'+
      '<button type="button" id="swap20Apply" hidden>Apply date exchange</button>'+
      '<button type="button" id="swap20Withdraw" hidden>Withdraw request</button>'+
      '<button type="button" id="swap20Close">Close</button></div>';
    document.body.appendChild(panel);
    panel.querySelector("#swap20Close").onclick=function(){panel.close()};
  }
  var content=panel.querySelector("#swap20PreviewContent"),explain=panel.querySelector("#swap20Explanation");
  var form=panel.querySelector("#swap20ReasonForm"),feedback=panel.querySelector("#swap20Feedback");
  var create=panel.querySelector("#swap20CreateProposal"),refresh=panel.querySelector("#swap20RefreshStatus"),apply=panel.querySelector("#swap20Apply"),withdraw=panel.querySelector("#swap20Withdraw");
  var internal=panel.querySelector("#swap20InternalReason"),ecas=panel.querySelector("#swap20EcasComment");
  var requestId="SWAP20_"+(window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID().replace(/-/g,""):String(Date.now())+"_"+Math.random().toString(36).slice(2));
  var submitted=false,busy=false,preview=null;
  content.replaceChildren();explain.textContent="Checking the planned audit dates...";
  feedback.textContent="";form.hidden=true;create.hidden=true;refresh.hidden=true;apply.hidden=true;withdraw.hidden=true;
  internal.value="";ecas.value="";internal.disabled=false;ecas.disabled=false;create.disabled=false;refresh.disabled=false;apply.disabled=false;withdraw.disabled=false;
  async function swapRequest(operation,body){
    var response=await fetch("/api/v1/manager/swap20/"+operation,{
      method:"POST",credentials:"same-origin",
      headers:{"content-type":"application/json"},body:JSON.stringify(body)
    });
    var data=await response.json().catch(function(){return {ok:false,error:"INVALID_SWAP_API_RESPONSE"}});
    if(!response.ok||data.ok!==true)throw Error(String(data.error||"SWAP_API_FAILED"));
    return data;
  }
  function schedule(blocks){
    if(!Array.isArray(blocks))return "(no verified schedule)";
    return blocks.map(function(b){return String(b.date||"")+" "+String(b.start||"")+"–"+String(b.end||"")}).join("; ");
  }
  function line(title,text){
    var p=document.createElement("p");p.style.margin="7px 0";
    var b=document.createElement("strong");b.textContent=title+" ";
    p.append(b,document.createTextNode(text));content.appendChild(p);
  }
  function showStatus(data){
    var status=String(data.status||"unknown"),applied=status==="APPLIED"||data.committed===true;
    var labels={AWAITING_ACKNOWLEDGEMENT:"Awaiting auditor confirmation",ESCALATED:"Auditor confirmation overdue",CONFIRMED:"Confirmed by auditor; ready for manager review",DECLINED:"Declined by auditor",WITHDRAWN:"Withdrawn",APPLIED:"Date exchange completed"};
    var canApply=!applied&&status==="CONFIRMED";
    apply.hidden=!canApply;
    if(applied){refresh.hidden=true;withdraw.hidden=true;apply.hidden=true;}
    var count=data.requiredCount!=null?" ("+String(data.acknowledgedCount||0)+" of "+String(data.requiredCount)+" auditors confirmed).":".";
    feedback.textContent=applied?"The date exchange has been applied. "+(data.notificationQueued?"Participant notification has been queued.":"Participant notification is pending."):
      "Date change request received. "+(labels[status]||"Check the request status")+count+" The audit dates have not been changed.";
  }
  if(typeof panel.showModal==="function"){if(!panel.open)panel.showModal();}else panel.setAttribute("open","");
  try{
    var prefetchKey=[pair.auditA,pair.auditB].sort().join("|");
    preview=swap20PreviewPrefetch.key===prefetchKey&&Date.now()-swap20PreviewPrefetch.at<60000?await swap20PreviewPrefetch.promise.catch(function(){return swapRequest("preview",pair);}):await swapRequest("preview",pair);
    if(!preview.eligible){explain.textContent="This Accepted pair cannot be swapped: "+String(preview.reason||"not eligible");return;}
    explain.textContent=preview.requiresAcknowledgement?
      "The proposed audit dates will change. The assigned auditor(s) must confirm before the change is applied.":
      "Only the audit times will change; auditor confirmation is not required.";
    line("Audit A:",String(selected[0].company||"Audit A"));line("Assigned auditor:",String(selected[0].assignedToDisplayName||selected[0].auditorDisplayName||selected[0].auditorName||selected[0].assignedTo||"Not assigned"));
    line("Current planned date:",schedule(preview.beforeA&&preview.beforeA.blocks));
    line("Proposed new date:",schedule(preview.afterA));
    line("Audit B:",String(selected[1].company||"Audit B"));line("Assigned auditor:",String(selected[1].assignedToDisplayName||selected[1].auditorDisplayName||selected[1].auditorName||selected[1].assignedTo||"Not assigned"));
    line("Current planned date:",schedule(preview.beforeB&&preview.beforeB.blocks));
    line("Proposed new date:",schedule(preview.afterB));
    form.hidden=false;create.hidden=false;
    feedback.textContent="This is a preview. Submitting a request does not change the audit planning or notify audit participants.";
  }catch(error){
    explain.textContent="The audit date exchange cannot be previewed.";
    feedback.textContent=String(error.message||error);
    return;
  }
  create.onclick=async function(){
    if(busy||submitted)return;
    if(!String(internal.value||"").trim()||!String(ecas.value||"").trim()){
      feedback.textContent="Enter both an internal reason and an explanation for audit participants.";return;
    }
    busy=true;create.disabled=true;feedback.textContent="Submitting date change request...";
    try{
      var saved=await swapRequest("propose",Object.assign({},pair,{
        operationId:requestId,internalReason:internal.value,ecasComment:ecas.value
      }));
      submitted=true;internal.disabled=true;ecas.disabled=true;create.hidden=true;
      refresh.hidden=false;withdraw.hidden=false;
      showStatus(saved);
    }catch(error){feedback.textContent="The request could not be confirmed. It may already have been recorded. Check Audit date changes before trying again.";create.disabled=false;}
    finally{busy=false;}
  };
  refresh.onclick=async function(){
    if(busy||!submitted)return;
    busy=true;refresh.disabled=true;
    try{showStatus(await swapRequest("status",{operationId:requestId}));}
    catch(error){feedback.textContent=String(error.message||error);}
    finally{busy=false;refresh.disabled=false;}
  };
  apply.onclick=async function(){
    if(busy||!submitted||apply.hidden||!window.confirm("Apply this SWAP in DEV? Both Accepted audits will exchange time slots."))return;
    busy=true;apply.disabled=true;feedback.textContent="Verifying and committing the paired SWAP...";
    try{
      var outcome=await swapRequest("commit",{operationId:requestId});
      if(outcome.committed!==true)throw Error("SWAP_COMMIT_NOT_CONFIRMED");
      showStatus(outcome);
      selectionClear();
      await loadOpen();
    }catch(error){feedback.textContent="SWAP not confirmed: "+String(error.message||error);}
    finally{busy=false;apply.disabled=false;}
  };
  withdraw.onclick=async function(){
    if(busy||!submitted||!window.confirm("Withdraw this audit date change request? Accepted audits will remain unchanged."))return;
    busy=true;withdraw.disabled=true;
    try{
      var result=await swapRequest("withdraw",{operationId:requestId});
      feedback.textContent="Date change request withdrawn. The audit dates have not been changed.";
      refresh.hidden=true;withdraw.hidden=true;apply.hidden=true;
    }catch(error){feedback.textContent=String(error.message||error);withdraw.disabled=false;}
    finally{busy=false;}
  };
};
// Auditor-only SWAP acknowledgement inbox. Never relies on browser-provided UID.
// Role-scoped SWAP attention is outstanding work, never a browser-only unread counter.
// The role's pending SWAP list starts loading during portal login,
 // concurrently with grid data. Opening the dialog shares the in-flight request.
var swap20ListCache={manager:null,auditor:null};
var swap20ListPending={manager:null,auditor:null};
async function swap20GridRequest(role,operation,body){
  if(operation==="list"){
    var cached=swap20ListCache[role];
    if(cached&&Date.now()-cached.at<12000)return cached.data;
    if(swap20ListPending[role])return swap20ListPending[role];
    var inflight=swap20GridFetch(role,operation,body).then(function(data){
      swap20ListCache[role]={at:Date.now(),data:data};return data;
    }).finally(function(){swap20ListPending[role]=null;});
    swap20ListPending[role]=inflight;return inflight;
  }
  var result=await swap20GridFetch(role,operation,body);
  swap20ListCache.manager=null;swap20ListCache.auditor=null;
  return result;
}
async function swap20GridFetch(role,operation,body){
  var response=await fetch("/api/v1/"+role+"/swap20/"+operation,{
    method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
    body:JSON.stringify(body||{})});
  var data=await response.json().catch(function(){return {ok:false,error:"SWAP_RESPONSE_INVALID"}});
  if(!response.ok||data.ok!==true)throw Error(String(data.error||data.code||data.status||"SWAP_REQUEST_FAILED"));
  return data;
}
function swap20BadgeUpdate(role,count){
  var badge=document.getElementById(role==="manager"?"managerSwapBadge20":"auditorSwapBadge20");
  if(!badge)return;
  count=Number(count)||0;badge.hidden=count<=0;badge.textContent=count>99?"99+":String(count);
  badge.style.cssText="display:"+(count>0?"inline-flex":"none")+";align-items:center;justify-content:center;margin-left:4px;min-width:19px;height:19px;border-radius:12px;padding:0 5px;background:#dc2626;color:#fff;font-weight:700;font-size:11px";
}
async function swap20RefreshAttention(){
  var role=String(actorRole).toLowerCase();
  if(!["manager","auditor"].includes(role))return;
  try{
    var result=await swap20GridRequest(role,"list",{});
    swap20BadgeUpdate(role,result.attentionCount||0);
  }catch(error){console.warn("[SWAP20_ATTENTION_UNAVAILABLE]",String(error.message||error));}
}
document.getElementById("managerSwapInbox20").onclick=async function(){
  if(String(actorRole).toLowerCase()!=="manager")return;
  var panel=document.getElementById("managerSwap20InboxDialog");
  if(!panel){
    panel=document.createElement("dialog");panel.id="managerSwap20InboxDialog";
    panel.setAttribute("aria-labelledby","managerSwap20InboxTitle");
    panel.style.cssText="width:min(790px,96vw);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:10px;padding:20px";
    panel.innerHTML='<h2 id="managerSwap20InboxTitle">Audit date change requests</h2>'+
      '<p id="managerSwap20Status" role="status" aria-live="polite"></p><div id="managerSwap20Items"></div>'+
      '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" id="managerSwap20Reload">Refresh</button>'+
      '<button type="button" id="managerSwap20Close">Close</button></div>';
    document.body.appendChild(panel);
    panel.querySelector("#managerSwap20Close").onclick=function(){panel.close()};
  }
  var status=panel.querySelector("#managerSwap20Status"),items=panel.querySelector("#managerSwap20Items");
  function blocks(v){return (Array.isArray(v)?v:[]).map(function(b){return String(b.date||"")+" "+String(b.start||"")+"–"+String(b.end||"")}).join("; ");}
  async function reload(){
    status.textContent="Loading audit date change requests...";items.replaceChildren();
    try{
      var result=await swap20GridRequest("manager","list",{});
      var proposals=Array.isArray(result.items)?result.items:[];
      swap20BadgeUpdate("manager",result.attentionCount||0);
      status.textContent=proposals.length+" open date change request(s); "+String(result.attentionCount||0)+" awaiting manager action.";
      proposals.forEach(function(p){
        var card=document.createElement("section");card.style.cssText="border:1px solid #cbd5e1;border-radius:9px;margin:10px 0;padding:12px";
        function info(title,value){
          var line=document.createElement("p");line.style.margin="6px 0";
          var bold=document.createElement("strong");bold.textContent=title+" ";
          line.append(bold,document.createTextNode(String(value||"")));card.appendChild(line);
        }
        info("Status:",({AWAITING_ACKNOWLEDGEMENT:"Awaiting auditor confirmation",ESCALATED:"Auditor confirmation overdue",CONFIRMED:"Confirmed by auditor; awaiting manager action",DECLINED:"Declined by auditor",APPLIED:"Applied",WITHDRAWN:"Withdrawn"})[p.status]||"Status unavailable");
        var aRow=all.find(function(r){return r.auditId===p.auditA});info("Audit A:",String(aRow?.company||"Audit")+" → "+blocks(p.blocksA));if(aRow)info("Assigned auditor:",aRow.assignedToDisplayName||aRow.auditorName||aRow.assignedTo||"Not assigned");
        var bRow=all.find(function(r){return r.auditId===p.auditB});info("Audit B:",String(bRow?.company||"Audit")+" → "+blocks(p.blocksB));if(bRow)info("Assigned auditor:",bRow.assignedToDisplayName||bRow.auditorName||bRow.assignedTo||"Not assigned");
        info("Operation ID:",p.operationId);info("Auditor confirmations:",String(p.acknowledgedCount||0)+" / "+String(p.requiredCount||0));
        info("Internal reason:",p.internalReason);info("Explanation for participants:",p.ecasComment);
        if(p.status==="CONFIRMED"){
          var inspect=document.createElement("button");inspect.type="button";inspect.textContent="Inspect journal (read-only)";inspect.style.marginLeft="8px";inspect.onclick=async function(){inspect.disabled=true;try{var v=await swap20GridRequest("manager","status",{operationId:p.operationId});status.textContent="Canonical: "+String(v.status||"UNKNOWN")+" | Journal: "+String(v.journalStage||"UNAVAILABLE (GAS bridge not updated)")+" | Sequence: "+String(v.journalSequence??"unavailable")+" | Manual review: "+String(v.journalRequiresManualReview==null?"unknown":v.journalRequiresManualReview===true)+" | Commit enabled: "+String(v.commitEnabled===true);}catch(e){status.textContent="Journal inspection failed: "+String(e&&e.message||e).slice(0,120);}finally{inspect.disabled=false;}};card.appendChild(inspect);
          var apply=document.createElement("button");apply.type="button";apply.textContent="Apply date exchange";
          apply.style.marginLeft="8px";
          apply.onclick=async function(){
            if(!window.confirm("Apply this approved date change in DEV? Both audit schedules will change."))return;
            apply.disabled=true;status.textContent="Applying confirmed audit date exchange...";
            try{
              var outcome=await swap20GridRequest("manager","commit",{operationId:p.operationId});
              if(outcome.committed!==true)throw Error("SWAP_COMMIT_NOT_CONFIRMED");
              await reload();selectionClear();await loadOpen();
            }catch(e){var code=String(e&&e.message||e||"SWAP_REQUEST_FAILED").slice(0,120);status.textContent=code==="SWAP_ATOMIC_WRITE_DISABLED"?"The final date change is not yet enabled. The confirmed request remains saved.":"The date exchange could not be confirmed (diagnostic: "+code+"). Check the request status before retrying.";console.error("[SWAP20_MANAGER_COMMIT_FAILED]",{operationId:p.operationId,code:code});try{var verified=await swap20GridRequest("manager","status",{operationId:p.operationId});status.textContent+=" Canonical request: "+String(verified.status||"UNKNOWN")+". Journal: "+String(verified.journalStage||"UNAVAILABLE (GAS bridge not updated)")+" (sequence "+String(verified.journalSequence??"unavailable")+"). Manual review: "+String(verified.journalRequiresManualReview==null?"unknown":verified.journalRequiresManualReview===true)+". Commit enabled: "+String(verified.commitEnabled===true)+". No automatic retry.";}catch(verifyError){status.textContent+=" Read-only status verification failed: "+String(verifyError&&verifyError.message||verifyError).slice(0,80)+".";} }
            finally{apply.disabled=false;}
          };
          card.appendChild(apply);
        }
        if(["AWAITING_ACKNOWLEDGEMENT","ESCALATED","CONFIRMED"].includes(p.status)){
          var withdraw=document.createElement("button");withdraw.type="button";withdraw.textContent="Withdraw";
          withdraw.style.marginLeft="8px";
          withdraw.onclick=async function(){
            if(!window.confirm("Withdraw this audit date change request?"))return;
            withdraw.disabled=true;
            try{await swap20GridRequest("manager","withdraw",{operationId:p.operationId});await reload();}
            catch(e){status.textContent=String(e.message||e);withdraw.disabled=false;}
          };
          card.appendChild(withdraw);
        }
        items.appendChild(card);
      });
    }catch(error){status.textContent=String(error.message||error);}
  }
  panel.querySelector("#managerSwap20Reload").onclick=function(){swap20ListCache.manager=null;reload();};
  if(typeof panel.showModal==="function"){if(!panel.open)panel.showModal();}else panel.setAttribute("open","");
  await reload();
};
document.getElementById("auditorSwapInbox20").onclick=async function(){
  if(String(actorRole).toLowerCase()!=="auditor")return;
  var panel=document.getElementById("auditorSwap20InboxDialog");
  if(!panel){
    panel=document.createElement("dialog");panel.id="auditorSwap20InboxDialog";
    panel.setAttribute("aria-labelledby","auditorSwap20InboxTitle");
    panel.style.cssText="width:min(680px,95vw);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:10px;padding:20px";
    panel.innerHTML='<h2 id="auditorSwap20InboxTitle">Audit date changes</h2>'+
      '<p id="auditorSwap20Status" role="status" aria-live="polite"></p>'+
      '<div id="auditorSwap20Items"></div>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button type="button" id="auditorSwap20Reload">Refresh</button>'+
      '<button type="button" id="auditorSwap20Close">Close</button></div>';
    document.body.appendChild(panel);
    panel.querySelector("#auditorSwap20Close").onclick=function(){panel.close()};
  }
  var message=panel.querySelector("#auditorSwap20Status"),items=panel.querySelector("#auditorSwap20Items");
  async function request(operation,payload){
    var response=await fetch("/api/v1/auditor/swap20/"+operation,{
      method:"POST",credentials:"same-origin",
      headers:{"content-type":"application/json"},body:JSON.stringify(payload||{})
    });
    var data=await response.json().catch(function(){return {ok:false,error:"SWAP_RESPONSE_UNAVAILABLE"}});
    if(!response.ok||data.ok!==true)throw Error(String(data.error||"SWAP_REQUEST_FAILED"));
    return data;
  }
  function schedule(blocks){
    return (Array.isArray(blocks)?blocks:[]).map(function(b){
      return String(b.date||"")+" "+String(b.start||"")+"–"+String(b.end||"");
    }).join("; ");
  }
  async function reload(){
    message.textContent="Loading assigned Audit date changes...";items.replaceChildren();
    try{
      var result=await swap20GridRequest("auditor","list",{});
      var data=Array.isArray(result.items)?result.items:[];
      message.textContent=data.length?data.length+" date change request(s) awaiting your review.":"No date change requests awaiting your review.";
      data.forEach(function(item){
        var card=document.createElement("section");
        card.style.cssText="border:1px solid #cbd5e1;padding:12px;border-radius:8px;margin:9px 0";
        function info(title,value){
          var p=document.createElement("p");p.style.margin="6px 0";
          var b=document.createElement("strong");b.textContent=title+" ";
          p.append(b,document.createTextNode(value));card.appendChild(p);
        }
        
        info("Status:",({AWAITING_ACKNOWLEDGEMENT:"Awaiting your confirmation",ESCALATED:"Your confirmation is overdue",CONFIRMED:"Confirmed",DECLINED:"Declined",APPLIED:"Date exchange completed"})[item.status]||"Pending review");
        var aa=all.find(function(r){return r.auditId===item.auditA});info("Audit A:",String(aa?.company||"Audit")+" → "+schedule(item.afterA));if(aa)info("Assigned auditor:",String(aa.assignedToDisplayName||aa.auditorName||aa.assignedTo||"Not assigned"));
        var bb=all.find(function(r){return r.auditId===item.auditB});info("Audit B:",String(bb?.company||"Audit")+" → "+schedule(item.afterB));if(bb)info("Assigned auditor:",String(bb.assignedToDisplayName||bb.auditorName||bb.assignedTo||"Not assigned"));
        info("Explanation for participants:",String(item.ecasComment||""));
        if(item.acknowledged){
          info("Your response:","Acknowledged; awaiting any remaining auditor");
        }else{
          var ack=document.createElement("button"),decline=document.createElement("button");
          ack.type="button";ack.textContent="Confirm date change";
          decline.type="button";decline.textContent="Decline";
          decline.style.marginLeft="8px";
          async function respond(decision){
            if(decision==="DECLINE"&&!window.confirm("Decline this audit date change request?"))return;
            ack.disabled=true;decline.disabled=true;
            message.textContent="Saving auditor response...";
            try{
              var outcome=await swap20GridRequest("auditor","respond",{operationId:item.operationId,decision:decision});
              message.textContent="Response saved: "+String(outcome.status||"");
              swap20RefreshAttention();
              await reload();
            }catch(error){
              message.textContent="Your response could not be confirmed. Refresh the request before trying again.";
              ack.disabled=false;decline.disabled=false;
            }
          }
          ack.onclick=function(){respond("ACKNOWLEDGE")};
          decline.onclick=function(){respond("DECLINE")};
          card.append(ack,decline);
        }
        items.appendChild(card);
      });
    }catch(error){message.textContent="The latest requests could not be loaded. Please refresh.";}
  }
  panel.querySelector("#auditorSwap20Reload").onclick=function(){swap20ListCache.auditor=null;reload();};
  if(typeof panel.showModal==="function"){if(!panel.open)panel.showModal();}else panel.setAttribute("open","");
  await reload();
};
document.getElementById("selectionClear").onclick=selectionClear;
document.getElementById("selectionBatch").onclick=function(){submitSelectionHandoff("batch")};
document.getElementById("selectionConcept").onclick=function(){submitSelectionHandoff("concept")};
document.getElementById("selectionExport").onclick=function(){var f=document.getElementById("selectionExportFormat").value;f==="pdf"?selectionPdf():selectionExcel()};
// Legacy overview Planning Workspace control removed; use audit-specific or batch planning.
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
button.hidden=true;button.onclick=function(){if(String(actorRole).toLowerCase()!=='manager')return;panel.hidden=false;load()};
close.onclick=function(){if(hasUnsavedAuditorChanges()&&!window.confirm('Discard unsaved auditor profile changes?'))return;hasUnsavedAuditorChanges=()=>false;panel.hidden=true};search.oninput=render;filter.onchange=render;document.querySelectorAll('[data-scope-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.scopeTab;showDetails()}});
})();
(function(){
var open=document.getElementById('companyManagement20'),panel=document.getElementById('companyManagement20Panel'),close=document.getElementById('companyManagement20Close'),search=document.getElementById('companyManagement20Search'),filter=document.getElementById('companyManagement20Filter'),status=document.getElementById('companyManagement20Status'),rows=document.getElementById('companyManagement20Rows'),dossier=document.getElementById('companyManagement20Dossier'),name=document.getElementById('companyManagement20Name'),details=document.getElementById('companyManagement20Details');
var companies=[],selected=null,tab='company',pending={},busy=false,companyCatalog=[],activeAuditors=[],saveError='';
function el(tag,value){var n=document.createElement(tag);if(value!==undefined)n.textContent=String(value??'');return n}
function line(label,control){var wrap=el('div');wrap.style.cssText='display:grid;grid-template-columns:minmax(160px,230px) minmax(250px,1fr);gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9';var title=el('label',label);wrap.append(title,control);details.appendChild(wrap);return wrap}
function plain(label,value){line(label,el('span',value||'—'))}
function field(label,key,value,kind){var input=el(kind==='multiline'?'textarea':'input');if(kind==='multiline')input.rows=3;else input.type=kind==='email'?'email':'text';input.value=String(value??'');input.style.cssText='width:100%;max-width:650px;padding:7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box';input.dataset.companyField=key;input.oninput=function(){if(input.disabled)return;if(input.value===String(value??''))delete pending[key];else pending[key]={expected:String(value??''),value:input.value};refreshSave()};line(label,input)}
function languageField(label,key,value){var input=el('select');var languages=[['','— Select language —'],['EN','EN · English'],['SP','SP · Español'],['PT','PT · Português'],['NL','NL · Nederlands'],['FR','FR · Français']];if(value&&!languages.some(function(x){return x[0]===String(value)}))languages.push([String(value),String(value)+' · Existing value']);languages.forEach(function(item){var option=el('option',item[1]);option.value=item[0];input.appendChild(option)});input.value=String(value||'');input.style.cssText='width:100%;max-width:650px;padding:7px;border:1px solid #cbd5e1;border-radius:5px;box-sizing:border-box';input.dataset.companyField=key;input.title='Language code: EN English, SP Spanish, PT Portuguese, NL Dutch, FR French';input.onchange=function(){if(input.disabled)return;if(input.value===String(value||''))delete pending[key];else pending[key]={expected:String(value||''),value:input.value};refreshSave()};line(label,input)}
function selectField(label,key,value){var input=el('select');['Yes','No'].forEach(function(v){var o=el('option',v);o.value=v;input.appendChild(o)});input.value=/^(yes|true|1)$/i.test(String(value))?'Yes':'No';var initial=input.value;input.onchange=function(){if(input.value===initial)delete pending[key];else pending[key]={expected:String(value??''),value:input.value};refreshSave()};line(label,input)}
function gpsLink(gps){var raw=String(gps||'').trim(),link=el('a','Open in Google Maps ↗');link.href=/^https:\/\/(www\.)?(google\.[^/]+\/maps|maps\.google\.[^/]+\/)/i.test(raw)?raw:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(raw);link.target='_blank';link.rel='noopener noreferrer';return raw?link:el('span','No GPS')}
var googleMapLoader=null;
function loadCompanyGoogleMaps(){if(window.google&&google.maps)return Promise.resolve(true);if(googleMapLoader)return googleMapLoader;googleMapLoader=fetch('/api/v1/manager/maps-config',{credentials:'same-origin'}).then(function(r){if(!r.ok)throw Error('MAP_CONFIG_UNAVAILABLE');return r.json()}).then(function(cfg){if(!cfg.configured||!cfg.apiKey)return false;return new Promise(function(resolve,reject){var sc=document.createElement('script');sc.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(cfg.apiKey)+'&loading=async';sc.async=true;sc.onload=function(){var attempts=0;function waitForMaps(){if(window.google&&google.maps&&google.maps.Map&&google.maps.Marker)return resolve(true);if(++attempts>30)return reject(Error('MAPS_API_NOT_READY'));requestAnimationFrame(waitForMaps)}waitForMaps()};sc.onerror=function(){reject(Error('GOOGLE_MAPS_LOAD_FAILED'))};document.head.appendChild(sc)})}).catch(function(){return false});return googleMapLoader}
function companyMultiLocationMap(node,locations,selectedCode){var points=(locations||[]).filter(function(x){return x.active}).map(function(x){var m=/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(x.gps||''));if(!m)return null;var lat=Number(m[1]),lng=Number(m[2]);if(Math.abs(lat)>90||Math.abs(lng)>180)return null;return{lat,lng,name:x.name||x.code||'Location',code:x.code,hq:!!x.hq}}).filter(Boolean);
 node.replaceChildren();if(!points.length){node.appendChild(el('span','No active locations with GPS coordinates'));return}
 var selected=points.find(function(p){return p.code===selectedCode})||points.find(function(p){return p.hq})||points[0];
 var placeholder=el('div','Loading Google Maps…');placeholder.style.cssText='padding:14px;color:#64748b;font-size:12px';node.appendChild(placeholder);
 loadCompanyGoogleMaps().then(function(ready){if(!node.isConnected)return;if(!ready){node.replaceChildren();var frame=el('iframe');frame.title='Google Maps';frame.loading='lazy';frame.style.cssText='width:100%;height:100%;border:0';frame.src='https://maps.google.com/maps?q='+encodeURIComponent(selected.lat+','+selected.lng)+'&z=10&output=embed';node.appendChild(frame);return}
 node.replaceChildren();var map=new google.maps.Map(node,{center:{lat:selected.lat,lng:selected.lng},zoom:10,gestureHandling:'cooperative',mapTypeControl:false,streetViewControl:false});
 var bounds=new google.maps.LatLngBounds();points.forEach(function(p){var marker=new google.maps.Marker({map,position:{lat:p.lat,lng:p.lng},title:(p.hq?'HQ · ':'')+p.name,label:p.code===selectedCode?'●':p.hq?'H':undefined});bounds.extend(marker.getPosition())});if(points.length>1)map.fitBounds(bounds,42)
 }).catch(function(error){if(!node.isConnected)return;console.warn('[COMPANY_MAP_RENDER]',error);node.replaceChildren();var retry=el('button','Retry Google Maps');retry.type='button';retry.onclick=function(){companyMultiLocationMap(node,locations,selectedCode)};node.appendChild(retry);var fallback=el('iframe');fallback.title='Location map fallback';fallback.loading='eager';fallback.style.cssText='display:block;width:100%;height:calc(100% - 32px);min-height:320px;border:0';fallback.src='https://maps.google.com/maps?q='+encodeURIComponent(selected.lat+','+selected.lng)+'&z=10&output=embed';node.appendChild(fallback)});
}
function companyMap(){var holder=el('div');holder.style.cssText='min-width:0;width:100%;height:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;display:flex;flex-direction:column;align-self:stretch';var title=el('strong','Locations · Maps');title.style.cssText='font-size:13px;line-height:18px';holder.appendChild(title);var locations=(selected.locations||[]).filter(function(x){return x.active});if(!locations.length){holder.appendChild(el('p','No active locations. Add or activate locations in the Locations tab.'));details.appendChild(holder);return}var list=el('div');list.style.cssText='display:grid;gap:8px;margin:10px 0';locations.forEach(function(x){var item=el('div');item.style.cssText='display:flex;gap:12px;align-items:center;justify-content:space-between;padding:7px;border:1px solid #e2e8f0;border-radius:5px';var text=el('span',(x.hq?'📍 HQ · ':'📍 ')+(x.name||x.code));item.appendChild(text);var address=[x.address,x.postalCode,x.city,x.country].filter(Boolean).join(', '),gps=x.gps||address;if(gps)item.appendChild(gpsLink(gps));else item.appendChild(el('span','Location missing'));list.appendChild(item)});holder.appendChild(list);
var mapArea=el('div');mapArea.style.cssText='width:100%;flex:1 1 auto;min-height:380px;height:100%;border-radius:6px;overflow:hidden';holder.appendChild(mapArea);(document.getElementById('companyManagement20MapColumn')||details).appendChild(holder);requestAnimationFrame(function(){companyMultiLocationMap(mapArea,locations,locations.find(function(x){return x.hq})?.code)})}
function saveBar(){var bar=el('div');bar.style.cssText='display:flex;align-items:center;gap:12px;margin:14px 0';var discard=el('button','Discard changes');discard.id='companyManagement20Discard';discard.type='button';discard.onclick=function(){pending={};saveError='';renderDossier()};var save=el('button','Save all');save.type='button';save.style.cssText='background:#2563eb;color:white;border:0;border-radius:6px;padding:9px 17px';save.onclick=saveAll;save.id='companyManagement20Save';var msg=el('span','All changes saved');msg.id='companyManagement20SaveStatus';bar.append(save,discard,msg);details.prepend(bar);refreshSave()}
function refreshSave(){var btn=document.getElementById('companyManagement20Save'),msg=document.getElementById('companyManagement20SaveStatus');if(btn)btn.disabled=busy||!Object.keys(pending).length;var discard=document.getElementById('companyManagement20Discard');if(discard&&discard.textContent==='Discard changes')discard.disabled=busy||!Object.keys(pending).length;if(msg){msg.style.color=saveError?'#b91c1c':'';msg.textContent=busy?'Saving…':saveError|| (Object.keys(pending).length?Object.keys(pending).length+' unsaved changes':'All changes saved')}}
async function saveAll(){if(!selected||busy||!Object.keys(pending).length)return;if(String(actorRole).toLowerCase()==='auditor'){var auditorAllowed=new Set(['Contactperson ','Contactperson e-mail','Contactperson phone','Auditor comments','Preferred_Audit_Months','Audit planning limitations - days','Audit planning limitations - hours']);var notAllowed=Object.keys(pending).filter(function(k){return !auditorAllowed.has(k)});if(notAllowed.length){saveError='These changes require a Manager: '+notAllowed.join(', ');refreshSave();return}}saveError='';busy=true;refreshSave();var total=0;
async function post(path,data){var response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok||!result.ok)throw Error((result.error||'SAVE_FAILED')+(result.field?' · '+result.field:'')+(result.scopeCode?' · '+result.scopeCode:'')+(result.detail?' · '+result.detail:''));return result}
try{
 var uid=selected.companyUid;
 for(var key of Object.keys(pending).filter(function(k){return k.startsWith('assign:')})){var item=pending[key],r=await post('/api/v1/manager/company-management/scopes/assign',{companyUid:uid,scopeCode:item.scopeCode});total+=1;delete pending[key]}
 var scopeChanges=Object.keys(pending).filter(function(k){return k.startsWith('scope:')}).map(function(k){return pending[k]});
 if(scopeChanges.length){var sd=await post('/api/v1/manager/company-management/scopes/save',{companyUid:uid,changes:scopeChanges});total+=sd.updated;scopeChanges.forEach(function(x){delete pending['scope:'+x.scopeCode]})}
 for(var key of Object.keys(pending).filter(function(k){return k.startsWith('hours:')})){var item=pending[key],hd=await post('/api/v1/manager/company-management/scopes/hours',{companyUid:uid,scopeCode:item.scopeCode,hours:item.hours,expected:item.expected});total+=hd.updated;delete pending[key]}
 var companyChanges=Object.fromEntries(Object.entries(pending).filter(function(pair){return !pair[0].includes(':')}));
 if(Object.keys(companyChanges).length){var cd=await post(String(actorRole).toLowerCase()==='auditor'?'/api/v1/auditor/company-management/save':'/api/v1/manager/company-management/save',{companyUid:uid,changes:companyChanges});total+=cd.updated;Object.keys(companyChanges).forEach(function(k){delete pending[k]})}
 await load(uid);saveError='';status.textContent='Saved '+total+' changes';
}catch(e){saveError='Save blocked: '+e.message;status.textContent=saveError}finally{busy=false;refreshSave()}
}
function renderDossier(){if(!selected)return;if(String(actorRole).toLowerCase()==='auditor'&&tab==='governance')tab='company';document.querySelectorAll('[data-company-tab="governance"]').forEach(function(b){b.hidden=String(actorRole).toLowerCase()==='auditor'});if(Object.keys(pending).length){status.textContent='Save changes before navigating';return}dossier.hidden=false;name.textContent=selected.name;details.replaceChildren();pending={};
if(tab==='company'){var layout=el('div');layout.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px;align-items:stretch';var fields=el('div');fields.id='companyManagement20Fields';var mapColumn=el('div');mapColumn.id='companyManagement20MapColumn';mapColumn.style.cssText='min-width:0;display:flex;align-self:stretch';layout.append(fields,mapColumn);details.appendChild(layout);var originalDetails=details;details=fields;plain('Company',selected.name);plain('Status',selected.status);field('Company number','Number',selected.companyNumber);field('Group','Group',selected.companyGroup);field('Region','Region',selected.region);field('Country','Country',selected.country);field('Contact person','Contactperson ',selected.contactPerson);field('Contact email','Contactperson e-mail',selected.contactEmail,'email');field('Contact phone','Contactperson phone',selected.contactPhone);languageField('Communication language',' Language communication',selected.communicationLanguage);field('Time zone','Time zone',selected.timeZone);field('Manager email','Manager_Email',selected.managerEmail,'email');field('General comments','Comments',selected.generalComments,'multiline');field('Auditor comments','Auditor comments',selected.auditorComments||'','multiline');details=originalDetails;companyMap()}
if(tab==='scopes'){
 var assigned=selected.scopes.filter(function(x){return x.active}),inactive=selected.scopes.filter(function(x){return !x.active});
 plain('Assigned active scopes',assigned.length+' of '+companyCatalog.length+' available');
 var toolbar=el('div');toolbar.style.cssText='display:flex;gap:10px;align-items:center;margin:10px 0';var showInactive=el('button','Show inactive company scopes');showInactive.type='button';toolbar.appendChild(showInactive);var addLabel=el('label','Add scope '),addSelect=el('select'),emptyScope=el('option','Select available scope…');emptyScope.value='';addSelect.appendChild(emptyScope);companyCatalog.filter(function(c){return c.active&&!c.archived&&!selected.scopes.some(function(x){return x.scopeCode===c.scopeCode})}).sort(function(a,b){return a.displayName.localeCompare(b.displayName)}).forEach(function(c){var o=el('option',c.displayName||c.scopeCode);o.value=c.scopeCode;addSelect.appendChild(o)});addSelect.onchange=function(){var code=addSelect.value;if(!code)return;var c=companyCatalog.find(function(x){return x.scopeCode===code});if(!c)return;pending['assign:'+code]={scopeCode:code};var row={scopeCode:code,active:false,defaultHours:c.defaultHours,currentVersion:c.currentVersion||'',companyHours:'',hoursSource:'SCOPE_DEFAULT',unassigned:true};selected.scopes.push(row);draw(showInactive.dataset.expanded==='yes');refreshSave();addSelect.value='';Array.from(addSelect.options).forEach(function(o){if(o.value===code)o.remove()})};addLabel.appendChild(addSelect);toolbar.appendChild(addLabel);details.appendChild(toolbar);
 var tbl=el('table');tbl.style.minWidth='700px';var head=el('thead'),hr=el('tr');['Scope','Active','Default hours','Custom hours','Effective hours','Version'].forEach(function(v){hr.appendChild(el('th',v))});head.appendChild(hr);tbl.appendChild(head);var body=el('tbody');tbl.appendChild(body);details.appendChild(tbl);
 function draw(includeInactive){body.replaceChildren();var list=selected.scopes.filter(function(x){return x.active||pending['assign:'+x.scopeCode]||pending['scope:'+x.scopeCode]?.active==='Yes'||includeInactive}).filter(function(x){return x.active||x.unassigned||companyCatalog.some(function(y){return y.scopeCode===x.scopeCode})});list.forEach(function(x){var tr=el('tr');tr.appendChild(el('td',x.scopeCode));var active=el('td'),selector=el('select');['Yes','No'].forEach(function(v){var option=el('option',v);option.value=v;selector.appendChild(option)});selector.value=pending['assign:'+x.scopeCode]||pending['scope:'+x.scopeCode]?(pending['assign:'+x.scopeCode]?'Yes':pending['scope:'+x.scopeCode].active):(x.active?'Yes':'No');selector.disabled=!x.unassigned&&!companyCatalog.some(function(c){return c.scopeCode===x.scopeCode&&c.active&&!c.archived});selector.onchange=function(){var value=selector.value;if(x.unassigned){if(value==='Yes')pending['assign:'+x.scopeCode]={scopeCode:x.scopeCode};else delete pending['assign:'+x.scopeCode]}else if(value===(x.active?'Yes':'No'))delete pending['scope:'+x.scopeCode];else pending['scope:'+x.scopeCode]={scopeCode:x.scopeCode,expected:x.active?'Yes':'No',active:value};if(value==='No')delete pending['hours:'+x.scopeCode];if(hoursInput){hoursInput.disabled=value!=='Yes';if(value==='No')hoursInput.value=x.hoursSource==='SCOPE_DEFAULT'?'':String(x.companyHours||'')}refreshSave()};active.appendChild(selector);tr.appendChild(active);tr.appendChild(el('td',x.defaultHours||'—'));var custom=el('td'),hoursInput=el('input');hoursInput.type='number';hoursInput.min='0.25';hoursInput.max='200';hoursInput.step='0.25';hoursInput.placeholder='Default';hoursInput.style.cssText='width:95px;padding:5px';hoursInput.value=pending['hours:'+x.scopeCode]?pending['hours:'+x.scopeCode].hours:(x.hoursSource==='SCOPE_DEFAULT'?'':x.companyHours||'');hoursInput.disabled=selector.value!=='Yes';hoursInput.title='Optional: leave blank to use the current scope default (unless a governed legacy override exists)';hoursInput.oninput=function(){var value=hoursInput.value,initial=x.hoursSource==='SCOPE_DEFAULT'?'':String(x.companyHours||'');if(value===initial)delete pending['hours:'+x.scopeCode];else if(value===''||Number(value)>=0.25&&Number(value)<=200&&Math.round(Number(value)*4)===Number(value)*4)pending['hours:'+x.scopeCode]={scopeCode:x.scopeCode,hours:value,expected:initial};else {status.textContent='Custom hours must be between 0.25 and 200';delete pending['hours:'+x.scopeCode]}refreshSave()};custom.appendChild(hoursInput);tr.appendChild(custom);tr.appendChild(el('td',pending['hours:'+x.scopeCode]?(pending['hours:'+x.scopeCode].hours||x.defaultHours||'—'):(x.companyHours||x.defaultHours||'—')));tr.appendChild(el('td',x.currentVersion||'—'));body.appendChild(tr)});if(!list.length){var tr=el('tr'),td=el('td','No '+(includeInactive?'assigned':'active')+' scopes');td.colSpan=6;tr.appendChild(td);body.appendChild(tr)}}
 draw(false);showInactive.onclick=function(){var expanded=showInactive.dataset.expanded!=='yes';showInactive.dataset.expanded=expanded?'yes':'no';showInactive.textContent=expanded?'Hide inactive company scopes':'Show inactive company scopes';draw(expanded)};
 var note=el('p','Activate a scope and enter optional custom hours in one Save all. Without an override the current scope default applies. Existing legacy overrides require governed cutover before removal.');note.style.color='#64748b';details.appendChild(note);
}
if(tab==='locations'){
 var loc=JSON.parse(selected.locationsRaw||'[]').map(function(x){return Object.assign({},x,{name:x.name===undefined?x.label||'':x.name,active:x.active!==false&&x.active!=='false',hq:x.hq===true||x.isHQ===true||String(x.code).toUpperCase()==='HQ'&&x.active!==false})});
 var initial=selected.locationsRaw||'[]',selectedIndex=0;
 var wrap=el('div');wrap.style.cssText='display:grid;grid-template-columns:minmax(190px,240px) minmax(300px,480px) minmax(260px,1fr);gap:12px;align-items:start;font-size:12px;line-height:1.35;max-width:1250px';var side=el('div'),editor=el('div'),mapPanel=el('div');editor.style.cssText='max-width:650px;min-width:0';mapPanel.style.cssText='min-width:0;position:relative';wrap.append(side,editor,mapPanel);details.appendChild(wrap);
 function changed(){if(String(actorRole).toLowerCase()==='auditor')return;var value=JSON.stringify(loc);if(value===initial)delete pending.Locations_JSON;else pending.Locations_JSON={expected:selected.locationsRaw||'',value:value};refreshSave()}
 var overviewNode=el('div');overviewNode.style.cssText='width:100%;height:300px;border:1px solid #cbd5e1;border-radius:6px';var overviewTitle=el('strong','All active company locations');overviewTitle.style.cssText='display:block;font-size:13px;margin:2px 0 8px';var mapsLink=el('a','Open locations in Google Maps ↗');mapsLink.target='_blank';mapsLink.rel='noopener noreferrer';mapsLink.style.cssText='display:block;margin-top:7px;font-size:12px';mapPanel.append(overviewTitle,overviewNode,mapsLink);
 function refreshOverview(){var pts=loc.filter(function(x){return x.active&&x.gps});mapsLink.hidden=!pts.length;mapsLink.href=pts.length?'https://www.google.com/maps/dir/'+pts.map(function(x){return encodeURIComponent(x.gps)}).join('/')+'/':'https://www.google.com/maps';companyMultiLocationMap(overviewNode,loc,loc[selectedIndex]?.code)}
 function renderLocation(){
 side.replaceChildren();editor.replaceChildren();var title=el('strong','Locations · '+loc.filter(function(y){return y.active}).length+' active');title.style.cssText='display:block;font-size:13px;margin:0 0 7px';side.appendChild(title);
 loc.forEach(function(x,i){var btn=el('button');btn.type='button';btn.style.cssText='display:block;width:100%;text-align:left;margin:4px 0;padding:7px 9px;font-size:12px;border:1px solid '+(i===selectedIndex?'#2563eb':'#cbd5e1')+';border-radius:6px;background:'+(i===selectedIndex?'#eff6ff':'white');var nm=el('strong',(x.hq?'⌂ ':'')+(x.name||x.code||'Unnamed'));nm.style.cssText='display:block;font-size:12px';btn.appendChild(nm);var sub=el('span',[x.city||x.address||x.gps||'No address',x.active?'Active':'Inactive'].join(' · '));sub.style.cssText='display:block;color:#64748b;font-size:11px;margin-top:2px;white-space:normal';btn.appendChild(sub);btn.onclick=function(){selectedIndex=i;renderLocation()};side.appendChild(btn);});
 var x=loc[selectedIndex];if(!x){editor.appendChild(el('p','No locations configured.'));return}
 var header=el('h4',(x.hq?'HQ · ':'')+(x.name||x.code));header.style.cssText='font-size:13px;margin:3px 0 8px';editor.appendChild(header);refreshOverview();
 function locField(label,key){var row=el('div');row.style.cssText='display:grid;grid-template-columns:minmax(115px,145px) minmax(0,1fr);gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid #f1f5f9';var caption=el('label',label),input=el('input');input.type='text';input.value=String(x[key]||'');input.disabled=String(actorRole).toLowerCase()==='auditor';input.style.cssText='padding:5px 7px;font-size:13px;border:1px solid #cbd5e1;border-radius:5px;width:100%;box-sizing:border-box';input.oninput=function(){if(String(actorRole).toLowerCase()==='auditor')return;x[key]=input.value;changed();if(['gps','address','postalCode','city','country'].includes(key)){map.replaceChildren(gpsLink(x.gps||[x.address,x.postalCode,x.city,x.country].filter(Boolean).join(', ')))}};row.append(caption,input);editor.appendChild(row);if(key==='gps')input.onchange=refreshOverview;return input}
 locField('Location name','name');plainLocation('Code',x.code);
 function plainLocation(label,value){var row=el('div');row.style.cssText='display:grid;grid-template-columns:minmax(115px,145px) minmax(0,1fr);gap:8px;padding:4px 0;font-size:13px';row.append(el('strong',label),el('span',value||'—'));editor.appendChild(row)}
 locField('Address','address');locField('Postal code','postalCode');locField('City','city');locField('Country','country');var gpsInput=locField('GPS / Google Maps URL','gps');
 var map=el('div');map.style.margin='5px 0';map.appendChild(gpsLink(x.gps||[x.address,x.postalCode,x.city,x.country].filter(Boolean).join(', ')));editor.appendChild(map);
 gpsInput.title='Enter coordinates (latitude, longitude) or a Google Maps URL';
 var activeRow=el('div');activeRow.style.cssText='display:flex;gap:12px;align-items:center;margin:8px 0';activeRow.appendChild(el('strong','Active'));var active=el('select');['Yes','No'].forEach(function(v){var o=el('option',v);o.value=v;active.appendChild(o)});active.value=x.active?'Yes':'No';active.disabled=String(actorRole).toLowerCase()==='auditor';active.onchange=function(){if(String(actorRole).toLowerCase()==='auditor')return;x.active=active.value==='Yes';changed();refreshOverview()};activeRow.appendChild(active);
 var hq=el('button',x.hq?'HQ ✓':'Set as HQ');hq.type='button';hq.disabled=String(actorRole).toLowerCase()==='auditor';hq.onclick=function(){if(String(actorRole).toLowerCase()==='auditor')return;loc.forEach(function(y){y.hq=false;y.isHQ=false});x.hq=true;x.active=true;changed();renderLocation()};activeRow.appendChild(hq);editor.appendChild(activeRow);
 var comment=locField('Location comment','comment');comment.title='Optional internal location note';
 }
 renderLocation();
}
if(tab==='planning'){
 var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],original=selected.preferredAuditMonths||'',current=new Set(original.split(',').map(function(x){return x.trim()}).filter(Boolean));
 var monthBox=el('div');monthBox.style.cssText='display:grid;grid-template-columns:repeat(6,minmax(55px,1fr));gap:7px;max-width:550px';
 monthNames.forEach(function(m){var label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=current.has(m);cb.onchange=function(){if(cb.disabled)return;if(cb.checked)current.add(m);else current.delete(m);var value=monthNames.filter(function(n){return current.has(n)}).join(',');if(value===original)delete pending.Preferred_Audit_Months;else pending.Preferred_Audit_Months={expected:original,value:value};refreshSave()};label.append(cb,document.createTextNode(' '+m));monthBox.appendChild(label)});line('Preferred audit months',monthBox);
 var dayCodes=['Mo','Tu','We','Th','Fr','Sa','Su'],dayOriginal=selected.planningLimitationsDays||'',daysSelected=new Set(dayOriginal.split(',').map(function(x){return x.trim()}).filter(Boolean)),dayBox=el('div');dayBox.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
 dayCodes.forEach(function(day){var label=el('label'),check=el('input');check.type='checkbox';check.checked=daysSelected.has(day);check.onchange=function(){if(check.checked)daysSelected.add(day);else daysSelected.delete(day);var value=dayCodes.filter(function(x){return daysSelected.has(x)}).join(', ');if(value===dayOriginal)delete pending['Audit planning limitations - days'];else pending['Audit planning limitations - days']={expected:dayOriginal,value:value};refreshSave()};label.append(check,document.createTextNode(' '+day));dayBox.appendChild(label)});var rowDays=line('Unavailable weekdays ⓘ',dayBox);rowDays.title='Tick weekdays on which the company CANNOT receive audits.';rowDays.querySelector('label').title=rowDays.title;
 var hoursOriginal=selected.planningLimitationsHours||'',hoursWrap=el('div');hoursWrap.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap';
 var match=/^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(hoursOriginal),start=el('select'),end=el('select');
 var slots=[];for(var minute=480;minute<=1080;minute+=15)slots.push(String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'));
 function options(input,values,existing){input.replaceChildren();var blank=el('option','—');blank.value='';input.appendChild(blank);values.forEach(function(v){var o=el('option',v);o.value=v;input.appendChild(o)});if(existing&&!values.includes(existing)){var legacy=el('option',existing+' (existing)');legacy.value=existing;input.appendChild(legacy)}input.style.cssText='padding:6px;font-size:13px;max-width:110px'}
 options(start,slots.slice(0,-1),match&&match[1]);start.value=match?match[1]:'';
 function endOptions(){var before=end.value,minimum=start.value;var available=slots.filter(function(v){return !minimum||v>minimum});options(end,available,match&&match[2]);if(before&&available.includes(before))end.value=before;else if(minimum&&before&&before<=minimum)end.value=available[0]||'';else if(!before&&minimum)end.value=available[0]||'';else end.value=before&&Array.from(end.options).some(function(o){return o.value===before})?before:''}
 endOptions();if(match&&match[2]&&!start.value)end.value=match[2];
 function hoursChanged(){var value=start.value&&end.value?start.value+'-'+end.value:'';if(start.value&&!end.value||!start.value&&end.value||start.value&&end.value&&start.value>=end.value){hoursError.textContent='Select valid start and end times';delete pending['Audit planning limitations - hours'];refreshSave();return}hoursError.textContent='';if(value===hoursOriginal)delete pending['Audit planning limitations - hours'];else pending['Audit planning limitations - hours']={expected:hoursOriginal,value:value};refreshSave()}
 start.onchange=function(){endOptions();hoursChanged()};end.onchange=hoursChanged;
 var hoursError=el('span');hoursError.style.color='#b91c1c';hoursWrap.append(start,document.createTextNode('to'),end,hoursError);
 var rowHours=line('Available audit hours ⓘ',hoursWrap);rowHours.title='Select the hours in which the company CAN receive audits. End time is always later than start time.';rowHours.querySelector('label').title=rowHours.title;
}
if(tab==='governance'){
 plain('Data quality',selected.warnings.length?selected.warnings.join(', '):'No location warnings');
 var rawExclusions=selected.auditorExclusions||'',chosen=new Set();
 try{var parsed=JSON.parse(rawExclusions||'[]');(Array.isArray(parsed)?parsed:parsed.exclusions||parsed.items||[]).forEach(function(v){var email=typeof v==='string'?v:v&&(v.auditorEmail||v.email||v.auditor||v.userEmail);if(email)chosen.add(String(email).toLowerCase())})}catch(e){rawExclusions.split(/[;,|\\n]/).forEach(function(v){if(v.trim().includes('@'))chosen.add(v.trim().toLowerCase())})}
 var holder=el('div');holder.style.cssText='display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:13px';
 var known=new Set(activeAuditors.map(function(a){return a.email}));
 activeAuditors.forEach(function(a){var label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=chosen.has(a.email);cb.onchange=function(){if(cb.checked)chosen.add(a.email);else chosen.delete(a.email);var value=JSON.stringify(Array.from(chosen).sort());if(value===rawExclusions||(!chosen.size&&!rawExclusions))delete pending.Auditor_Exclusions;else pending.Auditor_Exclusions={expected:rawExclusions,value:value};refreshSave()};label.append(cb,document.createTextNode(' '+a.name));label.title=a.email;holder.appendChild(label)});
 var unknown=Array.from(chosen).filter(function(email){return !known.has(email)});if(unknown.length){var note=el('span','Existing exclusions not in active list: '+unknown.join(', '));note.style.color='#b45309';holder.appendChild(note)}
 if(!activeAuditors.length)holder.appendChild(el('span','No active auditors available'));
 holder.title='Selected auditors cannot be assigned to new audits at this company. Existing historical assignments are unchanged.';
 var exclusionRow=line('Auditor exclusions ⓘ',holder);var exclusionLabel=exclusionRow.querySelector('label');exclusionLabel.title=holder.title;exclusionLabel.style.cursor='help';var exclusionIcon=el('span','ⓘ');exclusionIcon.title=holder.title;exclusionIcon.setAttribute('aria-label',holder.title);exclusionIcon.style.cssText='cursor:help;margin-left:4px';exclusionLabel.textContent='Auditor exclusions';exclusionLabel.appendChild(exclusionIcon);
 plain('Pending changes','Governed auditor proposals are not yet connected');
}
saveBar();if(String(actorRole).toLowerCase()==='auditor'){
 const writable=new Set(['Contactperson ','Contactperson e-mail','Contactperson phone','Auditor comments']);
 details.querySelectorAll('input,textarea,select').forEach(function(control){
   var field=control.dataset.companyField;
   control.disabled=tab==='company'?!writable.has(field):tab==='planning'?!((control.type==='checkbox'&&(['Mo','Tu','We','Th','Fr','Sa','Su','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].some(function(day){return (control.parentElement?.textContent||'').trim()===day})))||(control===start||control===end)):true;
 });
 details.querySelectorAll('button').forEach(function(control){if(control.textContent==='Set as HQ'||control.textContent==='HQ ✓'||control.textContent==='Show inactive company scopes'||control.textContent==='Hide inactive company scopes'||control.textContent==='Add scope')control.disabled=true});
 var st=document.getElementById('companyManagement20SaveStatus');if(st)st.textContent=tab==='company'?'Contact details and Auditor comments save directly':tab==='planning'?'Unavailable weekdays and available hours save directly':'Read-only · structural updates require Manager approval';var saveControl=document.getElementById('companyManagement20Save'),discardControl=document.getElementById('companyManagement20Discard');if(saveControl)saveControl.hidden=tab!=='company'&&tab!=='planning';if(discardControl)discardControl.hidden=tab!=='company'&&tab!=='planning';
}}
function render(){var q=search.value.trim().toLowerCase(),mode=filter.value;rows.replaceChildren();var shown=companies.filter(function(c){return(!q||[c.name,c.region,c.country,...c.scopes.map(function(x){return x.scopeCode})].join(' ').toLowerCase().includes(q))&&(mode==='all'||mode==='active'&&c.status.toLowerCase()==='active'||mode==='attention'&&c.warnings.length>0)});shown.forEach(function(c){var tr=el('tr');[c.name,c.scopes.filter(function(x){return x.active}).map(function(x){return x.scopeCode}).join(', '),c.region,c.activeLocationCount,c.status].forEach(function(value,i){var td=el('td');if(i===0){var btn=el('button',value);btn.type='button';btn.onclick=function(){if(Object.keys(pending).length){status.textContent='Save changes before switching company';return}selected=c;tab='company';renderDossier();dossier.scrollIntoView({block:'nearest',behavior:'smooth'})};td.appendChild(btn)}else {td.textContent=String(value);if(i===1)td.style.cssText='white-space:normal;overflow-wrap:anywhere;line-height:1.4';if(i===3||i===4)td.style.textAlign='center'}if(i===0&&c.warnings.length){var indicator=el('span',' ⚠');indicator.title=c.warnings.join(', ');indicator.style.color='#b45309';td.appendChild(indicator)}td.style.overflowWrap='anywhere';tr.appendChild(td)});rows.appendChild(tr)});status.textContent=shown.length+' / '+companies.length+' companies'}
async function load(uid){var response=await fetch(String(actorRole).toLowerCase()==='auditor'?'/api/v1/auditor/company-management':'/api/v1/manager/company-management',{credentials:'same-origin'}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.detail||result.error||'COMPANY_READ_FAILED');companies=result.companies||[];companyCatalog=result.scopeCatalog||[];activeAuditors=result.activeAuditors||[];if(uid){selected=companies.find(function(x){return x.companyUid===uid})||null;if(selected)renderDossier()}render()}
open.onclick=function(){if(!['manager','auditor'].includes(String(actorRole).toLowerCase()))return;document.getElementById('scopeManagement20Panel').hidden=true;panel.hidden=false;load().catch(function(e){status.textContent=e.message})};close.onclick=function(){if(Object.keys(pending).length){status.textContent='Save changes before closing';return}panel.hidden=true};search.oninput=render;filter.onchange=render;document.querySelectorAll('[data-company-tab]').forEach(function(b){b.onclick=function(){if(String(actorRole).toLowerCase()==='auditor'&&b.dataset.companyTab==='governance')return;if(Object.keys(pending).length){status.textContent='Save changes before switching tab';return}tab=b.dataset.companyTab;renderDossier()}});
})();

(function(){
const trigger=document.getElementById('auditorManagement20'),panel=document.getElementById('auditorManagement20Panel'),close=document.getElementById('auditorManagement20Close'),search=document.getElementById('auditorManagement20Search'),filter=document.getElementById('auditorManagement20Filter'),rows=document.getElementById('auditorManagement20Rows'),status=document.getElementById('auditorManagement20Status'),dossier=document.getElementById('auditorManagement20Dossier');
let auditors=[],scopeCatalog=[],hasUnsavedAuditorChanges=()=>false;
const identityCheckButton=document.createElement('button');
identityCheckButton.type='button';
identityCheckButton.textContent='Check identity readiness';
identityCheckButton.style.margin='8px 10px 8px 0';
const identityCheckResult=document.createElement('div');
identityCheckResult.setAttribute('role','status');
identityCheckResult.style.cssText='white-space:pre-wrap;font-size:12px;padding:6px 0';
status.parentNode.insertBefore(identityCheckButton,status.nextSibling);
status.parentNode.insertBefore(identityCheckResult,identityCheckButton.nextSibling);
const writeProbeButton=document.createElement('button');
writeProbeButton.type='button';
writeProbeButton.textContent='Verify Firestore write/delete';
writeProbeButton.style.margin='8px 10px 8px 0';
identityCheckResult.parentNode.insertBefore(writeProbeButton,identityCheckResult);
writeProbeButton.onclick=async()=>{
  writeProbeButton.disabled=true;
  identityCheckResult.textContent='Testing isolated DEV Firestore write and cleanup…';
  try{
    const response=await fetch('/api/v1/manager/auditor-identity/firestore-write-probe',{method:'POST',credentials:'same-origin'});
    const result=await response.json();
    identityCheckResult.textContent=(response.ok&&result.ok?'PASS: ':'BLOCKED: ')+String(result.reason||result.error||response.status)+(result.documentId?' · document '+result.documentId:'')+'\nNo audit records were changed. Email writes remain controlled by their separate flag.';
  }catch(e){identityCheckResult.textContent='Probe failed: '+String(e.message||e)}
  finally{writeProbeButton.disabled=false}
};
identityCheckButton.onclick=async()=>{
  identityCheckButton.disabled=true;
  identityCheckResult.textContent='Checking DEV identity and Firestore access…';
  try{
    const endpoints=['/api/v1/manager/auditor-identity/readiness','/api/v1/manager/auditor-identity/lock-readiness'];
    const results=await Promise.all(endpoints.map(async url=>{
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      return{http:response.status,...data};
    }));
    const [identity,lock]=results;
    const identityPass=identity.ok===true&&identity.ready===true;
    const lockPass=lock.ok===true&&lock.lockReady===true;
    identityCheckResult.textContent=[
      'UID identity: '+(identityPass?'READY':'NOT READY')+' (HTTP '+identity.http+')',
      'Firestore lock: '+(lockPass?'READ ACCESS OK':'NOT READY')+' (HTTP '+lock.http+')',
      'Reason: '+String(lock.reason||lock.error||identity.error||'not reported'),
      'UID login: '+(lock.uidLoginEnabled?'ON':'OFF'),
      'Email writes: '+(lock.emailWriteEnabled?'ON':'OFF'),
      'Distributed lock: '+(lock.lockEnabled?'ON':'OFF'),
      'Firestore write permission: NOT VERIFIED',
      'No settings or data were changed.'
    ].join('\n');
  }catch(error){identityCheckResult.textContent='Diagnostic failed: '+String(error.message||error)}
  finally{identityCheckButton.disabled=false}
};

async function auditorJson(response){const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{throw Error(response.status===429||/rate exceeded/i.test(raw)?'SERVICE_RATE_LIMITED_RETRY':'SERVICE_NON_JSON_RESPONSE_'+response.status)}return data}
function el(tag,content){const node=document.createElement(tag);if(content!==undefined)node.textContent=String(content);return node}
function auditorAuditLabel(item){const company=String(item.company||item.companyName||'Company unavailable');const scope=Array.isArray(item.scopes)?item.scopes.join(', '):String(item.scopeCode||item.scope||'Scope unavailable');return company+' · '+scope}
function auditorExclusionReason(reason){const labels={AUDITOR_NOT_HARD_QUALIFIED:'Not qualified for the required scope',AUDITOR_EXCLUDED_FOR_COMPANY:'Excluded for this company',AUDITOR_INACTIVE:'Auditor inactive',AUDITOR_NOT_ACTIVE:'Auditor inactive',ROTATION_CONFLICT:'Rotation restriction',AUDITOR_ROTATION_CONFLICT:'Rotation restriction',AUDITOR_UNAVAILABLE:'Unavailable on planned date',AUDITOR_NOT_AVAILABLE:'Unavailable on planned date'};return labels[String(reason)]||String(reason).replaceAll('_',' ').toLowerCase()}
function auditorExcludedSummary(items){return(items||[]).map(x=>x.name+': '+(x.reasons||[]).map(reason=>reason==='AUDITOR_NOT_HARD_QUALIFIED'&&x.missingScopes?.length?'Missing qualification: '+x.missingScopes.join(', '):auditorExclusionReason(reason)).join('; ')).join('\n')}
function showAuditor(a,initialPage='Profile'){
 if(hasUnsavedAuditorChanges()&&!window.confirm('Discard unsaved auditor profile changes?'))return;
 dossier.hidden=false;dossier.replaceChildren();dossier.appendChild(el('h3',a.name)); let pending={},currentPage='Profile',saving=false;hasUnsavedAuditorChanges=()=>Object.keys(pending).length>0||saving;
 const actions=el('div'),save=el('button','Save all'),discard=el('button','Discard changes'),feedback=el('span','All changes saved');
 actions.style.cssText='display:flex;align-items:center;gap:10px;margin:10px 0';feedback.setAttribute('role','status');save.type='button';discard.type='button';actions.append(save,discard,feedback);
 const tabs=el('div');tabs.style.cssText='display:flex;gap:8px;margin:12px 0';
 const content=el('div');dossier.append(tabs,actions,content);const transferSection=el('div');transferSection.style.cssText='margin-top:18px;border-top:1px solid #ddd;padding-top:12px';content.after(transferSection);transferSection.hidden=true;if(a.qualificationConflictCount){const transfers=el('details');transfers.style.cssText='padding:8px 0';const summary=el('summary','⚠ '+a.qualificationConflictCount+' qualification conflict(s) · Review and transfer audits');summary.style.cssText='cursor:pointer;font-weight:600;color:#b91c1c;padding:8px 0';transfers.appendChild(summary);transfers.appendChild(el('p','Choose a qualified colleague per audit. Availability is not confirmed.'));(a.qualificationConflicts||[]).forEach(item=>{if(!item.auditId)return;const line=el('div');line.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:7px 0';const auditLabel=el('span','Loading company and scope… · '+item.status);line.appendChild(auditLabel);const choice=el('select');choice.appendChild(new Option('Select qualified colleague',''));choice.disabled=true;fetch('/api/v1/manager/auditor-management/audit/transfer-candidates?auditId='+encodeURIComponent(item.auditId)+'&fromEmail='+encodeURIComponent(a.email),{credentials:'same-origin'}).then(async response=>{const data=await auditorJson(response);if(!response.ok||!data.ok)throw Error(data.error||'CANDIDATE_CHECK_FAILED');auditLabel.textContent=data.company+' · '+data.scopes.join(', ')+' · '+item.status;choice.replaceChildren(new Option(data.eligible.length?'Select eligible colleague':'No eligible colleagues',''));data.eligible.forEach(x=>choice.appendChild(new Option(x.name+' ('+x.email+')'+(x.planningWarnings?.length?' ⚠ date restriction':''),x.email)));const warning=el('span');warning.style.cssText='color:#b45309;font-size:12px';line.appendChild(warning);const updateWarning=()=>{const selected=data.eligible.find(x=>x.email===choice.value);warning.textContent=selected?.planningWarnings?.length?'⚠ Audit date invalid: not before '+selected.planningWarnings.map(x=>x.replace('MIN_INTERVAL_HARD_BLOCK_','')).join(', ')+'. Transfer allowed after explicit confirmation; audit date must be corrected before approval.':'';transfer.disabled=!selected};choice.onchange=updateWarning;choice.disabled=!data.eligible.length;transfer.disabled=true;choice.title=auditorExcludedSummary(data.excluded);const excluded=(data.excluded||[]).filter(x=>x.name==='David Pastor'||x.email==='david@agriqa.es');if(excluded.length){const reason=el('span','David Pastor unavailable: '+auditorExcludedSummary(excluded));reason.style.cssText='color:#b91c1c;font-size:12px';line.appendChild(reason)}}).catch(e=>{auditLabel.textContent='Candidate check unavailable: '+e.message;choice.disabled=true;transfer.disabled=true});line.appendChild(choice);const transfer=el('button','Transfer → Pending Approval');transfer.type='button';transfer.disabled=true;line.appendChild(transfer);transfer.onclick=async()=>{if(!choice.value)return;if(!window.confirm('Transfer '+auditorAuditLabel(item)+' to '+choice.value+'? Existing date is retained. Availability is NOT confirmed. If the audit date violates the minimum interval, it must be corrected before approval. The colleague must approve or Cancel.'))return;transfer.disabled=true;try{const response=await fetch('/api/v1/manager/auditor-management/audit/transfer',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({auditId:item.auditId,fromEmail:a.email,toEmail:choice.value,expectedStatus:item.status,acknowledgeDateRestriction:true,reason:'Qualification conflict reassignment'})});const result=await auditorJson(response);if(!response.ok||!result.ok){if(result.error==='TRANSFER_STALE_STATUS'){const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),fresh=await auditorJson(rr);if(rr.ok&&fresh.ok){auditors=fresh.rows||[];scopeCatalog=fresh.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications')}throw Error('Audit status changed to '+(result.current||'another status')+'. List refreshed; review before retrying.')}throw Error(result.error||'TRANSFER_FAILED')}const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),data=await auditorJson(rr);if(!rr.ok||!data.ok)throw Error('TRANSFER_REFRESH_FAILED');auditors=data.rows||[];scopeCatalog=data.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');const st=document.querySelector('#auditorManagement20Dossier [role=status]');if(st)st.textContent='Transferred · Pending Approval · availability unverified'}catch(e){transfer.disabled=false;window.alert('Transfer not confirmed: '+e.message)}};transfers.appendChild(line)});transferSection.appendChild(transfers)}
 function refresh(){save.disabled=saving||!Object.keys(pending).length;discard.disabled=saving||!Object.keys(pending).length;if(!saving)feedback.textContent=Object.keys(pending).length?Object.keys(pending).length+' unsaved changes':'All changes saved'}
 function stage(key,original,value){if(value===String(original??''))delete pending[key];else pending[key]={expected:String(original??''),value};refresh()}
 function row(label,value){const line=el('div');line.style.cssText='display:grid;grid-template-columns:minmax(140px,220px) minmax(240px,1fr);gap:12px;padding:7px 0;border-bottom:1px solid #edf0f4';line.append(el('strong',label),el('span',value||'—'));content.appendChild(line)}
 function editable(label,key,value){const line=el('div'),input=el('input');line.style.cssText='display:grid;grid-template-columns:minmax(140px,220px) minmax(240px,1fr);gap:12px;padding:7px 0;border-bottom:1px solid #edf0f4';input.value=String(value??'');input.style.cssText='padding:6px;max-width:620px;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:5px';input.oninput=()=>stage(key,value,input.value);line.append(el('strong',label),input);content.appendChild(line)}
 const pages=['Profile','Qualifications','Availability Defaults','History'];
 function draw(page){currentPage=page;content.replaceChildren();transferSection.hidden=page!=='Qualifications';Array.from(tabs.children).forEach(x=>x.setAttribute('aria-pressed',String(x.textContent===page)));
  if(page==='Profile'){
 const identityNote=el('p','Identity and status changes are Manager-governed; linked audits are checked before saving.');content.appendChild(identityNote);
 const identity=el('div');identity.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0';const nameInput=el('input'),emailInput=el('input');nameInput.value=a.name;emailInput.type='email';emailInput.value=a.email;nameInput.placeholder='Auditor name';emailInput.placeholder='E-mail';identity.append(nameInput,emailInput);const updateIdentity=el('button','Save identity');updateIdentity.type='button';identity.appendChild(updateIdentity);content.appendChild(identity);
 const identityMessage=el('p');identityMessage.setAttribute('role','status');content.appendChild(identityMessage);const emailPolicy=el('p','Auditor_UID and historical email versions are managed in DEV.');emailPolicy.style.cssText='font-size:12px;color:inherit';content.appendChild(emailPolicy);
 updateIdentity.onclick=async()=>{if(emailInput.value.trim().toLowerCase()===a.email.trim().toLowerCase()&&nameInput.value===a.name){identityMessage.textContent='No identity changes to save';return}if(!window.confirm('Request auditor identity change? Historical references and access credentials will be checked.'))return;updateIdentity.disabled=true;try{const resp=await fetch('/api/v1/manager/auditor-management/identity/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,name:a.name,newEmail:emailInput.value,newName:nameInput.value})}),result=await auditorJson(resp);if(!resp.ok||!result.ok){if(result.error==='AUDITOR_EMAIL_CHANGE_WRITE_DISABLED')throw Error('Email transition validated; controlled DEV activation is still pending. No changes saved.');if(result.error==='AUDITOR_UID_IDENTITY_NOT_READY')throw Error('UID identity readiness checks failed. No changes saved.');if(result.error==='AUDITOR_EMAIL_TRANSITION_REJECTED')throw Error('Email transition rejected: '+(result.reason||'identity conflict')+'. No changes saved.');if(result.error==='AUDITOR_NAME_REKEY_REQUIRES_REFERENCE_MIGRATION')throw Error('Name change requires a controlled migration of linked audit references. No changes were saved.');throw Error(result.error||'IDENTITY_SAVE_FAILED')}identityMessage.textContent='Identity saved';await load();const current=auditors.find(x=>x.email===result.newEmail)||a;showAuditor(current)}catch(e){identityMessage.textContent='Identity not saved: '+e.message;updateIdentity.disabled=false}};
 const activeRow=el('div');activeRow.style.cssText='margin:12px 0';activeRow.appendChild(el('strong','Active: '));const toggle=el('input');toggle.type='checkbox';toggle.checked=a.active;activeRow.appendChild(toggle);activeRow.appendChild(el('span',' '+(a.active?'Active':'Inactive')));const activeNote=el('span');activeNote.style.marginLeft='12px';activeRow.appendChild(activeNote);content.appendChild(activeRow);
 toggle.onchange=async()=>{
 const desired=toggle.checked;if(!window.confirm((desired?'Activate':'Inactivate')+' '+a.name+'?')){toggle.checked=a.active;return}toggle.disabled=true;
 async function apply(confirmedAuditIds){const resp=await fetch('/api/v1/manager/auditor-management/active/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,expected:a.active,active:desired,confirmedAuditIds})});return{res:resp,data:await auditorJson(resp)}}
 try{let result=await apply(undefined);
 if(result.data.error==='AUDITOR_INACTIVATION_REQUIRES_CONFIRMATION'){
  const affected=result.data.impacted||[];const detail=affected.map(x=>auditorAuditLabel(x)+' · '+x.status).join('\n');
  if(!window.confirm(affected.length+' assigned/preassigned audits will need attention:\n'+detail+'\n\nInactivate this auditor and retain existing assignments with conflict alerts?')){toggle.checked=a.active;toggle.disabled=false;return}
  result=await apply(affected.map(x=>x.auditId))
 }
 if(!result.res.ok||!result.data.ok)throw Error(result.data.error||'SAVE_FAILED');
 await load();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');
 }catch(e){toggle.checked=a.active;toggle.disabled=false;activeNote.textContent='Not saved: '+e.message}
};
 const roleLine=el('div');roleLine.style.cssText='display:flex;align-items:center;gap:10px;margin:8px 0';roleLine.appendChild(el('strong','Role'));const roleSelect=el('select');['Auditor','Manager'].forEach(v=>{const o=el('option',v);o.value=v;roleSelect.appendChild(o)});roleSelect.value=a.role;roleLine.appendChild(roleSelect);const roleSave=el('button','Change role');roleSave.type='button';roleLine.appendChild(roleSave);const roleMessage=el('span');roleLine.appendChild(roleMessage);content.appendChild(roleLine);
 roleSave.onclick=async()=>{if(roleSelect.value===a.role)return;if(!window.confirm('Change role for '+a.name+'? Open audit assignments and privileged access will be checked.'))return;roleSave.disabled=true;try{const resp=await fetch('/api/v1/manager/auditor-management/role/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,expected:a.role,role:roleSelect.value})}),result=await auditorJson(resp);if(!resp.ok||!result.ok){if(result.error==='ROLE_CHANGE_REQUIRES_ASSIGNMENT_REVIEW'){roleMessage.textContent='Role unchanged · '+(result.impactedAuditIds||[]).length+' open assignments must be resolved first. Review Qualifications → Transfer audits. Manager role also requires separate authorization.';roleMessage.style.color='#b91c1c';roleSelect.value=a.role;roleSave.disabled=false;return}if(result.error==='MANAGER_ROLE_GRANT_REQUIRES_SEPARATE_AUTHORIZATION'){roleMessage.textContent='Role unchanged · granting Manager access requires separate authorization.';roleMessage.style.color='#b91c1c';roleSelect.value=a.role;roleSave.disabled=false;return}throw Error(result.error||'ROLE_SAVE_FAILED')}await load();showAuditor(auditors.find(x=>x.email===a.email)||a)}catch(e){roleSelect.value=a.role;roleMessage.textContent='Not saved: '+e.message;roleSave.disabled=false}};editable('Area','Area',a.area);editable('Time zone','Default time zone',a.timezone);editable('Home base','Default departure from',a.homeBase);editable('Telephone','Mobile telephone',a.phone);row('Future audits',a.futureAudits)}
  else if(page==='Qualifications'){content.appendChild(el('p','Toggle a qualification to review assignment impact and confirm. Removing a qualification requires review of affected audits. Existing assignments remain visible for correction.'));scopeCatalog.forEach(sc=>{const label=el('label');label.style.cssText='display:block;padding:5px 0';const check=el('input');check.type='checkbox';check.checked=a.qualifications.includes(sc.code);check.onchange=async()=>{const original=a.qualifications.includes(sc.code),desired=check.checked;const priorPanel=label.nextElementSibling;if(priorPanel&&priorPanel.classList.contains('auditor-impact-result'))priorPanel.remove();check.disabled=true;let impact=null;try{if(desired&&!original){if(!window.confirm('Add qualification '+sc.code+' for '+a.name+'?')){check.checked=original;return}const sr=await fetch('/api/v1/manager/auditor-management/qualification/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,expected:false,qualified:true})});const saved=await auditorJson(sr);if(!sr.ok||!saved.ok)throw Error(saved.error||'QUALIFICATION_SAVE_FAILED');const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),list=await auditorJson(rr);if(!rr.ok||!list.ok)throw Error('SAVED_REFRESH_FAILED');auditors=list.rows||[];scopeCatalog=list.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');feedback.textContent='Qualification added';return}const res=await fetch('/api/v1/manager/auditor-management/qualification-impact?email='+encodeURIComponent(a.email)+'&scopeCode='+encodeURIComponent(sc.code),{credentials:'same-origin'});impact=await auditorJson(res);if(!res.ok||!impact.ok)throw Error(impact.error||'IMPACT_FAILED');if(!desired&&original&&impact.impactedCount){check.checked=original;feedback.textContent='Existing audits must be transferred first. Open Impact for the transfer controls, or schedule a future withdrawal.';preview.click();return}if(!desired&&original){var impactedIds=(impact.impacted||[]).map(x=>x.auditId);var summary=(impact.impacted||[]).map(x=>[auditorAuditLabel(x),x.status,x.datePlanned||'No date',x.assigned?'Assigned':'Preassigned'].join(' · ')).join('\n');var accepted=Number(impact.acceptedCount||0);var question='Remove qualification '+sc.code+' for '+a.name+'?\n\n'+impact.impactedCount+' affected open audits'+(accepted?'\nWARNING: '+accepted+' ACCEPTED AUDITS':'')+'\n\n'+summary+'\n\nExisting assignments will be preserved; new assignments will be blocked.';if(!window.confirm(question)){check.checked=original;return}const response=await fetch('/api/v1/manager/auditor-management/qualification/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,expected:true,qualified:false,confirmedAuditIds:impactedIds})});const result=await auditorJson(response);if(!response.ok||!result.ok)throw Error((result.error||'QUALIFICATION_REMOVAL_FAILED')+(result.error==='QUALIFICATION_IMPACT_APPROVAL_REQUIRED'?' · impact changed, review again':''));const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),list=await auditorJson(rr);if(!rr.ok||!list.ok)throw Error('SAVED_REFRESH_FAILED');auditors=list.rows||[];scopeCatalog=list.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');const notice=document.querySelector('#auditorManagement20Dossier [role=status]');if(notice)notice.textContent='Qualification removed · '+impactedIds.length+' affected audits · use Transfer for each audit below';return}if(impact.impactedCount){var resultNode=label.nextElementSibling;if(!resultNode||!resultNode.classList.contains('auditor-impact-result')){resultNode=el('div');resultNode.className='auditor-impact-result';resultNode.style.cssText='margin:5px 0 12px 18px';label.after(resultNode)}resultNode.replaceChildren();preview.textContent='Hide impact';resultNode.appendChild(el('strong',impact.impactedCount+' existing audit assignments · review before qualification withdrawal'));(impact.impacted||[]).forEach(item=>{var line=el('div',[item.company,item.status,item.datePlanned||'No date',item.assigned?'Assigned':'Preassigned'].join(' · '));line.style.padding='4px 0';resultNode.appendChild(line)});const existing=(a.withdrawals||[]).find(x=>x.scopeCode===sc.code);if(existing){resultNode.appendChild(el('p','Withdrawal already scheduled for '+existing.effectiveDate+' · '+(existing.grandfatheredAuditIds||[]).length+' existing audits preserved'))}else{const controls=el('div');controls.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px';controls.appendChild(el('span','Withdraw qualification effective:'));const dateInput=el('input');dateInput.type='date';dateInput.min=new Date(Date.now()+86400000).toISOString().slice(0,10);dateInput.value=dateInput.min;controls.appendChild(dateInput);const proceed=el('button','Preserve listed audits & schedule withdrawal');proceed.type='button';proceed.onclick=async()=>{if(!dateInput.value||dateInput.value<dateInput.min){feedback.textContent='Choose a valid future effective date';return}if(!window.confirm('Withdraw '+sc.code+' from '+dateInput.value+'? Preserve exactly '+impact.impacted.length+' listed audits; block new assignments from that date.'))return;proceed.disabled=true;try{const response=await fetch('/api/v1/manager/auditor-management/qualification/withdraw',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,effectiveDate:dateInput.value,grandfatheredAuditIds:(impact.impacted||[]).map(x=>x.auditId)})}),answer=await auditorJson(response);if(!response.ok||!answer.ok)throw Error(answer.error||'WITHDRAWAL_FAILED');const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),list=await auditorJson(rr);if(!rr.ok||!list.ok)throw Error('SAVED_REFRESH_FAILED');auditors=list.rows||[];scopeCatalog=list.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');feedback.textContent='Withdrawal scheduled'}catch(e){feedback.textContent='Withdrawal not confirmed: '+e.message;proceed.disabled=false}};proceed.disabled=!impact.withdrawalWriteEnabled;controls.appendChild(proceed);resultNode.appendChild(controls);if(!impact.withdrawalWriteEnabled)resultNode.appendChild(el('p','Save unavailable: DEV Apps Script eligibility guard must be deployed and verified before withdrawal scheduling can be enabled.'))}feedback.textContent='Qualification unchanged · affected audits shown below';check.checked=original;return}if(!window.confirm((desired?'Add':'Remove')+' qualification '+sc.code+' for '+a.name+'? No assigned audits were found.')){check.checked=original;return}const saveResponse=await fetch('/api/v1/manager/auditor-management/qualification/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,expected:original,qualified:desired})});const saveResult=await auditorJson(saveResponse);if(!saveResponse.ok||!saveResult.ok)throw Error(saveResult.error+(saveResult.affected?' · '+saveResult.affected+' audits':''));const listResponse=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),listData=await auditorJson(listResponse);if(!listResponse.ok||!listData.ok)throw Error('SAVE_SUCCEEDED_REFRESH_FAILED');auditors=listData.rows||[];scopeCatalog=listData.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');feedback.textContent='Qualification saved';}catch(error){check.checked=original;feedback.textContent='Qualification not saved: '+error.message}finally{check.disabled=false}};label.append(check,document.createTextNode(' '+(sc.name||sc.code)));const scheduled=(a.withdrawals||[]).find(w=>w.scopeCode===sc.code);if(scheduled){const dateNote=el('span',' · withdrawal '+scheduled.effectiveDate);dateNote.style.cssText='color:#b45309;margin-left:8px';dateNote.title=(scheduled.grandfatheredAuditIds||[]).length+' existing audits preserved';label.appendChild(dateNote);const cancel=el('button','Cancel withdrawal');cancel.type='button';cancel.style.marginLeft='10px';cancel.onclick=async()=>{if(!confirm('Cancel withdrawal '+sc.code+' effective '+scheduled.effectiveDate+'?'))return;cancel.disabled=true;try{const response=await fetch('/api/v1/manager/auditor-management/qualification/withdraw/cancel',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,expectedEffectiveDate:scheduled.effectiveDate})});const result=await auditorJson(response);if(!response.ok||!result.ok)throw Error(result.error||'CANCELLATION_FAILED');await load();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications')}catch(e){feedback.textContent='Cancellation failed: '+e.message;cancel.disabled=false}};label.appendChild(cancel)}const preview=el('button','Impact');preview.type='button';preview.style.marginLeft='15px';preview.onclick=async()=>{
 var existingPanel=label.nextElementSibling;if(existingPanel&&existingPanel.classList.contains('auditor-impact-result')){existingPanel.remove();preview.textContent='Impact';return}preview.textContent='Hide impact';
 var out=label.nextElementSibling;if(!out||!out.classList.contains('auditor-impact-result')){out=el('div');out.className='auditor-impact-result';out.style.cssText='margin:5px 0 12px 18px';label.after(out)}out.textContent='Loading qualification impact…';
 try{const res=await fetch('/api/v1/manager/auditor-management/qualification-impact?email='+encodeURIComponent(a.email)+'&scopeCode='+encodeURIComponent(sc.code),{credentials:'same-origin'}),data=await auditorJson(res);
 if(!res.ok||!data.ok)throw Error(data.error||'IMPACT_READ_FAILED');
 out.replaceChildren();const title=el('strong',data.impactedCount+' open assigned/preassigned audits affected · '+data.acceptedCount+' Accepted');if(data.acceptedCount)title.style.color='#b91c1c';out.appendChild(title);
 (data.impacted||[]).forEach(item=>{const line=el('div',[item.company,item.status,item.datePlanned||'Date not set',item.assigned?'Assigned':'Preassigned'].join(' · '));line.style.padding='3px 0';out.appendChild(line);if(item.auditId){const transferRow=el('div');transferRow.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0 12px 12px';const choice=el('select');choice.appendChild(new Option('Checking eligible colleagues…',''));choice.disabled=true;const transfer=el('button','Transfer → Pending Approval');transfer.type='button';transfer.disabled=true;const note=el('span');note.style.cssText='font-size:13px;color:inherit;white-space:pre-line;line-height:1.5;max-width:700px';transferRow.append(choice,transfer,note);out.appendChild(transferRow);let eligible=[];fetch('/api/v1/manager/auditor-management/audit/transfer-candidates?auditId='+encodeURIComponent(item.auditId)+'&fromEmail='+encodeURIComponent(a.email),{credentials:'same-origin'}).then(async response=>{const data=await auditorJson(response);if(!response.ok||!data.ok)throw Error(data.error||'CANDIDATE_CHECK_FAILED');eligible=data.eligible||[];line.textContent=[data.company,(data.scopes||[]).join(', '),item.status,item.datePlanned||'Date not set',item.assigned?'Assigned':'Preassigned'].join(' · ');choice.replaceChildren(new Option(eligible.length?'Select qualified colleague':'No eligible colleagues',''));eligible.forEach(x=>choice.appendChild(new Option(x.name+' ('+x.email+')',x.email)));choice.disabled=!eligible.length;if(!item.datePlanned){note.textContent='No audit date set: eligibility must be rechecked when the audit is scheduled.'}if(!eligible.length){const excluded=data.excluded||[];note.textContent=excluded.length?'No eligible colleagues:\n'+auditorExcludedSummary(excluded):'No other active qualified auditors found';note.style.cssText='display:block;flex-basis:100%;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;max-width:none'}choice.onchange=()=>{transfer.disabled=!choice.value;const selected=eligible.find(x=>x.email===choice.value);note.textContent=selected?.planningWarnings?.length?'Date restriction: review required before approval':(!item.datePlanned&&selected?'Eligibility provisional — recheck when audit date is set':'')}}).catch(e=>{choice.replaceChildren(new Option('Candidate check failed',''));note.textContent=e.message});transfer.onclick=async()=>{if(!choice.value||!window.confirm('Transfer '+auditorAuditLabel(item)+' to '+choice.value+'? Existing date retained. Availability is NOT confirmed. Colleague approval required.'))return;transfer.disabled=true;try{const response=await fetch('/api/v1/manager/auditor-management/audit/transfer',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({auditId:item.auditId,fromEmail:a.email,toEmail:choice.value,expectedStatus:item.status,acknowledgeDateRestriction:true,reason:'Qualification withdrawal reassignment'})});const result=await auditorJson(response);if(!response.ok||!result.ok)throw Error(result.error||'TRANSFER_FAILED');const rr=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),fresh=await auditorJson(rr);if(!rr.ok||!fresh.ok)throw Error('TRANSFER_SUCCEEDED_REFRESH_FAILED');auditors=fresh.rows||[];scopeCatalog=fresh.scopeCatalog||[];render();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications');const status=document.querySelector('#auditorManagement20Dossier [role=status]');if(status)status.textContent='Audit transferred to '+choice.value+' · pending colleague approval'}catch(e){note.textContent='Transfer not confirmed: '+e.message;transfer.disabled=false}}}});
 if(check.checked){const scheduled=(a.withdrawals||[]).find(w=>w.scopeCode===sc.code);if(scheduled){out.appendChild(el('p','Withdrawal effective '+scheduled.effectiveDate));const cancel=el('button','Cancel withdrawal');cancel.type='button';cancel.onclick=async()=>{if(!confirm('Cancel withdrawal '+sc.code+'?'))return;const response=await fetch('/api/v1/manager/auditor-management/qualification/withdraw/cancel',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,expectedEffectiveDate:scheduled.effectiveDate})});const result=await auditorJson(response);if(!response.ok||!result.ok){alert(result.error||'Cancellation failed');return}await load();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications')};out.appendChild(cancel)}else{const line=el('div');line.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px';line.appendChild(el('span','Not qualified after'));const date=el('input');date.type='date';date.min=new Date(Date.now()+86400000).toISOString().slice(0,10);date.value=date.min;line.appendChild(date);const action=el('button','Schedule withdrawal');action.type='button';action.disabled=!data.withdrawalWriteEnabled;action.onclick=async()=>{if(!date.value||date.value<date.min)return;if(!window.confirm('Schedule qualification withdrawal '+sc.code+' from '+date.value+'?'))return;action.disabled=true;try{const rr=await fetch('/api/v1/manager/auditor-management/qualification/withdraw',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,scopeCode:sc.code,effectiveDate:date.value,grandfatheredAuditIds:(data.impacted||[]).map(x=>x.auditId)})});const result=await auditorJson(rr);if(!rr.ok||!result.ok)throw Error(result.error||'WITHDRAWAL_FAILED');await load();showAuditor(auditors.find(x=>x.email===a.email)||a,'Qualifications')}catch(e){out.appendChild(el('p','Withdrawal not saved: '+e.message));action.disabled=false}};line.appendChild(action);out.appendChild(line);if(!data.withdrawalWriteEnabled)out.appendChild(el('p','Scheduling locked until DEV runtime guards are verified and enabled.'))}}
 }catch(e){out.textContent='Impact preview unavailable: '+e.message}
 };label.appendChild(preview);content.appendChild(label)})}
  else if(page==='Availability Defaults'){
   const weekdays=['Mo','Tu','We','Th','Fr'],orig=a.blockedWeekdays||'',chosen=new Set(orig.split(',').map(x=>x.trim()).filter(Boolean));
   const line=el('div');line.appendChild(el('strong','Preferred unavailable weekdays (soft)'));weekdays.forEach(day=>{const label=el('label');label.style.cssText='margin:9px 14px 8px 0;display:inline-block';const cb=el('input');cb.type='checkbox';cb.checked=chosen.has(day);cb.onchange=()=>{if(cb.checked)chosen.add(day);else chosen.delete(day);stage('Blocked weekdays',orig,weekdays.filter(x=>chosen.has(x)).join(', '))};label.append(cb,document.createTextNode(' '+day));line.appendChild(label)});content.appendChild(line);
   row('Default working hours','No canonical working-hours column yet');
   const timezoneLine=el('div'),timezonePicker=el('select'),timezoneCurrent=String(a.timezone||'');timezoneLine.style.cssText='display:grid;grid-template-columns:minmax(140px,220px) minmax(240px,1fr);gap:12px;padding:7px 0;border-bottom:1px solid #edf0f4';timezonePicker.style.cssText='padding:6px;max-width:620px;width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:5px';
   const timezoneOptions=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):[];
   const timezones=[...new Set([timezoneCurrent,...timezoneOptions,'Europe/Madrid','Europe/Lisbon','Europe/Amsterdam'].filter(Boolean))].sort();
   timezones.forEach(zone=>timezonePicker.appendChild(new Option(zone,zone)));timezonePicker.value=timezoneCurrent;timezonePicker.onchange=()=>stage('Default time zone',timezoneCurrent,timezonePicker.value);timezoneLine.append(el('strong','Time zone'),timezonePicker);content.appendChild(timezoneLine);
   editable('Departure from','Default departure from',a.homeBase);
  }else{const indicator=el('p','Loading change history…');content.appendChild(indicator);
   fetch('/api/v1/manager/auditor-management/history?email='+encodeURIComponent(a.email),{credentials:'same-origin'}).then(async response=>{const data=await auditorJson(response);if(!response.ok||!data.ok)throw Error(data.error||'HISTORY_UNAVAILABLE');if(currentPage!=='History')return;content.replaceChildren();if(!data.rows.length){content.appendChild(el('p','No governed profile changes recorded yet'));return}
    data.rows.forEach(event=>{const card=el('div');card.style.cssText='padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px';const d=event.detail||{},fields=(event.changes||[]).filter(x=>x&&x.field),date=event.timestamp?new Date(event.timestamp).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'Unknown date',action=(event.action||'Change').replaceAll('_',' ');let description='';if(event.action==='AUDIT_TRANSFER'){description='Audit '+auditorAuditLabel(d)+' · '+(d.fromEmail||'?')+' → '+(d.toEmail||'?')+' · '+(d.oldStatus||'?')+' → '+(d.newStatus||'?');if(d.planningWarnings?.length)description+=' · ⚠ '+d.planningWarnings.join(', ')}else if(fields.length){description=fields.map(change=>change.field+': '+(change.old??'—')+' → '+(change.newValue??'—')).join(' | ')}else if(event.action==='QUALIFICATION_EDIT'){description='Qualification '+(d.scopeCode||'?')+': '+(d.old||d.oldValue||'qualified')+' → '+(d.newValue||'removed')}else{description=Object.entries(d).filter(([k,v])=>!['id','changes','trailId','actor','auditorEmail'].includes(k)&&v!=null&&typeof v!=='object').slice(0,4).map(([k,v])=>k.replace(/([A-Z])/g,' $1')+': '+v).join(' · ')||event.summary||'No details recorded'}card.textContent=date+' · '+action+' · '+description+' · '+(event.actor||'Unknown actor');card.title=JSON.stringify(d);content.appendChild(card)})
   }).catch(e=>{if(currentPage==='History')indicator.textContent='History unavailable: '+e.message})}
 }
 pages.forEach(page=>{const button=el('button',page);button.type='button';button.onclick=()=>{if(Object.keys(pending).length){feedback.textContent='Save or discard changes before switching tab';return}draw(page)};tabs.appendChild(button)});
 discard.onclick=()=>{pending={};draw(currentPage);refresh()};
 save.onclick=async()=>{if(saving||!Object.keys(pending).length)return;saving=true;refresh();feedback.textContent='Saving…';
  try{const response=await fetch('/api/v1/manager/auditor-management/profile/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,changes:pending})}),result=await auditorJson(response);
   if(!response.ok||!result.ok)throw Error([result.error,result.field,result.detail].filter(Boolean).join(' · '));
   const updatedEmail=a.email;const read=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),data=await auditorJson(read);if(!read.ok||!data.ok)throw Error('SAVE_DONE_REFRESH_FAILED');
   auditors=data.rows||[];scopeCatalog=data.scopeCatalog||[];const updated=auditors.find(x=>x.email===updatedEmail);if(!updated)throw Error('AUDITOR_NOT_FOUND_AFTER_SAVE');
   const returnPage=currentPage;pending={};saving=false;render();showAuditor(updated,returnPage);const st=document.querySelector('#auditorManagement20Dossier [role=status]');if(st)st.textContent='Saved '+result.updated+' changes';
  }catch(e){saving=false;refresh();feedback.textContent='Save blocked or unconfirmed: '+e.message}
 };draw(pages.includes(initialPage)?initialPage:'Profile');refresh()
}
function render(){
 const q=search.value.trim().toLowerCase(),mode=filter.value;rows.replaceChildren();
 const list=auditors.filter(a=>(mode==='all'||(mode==='active')===a.active)&&(!q||[a.name,a.email,a.area,...a.qualifications].join(' ').toLowerCase().includes(q)));
 list.forEach(a=>{const tr=el('tr'),values=[a.name,a.area,a.active?'Yes':'No',a.qualifications.join(', '),a.futureAudits,a.qualificationConflictCount?'⚠ '+a.qualificationConflictCount+' qualification conflict(s)':''];values.forEach((value,i)=>{const td=el('td');if(i===0){const button=el('button',value);button.type='button';button.onclick=()=>showAuditor(a);td.appendChild(button)}else td.textContent=String(value);td.style.overflowWrap='anywhere';tr.appendChild(td)});rows.appendChild(tr)});
 status.textContent=list.length+' / '+auditors.length+' auditors · Profile/weekday defaults editable · qualifications require impact controls';
}
async function load(){status.textContent='Loading auditor directory…';const response=await fetch('/api/v1/manager/auditor-management',{credentials:'same-origin'}),result=await auditorJson(response);if(!response.ok||!result.ok)throw Error(result.error||'AUDITOR_MANAGEMENT_READ_FAILED');auditors=result.rows||[];scopeCatalog=result.scopeCatalog||[];render()}
document.getElementById('auditorManagement20Add').onclick=function(){
 if(hasUnsavedAuditorChanges()&&!window.confirm('Discard unsaved auditor profile changes and open Add auditor?'))return;
 hasUnsavedAuditorChanges=()=>false;
 dossier.hidden=false;dossier.replaceChildren();dossier.appendChild(el('h3','Add auditor'));dossier.appendChild(el('p','New auditors start Inactive and without qualifications. Activate and assign qualifications after review.'));
 const fields=[['Name','name'],['E-mail','email'],['Area','area'],['Time zone','timezone']];const inputs={};fields.forEach(([label,key])=>{const line=el('div');line.style.cssText='display:grid;grid-template-columns:140px minmax(200px,1fr);gap:10px;align-items:center;margin:8px 0';const input=el('input');input.placeholder=label;input.style.cssText='min-width:0;width:100%;max-width:480px;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:5px';input.autocomplete='off';if(key==='email')input.type='email';if(key==='name'||key==='email')input.required=true;const title=el('label',label);title.appendChild(document.createTextNode(key==='name'||key==='email'?' *':''));line.append(title,input);inputs[key]=input;dossier.appendChild(line)});inputs.timezone.value='Europe/Madrid';
 const save=el('button','Create inactive auditor'),cancel=el('button','Cancel'),message=el('span','');message.style.marginLeft='10px';dossier.append(save,cancel,message);cancel.onclick=()=>{dossier.hidden=true};
 save.onclick=async()=>{const name=inputs.name.value.trim(),email=inputs.email.value.trim().toLowerCase(),timezone=inputs.timezone.value.trim();if(!name||name.length>160){message.textContent='Enter an auditor name (maximum 160 characters)';inputs.name.focus();return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){message.textContent='Enter a valid e-mail address';inputs.email.focus();return}if(timezone&&!/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(timezone)){message.textContent='Enter a valid IANA time zone (e.g. Europe/Madrid)';inputs.timezone.focus();return}if(auditors.some(a=>a.email.toLowerCase()===email||a.name.trim().toLowerCase()===name.toLowerCase())){message.textContent='Auditor name or e-mail already exists';return}save.disabled=true;message.textContent='Creating…';let createdEmail='';try{const resp=await fetch('/api/v1/manager/auditor-management/create',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,area:inputs.area.value.trim(),timezone})}),data=await auditorJson(resp);if(!resp.ok||!data.ok)throw Error((data.error||'CREATE_FAILED')+(data.detail?' · '+data.detail:''));createdEmail=data.email;message.textContent='Created inactive auditor · refreshing directory…';await load();const created=auditors.find(x=>x.email===createdEmail);if(created)showAuditor(created);else{save.disabled=true;message.textContent='Created successfully; directory refresh incomplete. Reopen Auditor Management to view the auditor.'}}catch(e){save.disabled=!!createdEmail;message.textContent=(createdEmail?'Created, but directory refresh failed: ':'Creation not confirmed: ')+e.message}}
};
trigger.onclick=function(){if(String(actorRole).toLowerCase()!=='manager')return;document.getElementById('scopeManagement20Panel').hidden=true;document.getElementById('companyManagement20Panel').hidden=true;panel.hidden=false;load().catch(e=>status.textContent='Auditor directory unavailable: '+e.message)};
close.onclick=function(){panel.hidden=true};search.oninput=render;filter.onchange=render;
})();

try{var mailActionEvents20=new BroadcastChannel("ams-auditor-actions-20");mailActionEvents20.onmessage=function(e){if(e.data&&e.data.type==="AUDIT_ACTION_CONFIRMED"&&currentView==="open")loadOpen()}}catch(e){console.warn("[AUDITOR_ACTION_SYNC]",e)}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(sess){if(!sess.ok||!sess.identity)throw new Error("SESSION_REQUIRED");actorRole=String(sess.identity.role||"Manager");document.getElementById("scopeManagement20").hidden=String(actorRole).toLowerCase()!=="manager";document.getElementById("auditorManagement20").hidden=String(actorRole).toLowerCase()!=="manager";document.getElementById("notificationsManager20").hidden=String(actorRole).toLowerCase()!=="manager";document.getElementById("companyManagement20").hidden=!['manager','auditor'].includes(String(actorRole).toLowerCase());document.getElementById("identity").textContent=sess.identity.email+" · "+actorRole;applyActorUi();swap20RefreshAttention();if(String(actorRole).toLowerCase()==="manager")initRelay().catch(function(e){console.warn("[WARM_GAS_WORKER_INIT]",e)});return loadOpen().then(function(){document.addEventListener("visibilitychange",function(){if(!document.hidden)swap20RefreshAttention()});window.addEventListener("focus",swap20RefreshAttention);})}).catch(fail);
})();