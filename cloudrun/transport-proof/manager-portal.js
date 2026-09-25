(function(){
"use strict";
var all=[];
function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function render(rows){
  document.getElementById("rows").innerHTML=rows.map(function(r){
    var raw=r.allowedActions||[];
    var ui=[];
    if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});
    if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});
    if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});
    var actions=ui.map(function(a){
      return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>";
    }).join("");
    return "<tr><td>"+esc(r.company)+"</td><td>"+esc(r.region)+"</td><td>"+esc(r.scopesText)+"</td><td>"+esc(r.status)+"</td><td>"+esc(r.planningWindowText)+"</td><td>"+esc(r.requiredHours)+"</td><td>"+esc(r.hoursPlanned)+"</td><td>"+esc(r.assignedTo)+"</td><td>"+actions+"</td></tr>";
  }).join("");
  document.querySelectorAll(".act").forEach(function(button){
    button.addEventListener("click",function(){runAction(button)});
  });
}
var actionBusy=false;
function runAction(button){
  if(actionBusy)return;
  var auditId=button.getAttribute("data-audit-id");
  var action=button.getAttribute("data-action");
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
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return [r.auditId,r.company,r.region,r.scopesText,r.status,r.assignedTo].join(" ").toLowerCase().indexOf(z)>=0}))}
function loadOpen(){return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(!x.success)throw new Error(x.error||x.message||"Read failed");all=x.rows.slice();document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms server";var c=x.counts||{};document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("");render(all);document.getElementById("completedView").style.background="white";document.getElementById("openView").style.background="#dbeafe"}).catch(fail)}
function loadCompleted(){return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){all=(a.rows||[]).map(function(r){return Object.assign({planningWindowText:r.completedDate||r.executedOn||"",requiredHours:r.hoursDedicated||r.hoursPlanned||0,hoursPlanned:r.hoursPlanned||0,assignedTo:r.auditor||""},r)});document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";render(all);document.getElementById("completedView").style.background="#dbeafe";document.getElementById("openView").style.background="white"}).catch(fail)}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(s){if(s.ok&&s.identity)document.getElementById("identity").textContent=s.identity.email}).catch(function(){});
document.getElementById("q").addEventListener("input",filter);
document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};
document.getElementById("openView").onclick=loadOpen;
document.getElementById("completedView").onclick=loadCompleted;
loadOpen();
})();