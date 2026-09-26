(function(){
"use strict";
var all=[];
var currentView="open";

function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function text(v){return v==null||v===""?"-":String(v)}

function renderHead(){
  var h=document.getElementById("gridHead");
  if(!h)return;
  if(currentView==="completed"){
    h.innerHTML="<tr><th>Company</th><th>Region</th><th>Scopes</th><th>Executed on</th><th>Auditor</th><th>Hours planned</th><th>Hours dedicated</th><th>Completed date</th><th>Status</th></tr>";
  }else{
    h.innerHTML="<tr><th>Company</th><th>Region</th><th>Scopes</th><th>Status</th><th>Planning window</th><th>To be planned</th><th>Hours planned</th><th>Auditor</th><th>Actions</th></tr>";
  }
}

function renderOpen(rows){
  return rows.map(function(r){
    var raw=r.allowedActions||[];
    var ui=[];
    if(raw.indexOf("PLAN")>=0)ui.push({key:"plan",label:"Plan"});
    if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});
    if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});
    if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});
    var actions=ui.map(function(a){return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>"}).join("");
    return "<tr><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(text(r.status))+"</td><td>"+esc(text(r.planningWindowText))+"</td><td>"+esc(text(r.requiredHours))+"</td><td>"+esc(text(r.hoursPlanned))+"</td><td>"+esc(text(r.assignedTo))+"</td><td>"+actions+"</td></tr>";
  }).join("");
}

function renderCompleted(rows){
  return rows.map(function(r){
    return "<tr><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(text(r.executedOn))+"</td><td>"+esc(text(r.auditor))+"</td><td>"+esc(text(r.hoursPlanned))+"</td><td>"+esc(text(r.hoursDedicated))+"</td><td>"+esc(text(r.completedDate))+"</td><td>"+esc(text(r.status||"Completed"))+"</td></tr>";
  }).join("");
}

function render(rows){
  renderHead();
  var body=document.getElementById("rows");
  if(!rows.length){body.innerHTML="<tr><td class=\"empty\" colspan=\"9\">No audits found</td></tr>";return}
  body.innerHTML=currentView==="completed"?renderCompleted(rows):renderOpen(rows);
  if(currentView!=="open")return;
  document.querySelectorAll(".act").forEach(function(button){button.addEventListener("click",function(){runAction(button)})});
}

var actionBusy=false;
function runAction(button){
  if(actionBusy)return;
  var auditId=button.getAttribute("data-audit-id");
  var action=button.getAttribute("data-action");
  if(action==="plan"){
    window.location.href="/planning?auditId="+encodeURIComponent(auditId);
    return;
  }
  var reason="";
  if(action==="cancel"||action==="reject"){
    reason=window.prompt((action==="cancel"?"Cancel":"Reject")+" audit "+auditId+"\nReason:");
    if(reason===null)return;
    reason=reason.trim();
    if(!reason){window.alert("Reason is required.");return}
  }else if(!window.confirm(action.toUpperCase()+" audit "+auditId+"?"))return;
  actionBusy=true;
  document.querySelectorAll(".act").forEach(function(b){b.disabled=true});
  fetch("/api/v1/manager/action",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({auditId:auditId,action:action,options:{reason:reason,comment:reason}})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false||x.ok===false)throw new Error(x.message||x.error||"Action failed");return x})})
    .then(function(){return loadOpen()})
    .catch(function(e){window.alert(e.message)})
    .finally(function(){actionBusy=false;document.querySelectorAll(".act").forEach(function(b){b.disabled=false})});
}

function searchable(r){
  if(currentView==="completed")return [r.auditId,r.company,r.region,r.scopesText,r.status,r.auditor,r.executedOn,r.completedDate,r.hoursPlanned,r.hoursDedicated].join(" ").toLowerCase();
  return [r.auditId,r.company,r.region,r.scopesText,r.status,r.assignedTo,r.planningWindowText,r.requiredHours,r.hoursPlanned].join(" ").toLowerCase();
}
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return searchable(r).indexOf(z)>=0}))}
function setTabs(){document.getElementById("completedView").style.background=currentView==="completed"?"#dbeafe":"white";document.getElementById("openView").style.background=currentView==="open"?"#dbeafe":"white"}

function loadOpen(){
  currentView="open";
  return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){
    if(!x.success)throw new Error(x.error||x.message||"Read failed");
    all=x.rows.slice();
    document.getElementById("status").className="";
    document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms server";
    var c=x.counts||{};
    document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("");
    setTabs();filter();
  }).catch(fail)
}

function loadCompleted(){
  currentView="completed";
  return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){
    if(a.success===false)throw new Error(a.error||a.message||"Read failed");
    all=(a.rows||[]).slice();
    document.getElementById("status").className="";
    document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";
    document.getElementById("cards").innerHTML="";
    setTabs();filter();
  }).catch(fail)
}

function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(s){if(s.ok&&s.identity)document.getElementById("identity").textContent=s.identity.email}).catch(function(){});
document.getElementById("q").addEventListener("input",filter);
document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};
document.getElementById("openView").onclick=loadOpen;
document.getElementById("completedView").onclick=loadCompleted;
loadOpen();
})();