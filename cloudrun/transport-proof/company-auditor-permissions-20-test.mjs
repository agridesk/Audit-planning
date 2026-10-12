import assert from 'node:assert/strict';
import {validateAuditorCompanyChanges as check} from './company-auditor-permissions-20.js';
assert.deepEqual(check({'Contactperson ':{expected:'Old',value:'New'}}),['Contactperson ']);
assert.deepEqual(check({'Audit planning limitations - hours':{expected:'',value:'08:00-18:00'}}),['Audit planning limitations - hours']);
for(const key of ['Region','Locations_JSON','Comments','Auditor_Exclusions','Company_UID','Status']){
 assert.throws(()=>check({[key]:{expected:'',value:'test'}}),/AUDITOR_COMPANY_FIELDS_FORBIDDEN/);
}
assert.throws(()=>check({'Contactperson e-mail':{expected:'',value:'invalid'}}),/INVALID_EMAIL/);
assert.throws(()=>check({'Audit planning limitations - hours':{expected:'',value:'17:00-12:00'}}),/INVALID_PLANNING_HOURS/);
assert.deepEqual(check({'Preferred_Audit_Months':{expected:'',value:'Jan,Mar,Sep'}}),['Preferred_Audit_Months']);
assert.throws(()=>check({'Preferred_Audit_Months':{expected:'',value:'January'}}),/INVALID_PREFERRED_AUDIT_MONTHS/);
console.log('Auditor Company 2.0 permissions tests passed');
