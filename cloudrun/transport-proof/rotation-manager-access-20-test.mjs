import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
for(const route of ["['/rotation','/rotation-manager-20']","['/rotation.js','/rotation-manager-20.js']","['/api/v1/rotation','/api/v1/rotation-manager-20']"]){
 const i=source.indexOf(route);
 assert.ok(i>=0,'Rotation route absent: '+route);
 const section=source.slice(i,i+450);
 assert.match(section,/\['manager','auditor'\]/,'Auditor access required: '+route);
}
const api=source.slice(source.indexOf("['/api/v1/rotation','/api/v1/rotation-manager-20']"),source.indexOf("if(['GET','POST'].includes(req.method)&&u.pathname==='/api/v1/availability"));
for(const needle of ["const personal=actor.role==='auditor'","result.rows=result.rows.filter(row=>row.auditorUid===uid)","result.issues=[]","result.testDataAvailable=!personal","result.role=personal?'auditor':'manager'"])assert.ok(api.includes(needle),'Missing Rotation auditor read protection: '+needle);
console.log('Rotation Overview auditor-only UID scope and manager route contracts: PASS');
