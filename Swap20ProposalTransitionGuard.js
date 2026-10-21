function Swap20_validateTransition_(before,after){
 Swap20_validateImmutable_(before,after);
 var allowed={AWAITING_ACKNOWLEDGEMENT:['AWAITING_ACKNOWLEDGEMENT','CONFIRMED','DECLINED','WITHDRAWN','ESCALATED','CONFLICT'],ESCALATED:['ESCALATED','CONFIRMED','DECLINED','WITHDRAWN','CONFLICT'],CONFIRMED:['CONFIRMED','WITHDRAWN','APPLIED','CONFLICT'],DECLINED:[],WITHDRAWN:[],APPLIED:[],CONFLICT:[]};
 if(!allowed[before.status]||allowed[before.status].indexOf(after.status)<0)throw Error('Invalid swap transition');
 var old=before.acknowledgedAuditorUids||[],next=after.acknowledgedAuditorUids||[],required=before.requiredAuditorUids||[];
 if(!Array.isArray(next)||old.some(function(x){return next.indexOf(x)<0;})||next.some(function(x){return required.indexOf(x)<0;})||new Set(next).size!==next.length)throw Error('Invalid acknowledgements');
 if(after.status==='CONFIRMED'&&required.some(function(x){return next.indexOf(x)<0;}))throw Error('Acknowledgement incomplete');
 return true;
}
