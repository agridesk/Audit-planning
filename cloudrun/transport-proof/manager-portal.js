(function(){
"use strict";
var all=[];
var currentView="open";
var openCounts={total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0};
var busyAudits=new Set();

function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function text(v){return v==null||v===""?"-":String(v)}
function displayStatus(v){var s=String(v==null?"":v).trim().toLowerCase();return s==="approved"?"Pending acceptance":text(v)}
function hoursClass(expected,actual){var e=Number(expected),a=Number(actual);if(!isFinite(e)||!isFinite(a))return "";if(Math.abs(a-e)<0.001)return "hours-match";return a<e?"hours-under":"hours-over"}
function bucketKey(statusKey){return statusKey==="PENDING_PLANNING"?"pendingPlanning":statusKey==="PENDING_APPROVAL"?"pendingApproval":statusKey==="APPROVED"?"approved":statusKey==="ACCEPTED"?"accepted":""}
function latestCommentText(r){if(!r.latestComment)return "";var actor=r.latestCommentActor||"";var action=r.latestCommentAction||"";return (actor?actor+(action?" · "+action:"")+": ":"")+r.latestComment}
function alertCell(r){
  if(!r.latestComment)return "<td class=\"alert-cell\"></td>";
  var action=String(r.latestCommentAction||"").toUpperCase();
  var cls=action==="REJECT"?"alert-icon alert-critical":"alert-icon alert-info";
  var title=(r.latestCommentTimestamp?String(r.latestCommentTimestamp)+" · ":"")+latestCommentText(r);
  return "<td class=\"alert-cell\"><span class=\""+cls+"\" title=\""+esc(title)+"\" aria-label=\""+esc(title)+"\" tabindex=\"0\">!</span></td>";
}
function renderCards(){var c=openCounts||{};document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("")}
function adjustCounters(beforeKey,afterKey){if(beforeKey===afterKey)return;var b=bucketKey(beforeKey),a=bucketKey(afterKey);if(b)openCounts[b]=Math.max(0,Number(openCounts[b]||0)-1);if(a)openCounts[a]=Number(openCounts[a]||0)+1;if(b&&!a)openCounts.total=Math.max(0,Number(openCounts.total||0)-1);if(!b&&a)openCounts.total=Number(openCounts.total||0)+1;renderCards()}

function renderHead(){
  var h=document.getElementById("gridHead");
  if(!h)return;
  if(currentView==="completed"){
    h.innerHTML="<tr><th>Company</th><th>Region</th><th>Scopes</th><th>Executed on</th><th>Auditor</th><th>Hours planned</th><th>Hours dedicated</th><th>Completed date</th><th>Status</th></tr>";
  }else{
    h.innerHTML="<tr><th>Company</th><th>Region</th><th>Scopes</th><th>Status</th><th>Planning window</th><th>To be planned</th><th>Hours planned</th><th>Scheduled hours</th><th>Auditor</th><th class=\"alert-head\">Alert</th><th>Actions</th></tr>";
  }
}

function renderOpenRow(r){
  var raw=r.allowedActions||[];
  var ui=[];
  if(raw.indexOf("PLAN")>=0)ui.push({key:"plan",label:"Plan"});
  if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});
  if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});
  if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});
  var actions=ui.map(function(a){return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>"}).join("");
  var formalClass=hoursClass(r.requiredHours,r.hoursPlanned);
  var scheduledClass=hoursClass(r.scheduledHoursTarget,r.scheduledHours);
  var scheduledTitle=r.scheduledHoursTarget!=null?" title=\"Scheduled target: "+esc(text(r.scheduledHoursTarget))+" h; based on company formal hours plus Config_Scopes scheduling delta\"":"";
  return "<tr data-audit-id=\""+esc(r.auditId)+"\"><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(displayStatus(r.status))+"</td><td>"+esc(text(r.planningWindowText))+"</td><td>"+esc(text(r.requiredHours))+"</td><td class=\""+formalClass+"\">"+esc(text(r.hoursPlanned))+"</td><td class=\""+scheduledClass+"\""+scheduledTitle+">"+esc(text(r.scheduledHours))+"</td><td>"+esc(text(r.assignedTo))+"</td>"+alertCell(r)+"<td>"+actions+"</td></tr>";
}
function renderOpen(rows){return rows.map(renderOpenRow).join("")}

function renderCompleted(rows){
  return rows.map(function(r){
    return "<tr><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(text(r.executedOn))+"</td><td>"+esc(text(r.auditor))+"</td><td>"+esc(text(r.hoursPlanned))+"</td><td>"+esc(text(r.hoursDedicated))+"</td><td>"+esc(text(r.completedDate))+"</td><td>"+esc(text(r.status||"Completed"))+"</td></tr>";
  }).join("");
}
function bindActionButtons(root){(root||document).querySelectorAll(".act").forEach(function(button){button.addEventListener("click",function(){runAction(button)})})}
function render(rows){
  renderHead();
  var body=document.getElementById("rows");
  if(!rows.length){body.innerHTML="<tr><td class=\"empty\" colspan=\""+(currentView==="completed"?"9":"11")+"\">No audits found</td></tr>";return}
  body.innerHTML=currentView==="completed"?renderCompleted(rows):renderOpen(rows);
  if(currentView==="open")bindActionButtons(body);
}

function patchRowInPlace(auditId,patch,perf){
  var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)throw new Error("Audit row not found locally");
  var before=all[idx],after=Object.assign({},before,patch),beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
  all[idx]=after;
  var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(!tr)throw new Error("Audit row not visible");
  tr.outerHTML=renderOpenRow(after);
  var fresh=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(fresh)bindActionButtons(fresh);
  adjustCounters(beforeKey,after.statusKey);
  window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt);
  var timing="write "+perf.writeMs+" · reread "+perf.rereadMs+" · patch "+perf.patchMs;
  if(perf.gasMs!=null)timing+=" · GAS "+perf.gasMs+" · bridge "+perf.bridgeMs;
  document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · action "+perf.totalMs+" ms ("+timing+")";
  console.info("[MANAGER_ACTION_TIMING]",{auditId:auditId,action:perf.action,writeMs:perf.writeMs,gasActionMs:perf.gasMs,bridgeMs:perf.bridgeMs,rereadMs:perf.rereadMs,patchMs:perf.patchMs,totalMs:perf.totalMs});
}
function rereadAndPatch(auditId,sourceRow,perf){var t=performance.now(),url="/api/v1/manager/audit?auditId="+encodeURIComponent(auditId)+(sourceRow?"&sourceRow="+encodeURIComponent(sourceRow):"");return fetch(url,{credentials:"same-origin"}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.message||x.error||"Canonical reread failed");return x})}).then(function(x){perf.rereadMs=Math.round(performance.now()-t);patchRowInPlace(auditId,x,perf);return x})}

