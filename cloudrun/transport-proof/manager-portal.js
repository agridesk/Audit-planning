(function(){
"use strict";
var all=[];
function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function render(rows){
  document.getElementById("rows").innerHTML=rows.map(function(r){
    var actions=(r.allowedActions||[]).filter(function(a){return a!=="PLAN"}).map(function(a){
      return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.toLowerCase())+"\">"+esc(a)+"</button>";
    }).join("");
    return "<tr><td>"+esc(r.company)+"</td><td>"+esc(r.region)+"</td><td>"+esc(r.scopesText)+"</td><td>"+esc(r.status)+"</td><td>"+esc(r.planningWindowText)+"</td><td>"+esc(r.requiredHours)+"</td><td>"+esc(r.hoursPlanned)+"</td><td>"+esc(r.assignedTo)+"</td><td>"+actions+"</td></tr>";
  }).join("");
  document.querySelectorAll(".act").forEach(function(button){
    button.addEventListener("click",function(){runAction(button)});
  });
}
function runAction(button){
  var auditId=button.getAttribute("data-audit-id");
  var action=button.getAttribute("data-action");
  if(!window.confirm(action.toUpperCase()+" audit "+auditId+"?"))return;
  document.querySelectorAll(".act").forEach(function(b){b.disabled=true});
  fetch("/api/v1/manager/action",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({auditId:auditId,action:action,options:{}})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false||x.ok===false)throw new Error(x.message||x.error||"Action failed");return x})})
    .then(loadOpen)
    .catch(function(e){window.alert(e.message);document.querySelectorAll(".act").forEach(function(b){b.disabled=false})});
}
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return [r.company,r.region,r.scopesText,r.status,r.assignedTo].join(" ").toLowerCase().indexOf(z)>=0}))}
function loadOpen(){fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(!x.success)throw new Error(x.error||x.message||"Read failed");all=x.rows.slice();document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms server";var c=x.counts||{};document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("");render(all);document.getElementById("completedView").style.background="white";document.getElementById("openView").style.background="#dbeafe"}).catch(fail)}
function loadCompleted(){fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){all=(a.rows||[]).map(function(r){return Object.assign({planningWindowText:r.completedDate||r.executedOn||"",requiredHours:r.hoursDedicated||r.hoursPlanned||0,hoursPlanned:r.hoursPlanned||0,assignedTo:r.auditor||""},r)});document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";render(all);document.getElementById("completedView").style.background="#dbeafe";document.getElementById("openView").style.background="white"}).catch(fail)}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(s){if(s.ok&&s.identity)document.getElementById("identity").textContent=s.identity.email}).catch(function(){});
document.getElementById("q").addEventListener("input",filter);
document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};
document.getElementById("openView").onclick=loadOpen;
document.getElementById("completedView").onclick=loadCompleted;
loadOpen();
})();