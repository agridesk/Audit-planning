// DEV-only isolated proposal/confirmation decision policy.
// Based on AMS Master Roadmap V2.12 PROPOSED §16; NOT wired to routes or PROD.
const RESPONSE_TYPES=new Set(['ACCEPT','ACCEPT_WITH_FLEXIBILITY','ALTERNATIVE','WINDOW_UNAVAILABLE']);
function dateOnly(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))?s:null;}
function timeOnly(s){return typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s:null;}
function slotValid(s){return !!(s&&dateOnly(s.date)&&timeOnly(s.start)&&timeOnly(s.end)&&s.start<s.end&&typeof s.location==='string'&&s.location.trim());}
function rangeValid(r){return !!(r&&dateOnly(r.from)&&dateOnly(r.to)&&r.from<=r.to&&timeOnly(r.earliestStart)&&timeOnly(r.latestFinish)&&r.earliestStart<r.latestFinish);}
function slotWithin(slot,flex){if(!slotValid(slot)||!flex)return false;return Array.isArray(flex.allowedSlots)&&flex.allowedSlots.some(s=>slotValid(s)&&s.date===slot.date&&s.start<=slot.start&&s.end>=slot.end&&s.location===slot.location)||Array.isArray(flex.ranges)&&flex.ranges.some(r=>rangeValid(r)&&r.from<=slot.date&&slot.date<=r.to&&r.earliestStart<=slot.start&&slot.end<=r.latestFinish&&(!r.location||r.location===slot.location));}
export function evaluateCustomerResponse(proposal,response){
 if(!proposal||!slotValid(proposal.slot)||!proposal.version||!proposal.visitId)return {ok:false,code:'INVALID_PROPOSAL'};
 if(!response||!RESPONSE_TYPES.has(response.type))return {ok:false,code:'INVALID_RESPONSE'};
 if(response.proposalVersion!==proposal.version||response.visitId!==proposal.visitId)return {ok:false,code:'STALE_PROPOSAL'};
 if(!['CUSTOMER_LINK','MANAGER_ON_BEHALF'].includes(response.channel)||!response.actor||!response.timestamp)return {ok:false,code:'RESPONSE_PROVENANCE_REQUIRED'};
 if(response.type==='ACCEPT')return {ok:true,confirmed:true,flexibility:{allowedSlots:[proposal.slot],ranges:[]},commitsPlanning:false};
 if(response.type==='ACCEPT_WITH_FLEXIBILITY'){
   const f=response.flexibility||{};
   if(!Array.isArray(f.allowedSlots)||!Array.isArray(f.ranges)||f.allowedSlots.some(s=>!slotValid(s))||f.ranges.some(r=>!rangeValid(r))||!slotWithin(proposal.slot,f))return {ok:false,code:'INVALID_FLEXIBILITY'};
   return {ok:true,confirmed:true,flexibility:f,commitsPlanning:false};
 }
 if(response.type==='ALTERNATIVE'){
   if(!response.alternative||!slotValid(response.alternative))return {ok:false,code:'ALTERNATIVE_REQUIRED'};
   return {ok:true,confirmed:false,alternative:response.alternative,commitsPlanning:false};
 }
 return {ok:true,confirmed:false,windowUnavailable:true,commitsPlanning:false};
}
export function evaluateFinalSlot(proposal,response,finalSlot,{confirmationRequired=true}={}){
 if(!slotValid(finalSlot))return {allowed:false,code:'INVALID_FINAL_SLOT'};
 if(!confirmationRequired)return {allowed:true,code:'CONFIRMATION_NOT_REQUIRED'};
 const result=evaluateCustomerResponse(proposal,response);
 if(!result.ok)return {allowed:false,code:result.code};
 if(!result.confirmed)return {allowed:false,code:'CUSTOMER_CONFIRMATION_REQUIRED'};
 return slotWithin(finalSlot,result.flexibility)?{allowed:true,code:'WITHIN_CONFIRMED_FLEXIBILITY'}:{allowed:false,code:'NEW_CUSTOMER_CONFIRMATION_REQUIRED'};
}
export function eligibleProposalReminders(items){
 return (Array.isArray(items)?items:[]).filter(x=>x&&x.sent===true&&!x.responseReceived&&x.deadlinePassed!==true);
}
