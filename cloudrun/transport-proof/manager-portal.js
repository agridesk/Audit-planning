(function(){
"use strict";
var all=[];
var currentView="open";
var openCounts={total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0};
var busyAudits=new Set();
var enrichmentSeq=0;
var relay={frame:null,nonce:'',source:null,origin:'',ready:false,error:'',initPromise:null,readyResolver:null,pending:new Map(),seq:0};

function esc(v){var d=document.createElement("div");d.textContent=v==null?"":v;return d.innerHTML}
function text(v){return v==null||v===""?"-":String(v)}
function displayStatus(v){var s=String(v==null?"":v).trim().toLowerCase();return s==="approved"?"Pending acceptance":text(v)}
function hoursClass(expected,actual){var e=Number(expected),a=Number(actual);if(!isFinite(e)||!isFinite(a))return "";if(Math.abs(a-e)<0.001)return "hours-match";return a<e?"hours-under":"hours-over"}
function bucketKey(statusKey){return statusKey==="PENDING_PLANNING"?"pendingPlanning":statusKey==="PENDING_APPROVAL"?"pendingApproval":statusKey==="APPROVED"?"approved":statusKey==="ACCEPTED"?"accepted":""}
function expectedStatus(action){return action==="cancel"?"PENDING_PLANNING":action==="reject"?"REJECTED":action==="approve"?"ACCEPTED":""}
function latestCommentText(r){if(!r.latestComment)return "";var actor=r.latestCommentActor||"",action=r.latestCommentAction||"";return (actor?actor+(action?" · "+action:"")+": ":"")+r.latestComment}
function compactDate(v){var s=String(v==null?"":v).trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+"-"+m[2]+"-"+m[1]:s}
function effectiveExpiry(r){return r.effectiveExpiry||r.expiryEffective||(r.extensionApplied||r.extApplied?r.expiryZ:r.expiryY)||r.expirationDate||r.expiry||""}
function locationText(r){var x=r.locationsToPlan||r.locs||r.locations||r.locationCount||r.location||r.companyLocation||"";if(Array.isArray(x))return x.map(function(z){return typeof z==="string"?z:(z&&z.label)||""}).filter(Boolean).join(", ");if(typeof x==="object"&&x){if(Array.isArray(x.locations))return x.locations.map(function(z){return z.label||z.location||z.name||""}).filter(Boolean).join(", ");return x.label||x.location||x.name||""}return String(x||"")}
function gpsValue(r){var lat=r.lat!=null?r.lat:r.latitude,lon=r.lon!=null?r.lon:(r.lng!=null?r.lng:r.longitude);if(lat!==undefined&&lat!==null&&String(lat).trim()!==""&&lon!==undefined&&lon!==null&&String(lon).trim()!=="")return String(lat)+","+String(lon);var g=r.gps||r.gpsData||r.coordinates||"";if(typeof g==="object"&&g){if(g.lat!=null&&g.lng!=null)return String(g.lat)+","+String(g.lng);if(g.lat!=null&&g.lon!=null)return String(g.lat)+","+String(g.lon);if(g.latitude!=null&&g.longitude!=null)return String(g.latitude)+","+String(g.longitude);if(g.url)return String(g.url)}return String(g||"").trim()}
function mapCell(r){var g=gpsValue(r);if(!g)return "<td class=\"map-cell muted\">-</td>";var href=/^https?:\/\//i.test(g)?g:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(g);return "<td class=\"map-cell\"><a class=\"map-link\" href=\""+esc(href)+"\" target=\"_blank\" rel=\"noopener\" title=\""+esc(g)+"\">Map</a></td>"}
function planning2Cell(r){var bits=["<a class=\"workspace-link\" href=\"/planning?auditId="+encodeURIComponent(r.auditId||"")+"\" title=\"Open this audit in Single Planning 2.0\">Open</a>"];if(r.conceptMonth)bits.push("<span class=\"planning-chip concept\" title=\"Concept only — not committed\">Concept "+esc(r.conceptMonth)+"</span>");var p=Number(r.provisionalReservationCount||0),c=Number(r.confirmedReservationCount||0);if(p>0)bits.push("<span class=\"planning-chip provisional\" title=\"Provisional workload — not committed planning\">Provisional"+(p>1?" ×"+p:"")+"</span>");if(c>0)bits.push("<span class=\"planning-chip reservation\" title=\"Reservation context — separate from committed planning\">Reserved"+(c>1?" ×"+c:"")+"</span>");return bits.join(" ")}
function alertCell(r){if(!r.latestComment)return "<td class=\"alert-cell\"></td>";var action=String(r.latestCommentAction||"").toUpperCase(),cls=action==="REJECT"?"alert-icon alert-critical":"alert-icon alert-info",title=(r.latestCommentTimestamp?String(r.latestCommentTimestamp)+" · ":"")+latestCommentText(r);return "<td class=\"alert-cell\"><span class=\""+cls+"\" title=\""+esc(title)+"\" aria-label=\""+esc(title)+"\" tabindex=\"0\">!</span></td>"}
function renderCards(){var c=openCounts||{};document.getElementById("cards").innerHTML=[["Pending planning",c.pendingPlanning],["Pending approval",c.pendingApproval],["Pending acceptance",c.approved],["Pending completion",c.accepted]].map(function(z){return "<div class=card><div>"+z[0]+"</div><div class=n>"+(z[1]||0)+"</div></div>"}).join("")}
function adjustCounters(beforeKey,afterKey){if(beforeKey===afterKey)return;var b=bucketKey(beforeKey),a=bucketKey(afterKey);if(b)openCounts[b]=Math.max(0,Number(openCounts[b]||0)-1);if(a)openCounts[a]=Number(openCounts[a]||0)+1;if(b&&!a)openCounts.total=Math.max(0,Number(openCounts.total||0)-1);if(!b&&a)openCounts.total=Number(openCounts.total||0)+1;renderCards()}
function renderHead(){var h=document.getElementById("gridHead");if(!h)return;if(currentView==="completed")h.innerHTML="<tr><th>Company</th><th>Region</th><th>Scopes</th><th>Executed on</th><th>Auditor</th><th>Hours planned</th><th>Hours dedicated</th><th>Completed date</th><th>Status</th></tr>";else h.innerHTML="<tr><th>Company</th><th>Locations</th><th>Region</th><th>GPS / Map</th><th>Scopes</th><th>Status</th><th>Expiration date</th><th>Planning window</th><th>Self planning</th><th>Date planned</th><th>To be planned</th><th>Hours planned</th><th>Auditor</th><th class=\"alert-head\">Alert</th><th>Actions</th></tr>"}
function extensionControls(r){var months=Number(r.extensionMonths||r.extMonths||0),applied=!!(r.extensionApplied||r.extApplied),pending=r.statusKey==="PENDING_PLANNING",can=!!r.canExtend||months>0;if(!pending)return "";if(applied)return " <button class=\"ext-act\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"undo\" title=\"Restore canonical planning window\">Undo extension</button>";if(!can||months<=0)return "";return " <button class=\"ext-act\" data-audit-id=\""+esc(r.auditId)+"\" data-extension=\"apply\" title=\"Apply canonical planning-window extension\">+"+esc(months)+" mo</button>"}
function renderOpenRow(r){var raw=r.allowedActions||[],ui=[];if(raw.indexOf("PLAN")>=0)ui.push({key:"plan",label:"Plan"});if(raw.indexOf("APPROVE")>=0)ui.push({key:"approve",label:"Approve"});if(raw.indexOf("ACCEPT")>=0)ui.push({key:"accept",label:"Accept"});if(raw.indexOf("CANCEL")>=0)ui.push({key:"cancel",label:"Cancel"});if(raw.indexOf("REJECT")>=0)ui.push({key:"reject",label:"Reject"});var actions=ui.map(function(a){return "<button class=\"act\" data-audit-id=\""+esc(r.auditId)+"\" data-action=\""+esc(a.key)+"\">"+esc(a.label)+"</button>"}).join(""),formalClass=hoursClass(r.requiredHours,r.hoursPlanned),scheduled=Number(r.scheduledHours),scheduledNote=isFinite(scheduled)&&r.scheduledHours!==""?"<div class=\"cell-sub\">scheduled "+esc(text(r.scheduledHours))+" h</div>":"",loc=locationText(r),self=r.allowSelfPlanning===true||String(r.allowSelfPlanning).toLowerCase()==="true"?"Yes":"No",windowText=r.planningWindowText||([r.planningWindowFrom,r.planningWindowTo].filter(Boolean).join(" → "));return "<tr data-audit-id=\""+esc(r.auditId)+"\"><td class=\"company-cell\">"+esc(text(r.company))+"</td><td class=\"locations-cell\" title=\""+esc(loc)+"\">"+esc(text(loc))+"</td><td>"+esc(text(r.region))+"</td>"+mapCell(r)+"<td class=\"scopes-cell\">"+esc(text(r.scopesText))+"</td><td>"+esc(displayStatus(r.status))+"</td><td>"+esc(text(compactDate(effectiveExpiry(r))))+"</td><td class=\"window-cell\"><span>"+esc(text(windowText))+"</span>"+extensionControls(r)+"</td><td>"+self+"</td><td>"+esc(text(compactDate(r.datePlanned)))+"</td><td>"+esc(text(r.requiredHours))+"</td><td class=\""+formalClass+"\">"+esc(text(r.hoursPlanned))+scheduledNote+"</td><td>"+esc(text(r.assignedToDisplayName||r.auditorDisplayName||r.assignedTo||r.auditor))+"</td>"+alertCell(r)+"<td class=\"actions-cell\">"+actions+"</td></tr>"}
function renderOpen(rows){return rows.map(renderOpenRow).join("")}
function renderCompleted(rows){return rows.map(function(r){return "<tr><td>"+esc(text(r.company))+"</td><td>"+esc(text(r.region))+"</td><td>"+esc(text(r.scopesText))+"</td><td>"+esc(text(r.executedOn))+"</td><td>"+esc(text(r.auditorDisplayName||r.auditorName||r.auditor))+"</td><td>"+esc(text(r.hoursPlanned))+"</td><td>"+esc(text(r.hoursDedicated))+"</td><td>"+esc(text(r.completedDate))+"</td><td>"+esc(text(r.status||"Completed"))+"</td></tr>"}).join("")}
function bindActionButtons(root){(root||document).querySelectorAll(".act").forEach(function(button){button.addEventListener("click",function(){runAction(button)})});(root||document).querySelectorAll(".ext-act").forEach(function(button){button.addEventListener("click",function(){runExtension(button)})})}
function render(rows){renderHead();var body=document.getElementById("rows");if(!rows.length){body.innerHTML="<tr><td class=\"empty\" colspan=\""+(currentView==="completed"?"9":"15")+"\">No audits found</td></tr>";return}body.innerHTML=currentView==="completed"?renderCompleted(rows):renderOpen(rows);if(currentView==="open")bindActionButtons(body)}
function replaceVisibleRow(auditId,row){var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(!tr)return;tr.outerHTML=renderOpenRow(row);var fresh=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(fresh)bindActionButtons(fresh)}
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
  return fetch('/api/v1/manager/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,action:action,options:options||{}})})
    .then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.detail||x.message||'Action failed');return{result:x,relayElapsedMs:Math.round(performance.now()-started),trace:{requestId:'cr'+Date.now()}}})})
}
function removeRejectedRowInPlace(auditId,perf){
  var idx=all.findIndex(function(r){return r.auditId===auditId});if(idx<0)return;
  var before=all[idx],beforeKey=before.statusKey,scrollX=window.scrollX,scrollY=window.scrollY,t=performance.now();
  all.splice(idx,1);
  var tr=document.querySelector('tr[data-audit-id="'+CSS.escape(auditId)+'"]');if(tr)tr.remove();
  adjustCounters(beforeKey,'REJECTED');window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt)
}
function patchActionLikeV1(auditId,action,reason,result,perf){
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
    after.hoursPlanned='';after.plannedHours='';after.scheduledHours='';after.planningJson='';after.planningSummary=null;after.plannedDates=[];after.plannedTooltip='';
    after.managerComment=reason;after.managerDecision='CANCEL';after.latestComment=reason;after.latestCommentActor='Manager';after.latestCommentAction='CANCEL'
  }
  all[idx]=after;replaceVisibleRow(auditId,after);adjustCounters(beforeKey,after.statusKey);window.scrollTo(scrollX,scrollY);
  perf.patchMs=Math.round(performance.now()-t);perf.totalMs=Math.round(performance.now()-perf.startedAt)
}
function runAction(button){
  var auditId=button.getAttribute("data-audit-id"),action=button.getAttribute("data-action"),row=all.find(function(r){return r.auditId===auditId});
  if(busyAudits.has(auditId))return;
  if(action==="plan"){window.location.href="/planning?auditId="+encodeURIComponent(auditId);return}
  var reason="";
  if(action==="cancel"||action==="reject"){
    reason=window.prompt((action==="cancel"?"Cancel":"Reject")+" audit "+auditId+"\nComment:");
    if(reason===null)return;reason=reason.trim();if(!reason){window.alert("Comment is required.");return}
  }else if(action!=="accept"&&!window.confirm(action.toUpperCase()+" audit "+auditId+"?"))return;
  busyAudits.add(auditId);
  var tr=button.closest("tr");if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=true});
  var perf={auditId:auditId,action:action,startedAt:performance.now(),workerMs:0,gasMs:null,patchMs:0},wt=performance.now(),options={reason:reason,comment:reason,rowIndex:row&&row.sourceRow,expectedRevision:row&&row.sourceRevision};
  var actionPromise=(action==='approve'||action==='accept'||action==='cancel'||action==='reject')?runActionViaCloudRun(auditId,action,options):runActionViaWarmWorker(auditId,action,options);
  actionPromise
    .then(function(x){
      perf.workerMs=Math.round(performance.now()-wt);
      var wr=x.result||{},gas=Number(wr&&wr.perf&&wr.perf.managerActionAdapterMs),trace=x.trace||{},nowEpoch=Date.now();
      if(isFinite(gas))perf.gasMs=Math.round(gas);
      if(wr&&(wr.owner==='CLOUD_RUN_DIRECT_MANAGER_APPROVE'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_CANCEL'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_REJECT'))perf.cloudRunMs=Number(wr.totalMs)||null;
      perf.traceId=String(trace.requestId||wr&&wr.perf&&wr.perf.requestId||'');
      perf.browserToWorkerMs=(trace.workerReceivedAt&&trace.clientSentAt)?Math.max(0,Number(trace.workerReceivedAt)-Number(trace.clientSentAt)):null;
      perf.workerPreRpcMs=(trace.rpcStartedAt&&trace.workerReceivedAt)?Math.max(0,Number(trace.rpcStartedAt)-Number(trace.workerReceivedAt)):null;
      perf.workerRpcWallMs=(trace.rpcEndedAt&&trace.rpcStartedAt)?Math.max(0,Number(trace.rpcEndedAt)-Number(trace.rpcStartedAt)):Number(x.relayElapsedMs)||null;
      perf.workerToBrowserMs=trace.replyAt?Math.max(0,nowEpoch-Number(trace.replyAt)):null;
      patchActionLikeV1(auditId,action,reason,wr,perf);
      var st=wr&&wr.statusPerf||{},core=wr&&wr.actionPerf||{};
      perf.statusPerf=st;perf.actionPerf=core;
      var coreDetail="avail "+(core.availabilityMs==null?"-":core.availabilityMs)+" / reset "+(core.resetPlanningMs==null?"-":core.resetPlanningMs)+" / statuswrite "+(core.statusWriteMs==null?"-":core.statusWriteMs)+" / lifecycle "+(core.lifecycleMs==null?"-":core.lifecycleMs)+" / cache "+(core.cacheInvalidationMs==null?"-":core.cacheInvalidationMs)+(core.archiveMs==null?"":" / archive "+core.archiveMs);
      document.getElementById("status").textContent=wr&&(wr.owner==='CLOUD_RUN_DIRECT_MANAGER_APPROVE'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_CANCEL'||wr.owner==='CLOUD_RUN_DIRECT_MANAGER_REJECT')
        ? Number(openCounts.total||all.length)+" open audits · "+String(action||"").toUpperCase()+" "+perf.totalMs+" ms (Cloud Run "+(perf.cloudRunMs==null?"-":perf.cloudRunMs)+" · read "+(wr.readMs==null?"-":wr.readMs)+" · archive "+(wr.archiveMs==null?"-":wr.archiveMs)+" · write "+(wr.writeMs==null?"-":wr.writeMs)+" · delete "+(wr.deleteMs==null?"-":wr.deleteMs)+" · queue "+(wr.sideEffectMs==null?"-":wr.sideEffectMs)+" · availability rows "+(wr.availabilityRows==null?"-":wr.availabilityRows)+" · patch "+perf.patchMs+")"
        : Number(openCounts.total||all.length)+" open audits · action "+perf.totalMs+" ms (worker "+perf.workerMs+" · GAS "+(perf.gasMs==null?"-":perf.gasMs)+" · b→w "+(perf.browserToWorkerMs==null?"-":perf.browserToWorkerMs)+" · preRPC "+(perf.workerPreRpcMs==null?"-":perf.workerPreRpcMs)+" · RPC "+(perf.workerRpcWallMs==null?"-":perf.workerRpcWallMs)+" · w→b "+(perf.workerToBrowserMs==null?"-":perf.workerToBrowserMs)+" · status "+(st.totalMs==null?"-":st.totalMs)+" [guard "+(st.writeGuardMs==null?"-":st.writeGuardMs)+" / load "+(st.loadAuditMs==null?"-":st.loadAuditMs)+" / core "+(st.coreMs==null?"-":st.coreMs)+" / notify "+(st.notificationOnlyMs==null?"-":st.notificationOnlyMs)+"] · "+coreDetail+" · patch "+perf.patchMs+" · trace "+(perf.traceId||"-")+")";
      console.info("[MANAGER_ACTION_TIMING]",perf)
    })
    .catch(function(e){
      window.alert('Canonical action failed: '+e.message);
      if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=false});
      if(String(e&&e.message||'').indexOf('ACTION_RELAY')>=0)resetRelayWorker()
    })
    .finally(function(){busyAudits.delete(auditId)})
}
function extensionAppliedState(r){return !!(r&&(r.extensionApplied||r.extApplied))}
function recoverExtension(auditId,command,sx,sy,started){return rereadEnrichedAudit(auditId).then(function(patch){var expected=command==='apply';if(extensionAppliedState(patch)!==expected)throw new Error('CANONICAL_EXTENSION_NOT_COMMITTED');mergeRowInPlace(auditId,patch);window.scrollTo(sx,sy);document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · extension "+command+" "+Math.round(performance.now()-started)+" ms · canonical recovery";return patch})}
function runExtension(button){var auditId=button.getAttribute("data-audit-id"),command=button.getAttribute("data-extension");if(busyAudits.has(auditId))return;var row=all.find(function(r){return r.auditId===auditId});if(!row)return;if(!window.confirm((command==="undo"?"Undo":"Apply")+" planning-window extension for "+row.company+"?"))return;busyAudits.add(auditId);var tr=button.closest("tr"),sx=window.scrollX,sy=window.scrollY,started=performance.now();if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=true});fetch('/api/v1/manager/extension',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditId:auditId,command:command})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Extension failed');return x})}).then(function(x){if(!x.patch)throw new Error('EXTENSION_PATCH_MISSING');mergeRowInPlace(auditId,x.patch);window.scrollTo(sx,sy);document.getElementById("status").textContent=Number(openCounts.total||all.length)+" open audits · extension "+command+" "+Math.round(performance.now()-started)+" ms"}).catch(function(e){return recoverExtension(auditId,command,sx,sy,started).catch(function(){window.alert('Extension failed: '+e.message);if(tr)tr.querySelectorAll(".act,.ext-act").forEach(function(b){b.disabled=false})})}).finally(function(){busyAudits.delete(auditId)})}
function searchable(r){if(currentView==="completed")return[r.auditId,r.company,r.region,r.scopesText,r.status,r.auditor,r.executedOn,r.completedDate,r.hoursPlanned,r.hoursDedicated].join(" ").toLowerCase();return[r.auditId,r.company,locationText(r),r.region,r.scopesText,r.status,r.assignedTo,r.planningWindowText,r.requiredHours,r.hoursPlanned,r.scheduledHours,r.datePlanned,effectiveExpiry(r),r.conceptMonth,r.hasProvisionalPlanning?"provisional":"",r.latestComment].join(" ").toLowerCase()}
function filter(){var z=document.getElementById("q").value.toLowerCase().trim();render(!z?all:all.filter(function(r){return searchable(r).indexOf(z)>=0}))}
function setTabs(){document.getElementById("completedView").style.background=currentView==="completed"?"#dbeafe":"white";document.getElementById("openView").style.background=currentView==="open"?"#dbeafe":"white"}
function loadOpenEnrichment(seq){var ids=all.map(function(r){return r.auditId}).filter(Boolean),sx=window.scrollX,sy=window.scrollY;if(!ids.length)return Promise.resolve();var started=performance.now();return fetch('/api/v1/manager/open-enrichment',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({auditIds:ids})}).then(function(r){return r.json().then(function(x){if(!r.ok||x.success===false)throw new Error(x.error||x.message||'Open audit enrichment failed');return x})}).then(function(x){if(seq!==enrichmentSeq||currentView!=="open")return;var by={};(x.rows||[]).forEach(function(r){if(r&&r.auditId)by[r.auditId]=r});all.forEach(function(r,i){if(by[r.auditId])all[i]=Object.assign({},r,by[r.auditId])});filter();window.scrollTo(sx,sy);var ms=Math.round(performance.now()-started);document.getElementById("status").textContent=all.length+" open audits · decision-ready "+ms+" ms enrichment"}).catch(function(e){if(seq!==enrichmentSeq)return;console.warn('[OPEN_AUDITS_ENRICHMENT]',e);document.getElementById("status").textContent=all.length+" open audits · base loaded; enrichment unavailable"})}
function loadOpen(){currentView="open";var seq=++enrichmentSeq;return fetch("/api/v1/manager/open",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(!x.success)throw new Error(x.error||x.message||"Read failed");all=x.rows.slice();openCounts=Object.assign({total:all.length,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0},x.counts||{});document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" open audits · "+x.serverMs+" ms base";renderCards();setTabs();filter();return loadOpenEnrichment(seq)}).catch(fail)}
function loadCompleted(){currentView="completed";++enrichmentSeq;return fetch("/api/v1/manager/archived",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(a){if(a.success===false)throw new Error(a.error||a.message||"Read failed");all=(a.rows||[]).slice();document.getElementById("status").className="";document.getElementById("status").textContent=all.length+" completed audits · "+a.serverMs+" ms server";document.getElementById("cards").innerHTML="";setTabs();filter()}).catch(fail)}
function fail(e){var z=document.getElementById("status");z.className="err";z.textContent=e.message}
fetch("/api/v1/session",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(s){if(s.ok&&s.identity)document.getElementById("identity").textContent=s.identity.email}).catch(function(){});
document.getElementById("q").addEventListener("input",filter);document.getElementById("reset").onclick=function(){document.getElementById("q").value="";render(all)};document.getElementById("openView").onclick=loadOpen;document.getElementById("completedView").onclick=loadCompleted;var workspace=document.getElementById("planningWorkspace");if(workspace){workspace.disabled=true;workspace.title="Open Single Planning from an audit row; no canonical Planning Workspace overview route is available yet"}
initRelay().catch(function(e){console.warn('[WARM_GAS_WORKER_INIT]',e)});
loadOpen();
})();