function runAction(button){
  var auditId=button.getAttribute("data-audit-id"),action=button.getAttribute("data-action"),row=all.find(function(r){return r.auditId===auditId});
  if(busyAudits.has(auditId))return;
  if(action==="plan"){window.location.href="/planning?auditId="+encodeURIComponent(auditId);return}
  var reason="";
  if(action==="cancel"||action==="reject"){reason=window.prompt((action==="cancel"?"Cancel":"Reject")+" audit "+auditId+"\nComment:");if(reason===null)return;reason=reason.trim();if(!reason){window.alert("Comment is required.");return}}
  else if(!window.confirm(action.toUpperCase()+" audit "+auditId+"?"))return;
  busyAudits.add(auditId);
  var tr=button.closest("tr");if(tr)tr.querySelectorAll(".act").forEach(function(b){b.disabled=true});
  var perf={action:action,startedAt:performance.now(),writeMs:0,rereadMs:0,patchMs:0,gasMs:null,bridgeMs:null},wt=performance.now();
  fetch("/api/v1/manager/action",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({auditId:auditId,action:action,options:{reason:reason,comment:reason}})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false||x.ok===false)throw new Error(x.message||x.error||"Action failed");return x})})
    .then(function(writeResult){perf.writeMs=Math.round(performance.now()-wt);var gas=Number(writeResult&&writeResult.perf&&writeResult.perf.managerActionAdapterMs);if(!isFinite(gas))gas=Number(writeResult&&writeResult.externalManagerTiming&&writeResult.externalManagerTiming.gasDoPostMs);if(isFinite(gas)){perf.gasMs=Math.round(gas);perf.bridgeMs=Math.max(0,perf.writeMs-perf.gasMs)}if(action==="cancel"||action==="reject")return rereadAndPatch(auditId,row&&row.sourceRow,perf);return loadOpen()})
    .catch(function(e){window.alert(e.message);if(tr)tr.querySelectorAll(".act").forEach(function(b){b.disabled=false})})
    .finally(function(){busyAudits.delete(auditId)});
}

function searchable(r){
  if(currentView==="completed")return [r.auditId,r.company,r.region,r.scopesText,r.status,r.auditor,r.executedOn,r.completedDate,r.hoursPlanned,r.hoursDedicated].join(" ").toLowerCase();
  return [r.auditId,r.company,r.region,r.scopesText,r.status,r.assignedTo,r.planningWindowText,r.requiredHours,r.hoursPlanned,r.scheduledHours,r.scheduledHoursTarget,r.latestComment].join(" ").toLowerCase();
}
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return searchable(r).indexOf(z)>=0}))}
function setTabs(){document.getElementById("completedView").style.background=currentView==="completed"?"#dbeafe":"white";document.getElementById("openView").style.background=currentView==="open"?"#dbeafe":"white"}
function loadOpen(){
  currentView="open";
  return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){
    if(!x.success)throw new Error(x.error||x.message||"Read failed");all=x.rows.slice();openCounts=Object.assign({total:all.length,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0},x.counts||{});
    document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms server";renderCards();setTabs();filter();
  }).catch(fail)
}
function loadCompleted(){
  currentView="completed";
  return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){if(a.success===false)throw new Error(a.error||a.message||"Read failed");all=(a.rows||[]).slice();document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";setTabs();filter()}).catch(fail)
}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(s){if(s.ok&&s.identity)document.getElementById("identity").textContent=s.identity.email}).catch(function(){});
document.getElementById("q").addEventListener("input",filter);
document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};
document.getElementById("openView").onclick=loadOpen;
document.getElementById("completedView").onclick=loadCompleted;
loadOpen();
})();