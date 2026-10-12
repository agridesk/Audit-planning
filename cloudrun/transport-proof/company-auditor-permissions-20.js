// Auditor Company Management 2.0: canonical field permissions.
// Manager-only governance and structural fields must never enter direct Auditor writes.
export const AUDITOR_COMPANY_DIRECT_FIELDS = Object.freeze([
 'Contactperson ',
 'Contactperson e-mail',
 'Contactperson phone',
 'Auditor comments',
 'Preferred_Audit_Months',
 'Audit planning limitations - days',
 'Audit planning limitations - hours'
]);
export function validateAuditorCompanyChanges(changes) {
 const allowed=new Set(AUDITOR_COMPANY_DIRECT_FIELDS);
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw Error('INVALID_COMPANY_CHANGES');
 const keys=Object.keys(changes);
 if(!keys.length||keys.length>allowed.size||keys.some(k=>!allowed.has(k)))throw Error('AUDITOR_COMPANY_FIELDS_FORBIDDEN');
 for(const key of keys){
  const x=changes[key];
  if(!x||typeof x.value!=='string'||typeof x.expected!=='string'||x.value.length>2000)throw Error('INVALID_CHANGE_VALUE');
  if(key==='Contactperson e-mail'&&x.value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.value))throw Error('INVALID_EMAIL');
  if(key==='Preferred_Audit_Months'&&x.value&&!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(,(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))*$/.test(x.value))throw Error('INVALID_PREFERRED_AUDIT_MONTHS');
  if(key==='Audit planning limitations - days'&&x.value&&!/^(Mo|Tu|We|Th|Fr|Sa|Su)(, ?(Mo|Tu|We|Th|Fr|Sa|Su))*$/.test(x.value))throw Error('INVALID_PLANNING_DAYS');
  if(key==='Audit planning limitations - hours'&&x.value){const m=/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.exec(x.value);if(!m||x.value.slice(0,5)>=x.value.slice(6))throw Error('INVALID_PLANNING_HOURS')}
 }
 return keys;
}
